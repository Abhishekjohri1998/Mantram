/**
 * ai-parser.js
 * Robust utility for extracting and parsing JSON from AI model responses.
 * Handles common issues: markdown blocks, escaped quotes, truncated responses.
 */

export function extractJSON(text) {
    if (!text || typeof text !== 'string') {
        throw new Error('Input to extractJSON must be a non-empty string');
    }

    let clean = text.trim();

    // 1. Handle Markdown Code Blocks
    // Catch ```json ... ``` or just ``` ... ```
    if (clean.includes('```')) {
        const match = clean.match(/```(?:json)?\s*\n?([\s\S]*?)\n?(?:```|$)/);
        if (match) {
            clean = match[1].trim();
        } else {
            // Truncated markdown: remove only the start indicator
            clean = clean.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        }
    }

    // 2. Remove potential leading/trailing garbage (non-JSON characters)
    const firstBrace = clean.indexOf('{');
    const firstBracket = clean.indexOf('[');
    const startIdx = (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) ? firstBrace : firstBracket;

    const lastBrace = clean.lastIndexOf('}');
    const lastBracket = clean.lastIndexOf(']');
    const endIdx = (lastBrace !== -1 && (lastBracket === -1 || lastBrace > lastBracket)) ? lastBrace : lastBracket;

    if (startIdx === -1) {
        throw new Error('No JSON structure (brace or bracket) found in response');
    }

    // If we found boundaries, extract just that part
    if (endIdx !== -1 && endIdx > startIdx) {
        clean = clean.substring(startIdx, endIdx + 1);
    } else {
        // Truncated: take from startIdx to the end
        clean = clean.substring(startIdx);
    }

    // 3. Handle Escaped Character Issues (Common in some LLM outputs)
    // Sometimes LLMs return "{\\n  \\\"key\\\": \\\"value\\\"}" which is literally escaped
    // If the string starts with \\\" and ends with \\\", it might be double encoded
    if (clean.startsWith('\\"') && clean.endsWith('\\"')) {
        try {
            const unescaped = JSON.parse(`"${clean}"`);
            return extractJSON(unescaped); // Recursively parse the unescaped string
        } catch {}
    }

    // 4. Truncation Repair (Heuristic)
    if ((clean.startsWith('{') && !clean.endsWith('}')) || (clean.startsWith('[') && !clean.endsWith(']'))) {
        clean = repairTruncatedJSON(clean);
    }

    try {
        return JSON.parse(clean);
    } catch (e) {
        // 5. Try removing trailing commas and fixing common escaping issues
        let relaxed = clean
            .replace(/,\s*([}\]])/g, '$1') // Trailing commas
            .replace(/\\n/g, '\n') // Literal \\n to actual newline if escaped
            .replace(/\\"/g, '"'); // Literal \\\" to \" (risky but sometimes needed)

        try {
            return JSON.parse(relaxed);
        } catch {
            // 6. Progressive truncation: trim back to the last valid JSON boundary
            const recovered = progressiveTruncationRepair(clean);
            if (recovered) return recovered;

            console.error('CRITICAL: AI JSON Parse Failed. Original length:', text.length, 'Cleaned length:', clean.length);
            throw new Error(`Failed to parse AI response as JSON: ${e.message}`);
        }
    }
}

/**
 * Repair truncated JSON by closing open strings and rebalancing braces/brackets.
 */
function repairTruncatedJSON(json) {
    let clean = json;

    // If a string is open, close it
    let inString = false;
    let escaped = false;
    for (let i = 0; i < clean.length; i++) {
        if (clean[i] === '\\' && !escaped) {
            escaped = true;
        } else if (clean[i] === '"' && !escaped) {
            inString = !inString;
            escaped = false;
        } else {
            escaped = false;
        }
    }
    if (inString) clean += '"';

    // Remove dangling key without value (e.g., "someKey": ) or incomplete value
    // Trim trailing incomplete key-value pairs: `"key": "val` or `"key":` or `, "key`
    clean = clean.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"{}[\]]*$/, '');

    // Re-balance braces and brackets
    const stack = [];
    inString = false;
    escaped = false;
    for (let i = 0; i < clean.length; i++) {
        const char = clean[i];
        if (char === '\\' && !escaped && inString) {
            escaped = true;
            continue;
        }
        if (char === '"' && !escaped) {
            inString = !inString;
        }
        escaped = false;
        if (inString) continue;
        if (char === '{') stack.push('}');
        else if (char === '[') stack.push(']');
        else if (char === '}' || char === ']') {
            if (stack.length > 0 && stack[stack.length - 1] === char) {
                stack.pop();
            }
        }
    }
    while (stack.length) clean += stack.pop();

    return clean;
}

/**
 * Progressive truncation repair: if JSON is malformed mid-value, trim back
 * to the last successfully parseable boundary. Works by finding the last
 * complete object/array element and discarding everything after it.
 */
function progressiveTruncationRepair(json) {
    // Strategy: find cut points (end of complete values) and try parsing
    // from the end backwards until we find a parseable subset.
    const cutPoints = [];
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < json.length; i++) {
        const ch = json[i];
        if (ch === '\\' && !escaped && inString) { escaped = true; continue; }
        if (ch === '"' && !escaped) { inString = !inString; }
        escaped = false;
        if (inString) continue;

        if (ch === '{' || ch === '[') depth++;
        else if (ch === '}' || ch === ']') {
            depth--;
            // When we return to depth 1 after closing a nested structure, that's a potential cut point
            if (depth === 1) cutPoints.push(i);
        }
    }

    // Try from the latest cut points backwards
    for (let ci = cutPoints.length - 1; ci >= 0; ci--) {
        let candidate = json.substring(0, cutPoints[ci] + 1);

        // Remove trailing commas
        candidate = candidate.replace(/,\s*$/, '');

        // Close the root container
        const first = candidate.charAt(0);
        if (first === '{') candidate += '}';
        else if (first === '[') candidate += ']';

        // Also remove any trailing commas inside
        candidate = candidate.replace(/,\s*([}\]])/g, '$1');

        try {
            const result = JSON.parse(candidate);
            console.warn(`⚠️ AI JSON recovered via progressive truncation (cut at ${cutPoints[ci]}/${json.length})`);
            return result;
        } catch {
            continue;
        }
    }

    return null; // All cut points failed
}
