/**
 * Error Analyzer — Claude API integration for root cause analysis & fix generation
 *
 * Takes an error event (log lines + source files) and asks Claude to:
 *   1. Identify the root cause
 *   2. Produce a minimal, safe code fix
 *   3. Return structured JSON with search/replace blocks
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { extractStackFiles } from './errorClassifier.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// ── Files that must NEVER be modified ─────────────────────────────────────
const BLOCKED_FILE_PATTERNS = [
    /\.env/,
    /config\//,
    /models\//,            // DB schemas — too risky
    /deploy\//,
    /scripts\//,
    /index\.js$/,          // Main entry point
    /package\.json$/,
    /package-lock\.json$/,
    /node_modules\//,
    /ecosystem\./,
    /\.yml$/,
    /\.yaml$/,
    /\.sh$/,
];

// ── Files that ARE allowed to be modified ─────────────────────────────────
const ALLOWED_DIRS = [
    '/backend/routes/',
    '/backend/agents/',
    '/backend/services/',
    '/backend/utils/',
    '/backend/ai/',
    '/backend/mcp/',
    '/backend/middleware/',
];

function isFileAllowed(filePath) {
    if (BLOCKED_FILE_PATTERNS.some(p => p.test(filePath))) return false;
    if (ALLOWED_DIRS.some(dir => filePath.includes(dir))) return true;
    return false;
}

/**
 * Extract meaningful keywords from error text for codebase searching.
 * Pulls model names, route paths, identifiers that might appear in source files.
 */
function extractErrorKeywords(errorText) {
    const keywords = [];

    // Model names (e.g., claude-3-5-sonnet-latest, gpt-4o, seedance-2.0)
    const modelMatches = errorText.match(/\b(claude-[\w.-]+|gpt-[\w.-]+|gemini-[\w.-]+|seedance-[\w.-]+|kling-[\w.-]+)\b/gi);
    if (modelMatches) keywords.push(...new Set(modelMatches));

    // API route paths (e.g., /api/video-studio/advanced/generate)
    const routeMatches = errorText.match(/\/api\/[\w/-]+/g);
    if (routeMatches) keywords.push(...new Set(routeMatches));

    // Specific error identifiers (function names, variable names after "is not defined")
    const undefMatch = errorText.match(/(\w+)\s+is not defined/);
    if (undefMatch) keywords.push(undefMatch[1]);

    // Provider names from log context
    const providerMatch = errorText.match(/\[(\w+)\]\s*(?:API\s*)?Error/i);
    if (providerMatch) keywords.push(providerMatch[1].toLowerCase());

    return keywords.filter(k => k.length >= 4); // Skip tiny keywords
}

/**
 * Search the codebase for files containing a keyword.
 * Uses synchronous grep for simplicity. Returns [{file, line}].
 */
function grepCodebase(keyword, appRoot) {
    const results = [];
    
    // Search only in allowed backend directories
    const searchDirs = ALLOWED_DIRS.map(d => path.join(appRoot, d.replace(/^\//, ''))).filter(d => fs.existsSync(d));
    
    for (const dir of searchDirs) {
        try {
            // grep -rnl: recursive, line numbers, files-with-matches
            const output = execSync(
                `grep -rn --include="*.js" -l "${keyword.replace(/"/g, '\\"')}" "${dir}"`,
                { encoding: 'utf-8', timeout: 5000 }
            ).trim();
            
            if (output) {
                for (const filePath of output.split('\n').filter(Boolean).slice(0, 3)) {
                    // Find the actual line number
                    try {
                        const lineOutput = execSync(
                            `grep -n "${keyword.replace(/"/g, '\\"')}" "${filePath}" | head -1`,
                            { encoding: 'utf-8', timeout: 3000 }
                        ).trim();
                        const lineMatch = lineOutput.match(/^(\d+):/);
                        results.push({ file: filePath, line: lineMatch ? parseInt(lineMatch[1]) : 1 });
                    } catch {
                        results.push({ file: filePath, line: 1 });
                    }
                }
            }
        } catch {
            // grep returns exit code 1 when no matches — ignore
        }
    }

    return results;
}

/**
 * Read source file contents, with a window around the error line.
 * @param {string} filePath - Absolute path to the file
 * @param {number} errorLine - The line number where the error occurred
 * @param {number} windowSize - Number of lines to include before/after
 * @returns {string|null}
 */
function readSourceContext(filePath, errorLine = 0, windowSize = 80) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        if (errorLine > 0 && lines.length > windowSize * 2) {
            const start = Math.max(0, errorLine - windowSize);
            const end = Math.min(lines.length, errorLine + windowSize);
            return lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join('\n');
        }

        // If file is small enough, return all of it
        if (lines.length <= 300) {
            return lines.map((l, i) => `${i + 1}: ${l}`).join('\n');
        }

        // Large file: return first 150 + error area
        const head = lines.slice(0, 150).map((l, i) => `${i + 1}: ${l}`).join('\n');
        if (errorLine > 150) {
            const start = Math.max(150, errorLine - windowSize);
            const end = Math.min(lines.length, errorLine + windowSize);
            const area = lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join('\n');
            return `${head}\n\n... [lines ${151}-${start} omitted] ...\n\n${area}`;
        }
        return head;
    } catch {
        return null;
    }
}

// ── System prompt for Claude ──────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a senior Node.js/Express backend engineer performing production bug fixes for Mantram AI, a marketing SaaS platform.

You will receive:
1. An error log from PM2 (stderr/stdout)
2. The relevant source file(s) with line numbers

Your job is to:
1. Identify the exact root cause of the error
2. Produce a MINIMAL, SAFE fix — change as few lines as possible
3. Return a structured JSON response

RULES — FOLLOW STRICTLY:
- Only fix the specific bug. Do NOT refactor, rename, or improve unrelated code.
- Never modify .env, config, database schemas (models/), deployment scripts, or index.js.
- Always add proper null/undefined guards when the error involves missing properties.
- Use try/catch for operations that could throw (JSON.parse, API calls, etc.).
- Match the existing code style EXACTLY (ES modules, arrow functions, template literals).
- The search content must match the file EXACTLY (including whitespace and indentation).
- Keep fixes under 50 lines of changes total.
- If you are NOT confident you can fix the bug correctly, set "canFix" to false.

RESPONSE FORMAT — Return ONLY valid JSON, no markdown or explanation outside the JSON:
{
  "canFix": true,
  "rootCause": "One-line description of what's causing the error",
  "explanation": "2-3 sentence explanation of the fix",
  "confidence": 0.85,
  "changes": [
    {
      "file": "/absolute/path/to/file.js",
      "search": "exact content to find (multi-line ok, must match file exactly)",
      "replace": "replacement content with the fix applied"
    }
  ]
}

If you cannot fix it, return:
{
  "canFix": false,
  "rootCause": "...",
  "explanation": "Why this can't be auto-fixed: ...",
  "confidence": 0,
  "changes": []
}`;

/**
 * Analyze an error event using Claude API and return structured fix information.
 *
 * @param {object} errorEvent - { errorText, category, hash }
 * @param {object} options - { apiKey, model, appRoot }
 * @returns {Promise<object>} - { canFix, rootCause, explanation, confidence, changes }
 */
export async function analyzeError(errorEvent, options = {}) {
    const {
        apiKey = process.env.ANTHROPIC_API_KEY,
        model = process.env.AUTOFIX_MODEL || 'claude-sonnet-4-20250514',
        appRoot = process.env.AUTOFIX_APP_ROOT || '/home/ec2-user/Mantram',
    } = options;

    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not set');
    }

    // ── 1. Gather source context from stack trace ─────────────────────────
    const stackFiles = extractStackFiles(errorEvent.errorText);
    const sourceContexts = [];

    for (const sf of stackFiles.slice(0, 3)) { // Max 3 files to keep token count sane
        // Try the absolute path first, then resolve relative to appRoot
        let content = readSourceContext(sf.file, sf.line);
        if (!content) {
            // Try resolving via appRoot (handles ~/Mantram symlink)
            const resolved = path.join(appRoot, sf.file.replace(/^.*?\/backend\//, 'backend/'));
            content = readSourceContext(resolved, sf.line);
            if (content) sf.file = resolved;
        }
        if (!content) {
            // Handle deployment paths: /home/.../deployments/20260416_xxx/backend/...
            // Resolve to the current symlink: ~/Mantram/backend/...
            const deployMatch = sf.file.match(/\/deployments[^/]*\/[^/]+\/backend\/(.*)/);
            if (deployMatch) {
                const resolved = path.join(appRoot, 'backend', deployMatch[1]);
                content = readSourceContext(resolved, sf.line);
                if (content) sf.file = resolved;
            }
        }

        if (content && isFileAllowed(sf.file)) {
            sourceContexts.push({
                file: sf.file,
                line: sf.line,
                content,
            });
        }
    }

    // ── 1b. Fallback: keyword-based search when no stack trace files found ──
    if (sourceContexts.length === 0) {
        console.log('⚠️ AutoFix: No stack trace files — trying keyword-based search...');
        const keywords = extractErrorKeywords(errorEvent.errorText);
        
        for (const kw of keywords.slice(0, 3)) {
            try {
                const grepResults = grepCodebase(kw, appRoot);
                for (const gr of grepResults.slice(0, 2)) {
                    if (isFileAllowed(gr.file)) {
                        const content = readSourceContext(gr.file, gr.line);
                        if (content) {
                            sourceContexts.push({ file: gr.file, line: gr.line, content });
                        }
                    }
                }
            } catch (e) {
                // grep failed — continue with other keywords
            }
            if (sourceContexts.length >= 3) break;
        }

        if (sourceContexts.length > 0) {
            console.log(`🔍 AutoFix: Found ${sourceContexts.length} relevant file(s) via keyword search: ${sourceContexts.map(s => path.basename(s.file)).join(', ')}`);
        } else {
            console.log('⚠️ AutoFix: No allowed source files found via stack trace or keyword search — skipping analysis');
            return { canFix: false, rootCause: 'No fixable source files in stack trace', explanation: '', confidence: 0, changes: [] };
        }
    }

    // ── 2. Build user prompt ──────────────────────────────────────────────
    let userPrompt = `## Error Log\n\`\`\`\n${errorEvent.errorText.substring(0, 3000)}\n\`\`\`\n\n`;
    userPrompt += `## Error Category: ${errorEvent.category}\n\n`;

    for (const ctx of sourceContexts) {
        userPrompt += `## Source File: ${ctx.file} (error near line ${ctx.line})\n\`\`\`javascript\n${ctx.content}\n\`\`\`\n\n`;
    }

    userPrompt += `\nAnalyze the root cause and produce a minimal fix. Return ONLY the JSON response.`;

    // ── 3. Call Claude API ─────────────────────────────────────────────────
    console.log(`🤖 AutoFix: Sending error analysis to ${model}...`);
    const t0 = Date.now();

    const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }],
        }),
    });

    if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Claude API ${response.status}: ${errBody.substring(0, 200)}`);
    }

    const data = await response.json();
    const elapsed = Date.now() - t0;
    console.log(`🤖 AutoFix: Claude responded in ${elapsed}ms`);

    // ── 4. Parse response ─────────────────────────────────────────────────
    const assistantText = data.content?.[0]?.text || '';

    // Try to extract JSON from the response (handle markdown code blocks)
    let jsonStr = assistantText;
    const jsonMatch = assistantText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) jsonStr = jsonMatch[1];

    let result;
    try {
        result = JSON.parse(jsonStr.trim());
    } catch (parseErr) {
        console.error('❌ AutoFix: Failed to parse Claude response as JSON:', parseErr.message);
        console.error('Raw response:', assistantText.substring(0, 500));
        return { canFix: false, rootCause: 'Claude response was not valid JSON', explanation: assistantText.substring(0, 200), confidence: 0, changes: [] };
    }

    // ── 5. Validate the fix ───────────────────────────────────────────────
    if (!result.canFix || !result.changes || result.changes.length === 0) {
        return { ...result, changes: [] };
    }

    // Validate each change
    const validatedChanges = [];
    let totalLinesChanged = 0;

    for (const change of result.changes) {
        // Security: ensure file is in allowed dirs
        if (!isFileAllowed(change.file)) {
            console.warn(`⚠️ AutoFix: Claude attempted to modify blocked file: ${change.file} — skipping`);
            continue;
        }

        // Verify the search string exists in the file
        try {
            const fileContent = fs.readFileSync(change.file, 'utf-8');
            if (!fileContent.includes(change.search)) {
                console.warn(`⚠️ AutoFix: Search string not found in ${change.file} — skipping this change`);
                continue;
            }

            // Count changed lines
            const searchLines = change.search.split('\n').length;
            const replaceLines = change.replace.split('\n').length;
            totalLinesChanged += Math.abs(replaceLines - searchLines) + Math.min(searchLines, replaceLines);

            validatedChanges.push(change);
        } catch (readErr) {
            console.warn(`⚠️ AutoFix: Cannot read ${change.file}:`, readErr.message);
        }
    }

    // Safety: reject if too many lines changed
    if (totalLinesChanged > 50) {
        console.warn(`⚠️ AutoFix: Fix too large (${totalLinesChanged} lines) — rejecting`);
        return { ...result, canFix: false, explanation: `Fix too large (${totalLinesChanged} lines changed)`, changes: [] };
    }

    return {
        ...result,
        changes: validatedChanges,
        canFix: validatedChanges.length > 0,
    };
}
