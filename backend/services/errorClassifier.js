/**
 * Error Classifier — Determines if a log error is fixable by code changes
 *
 * Categories:
 *   CODE_BUG         — TypeError, ReferenceError, missing imports         → FIXABLE
 *   SCHEMA_ERROR     — Mongoose validation, casting errors                → FIXABLE
 *   API_INTEGRATION  — Wrong payload, auth header issues                  → FIXABLE
 *   LOGIC_ERROR      — Null dereference, bad array access                 → FIXABLE
 *   NETWORK_TRANSIENT— ECONNRESET, ETIMEDOUT, DNS failures               → IGNORE
 *   THIRD_PARTY_DOWN — External API 502/503, rate limits                  → IGNORE
 *   INFRA_CONFIG     — Memory, disk, PM2 restarts                         → IGNORE
 *   BOT_NOISE        — Scanner probes, 404 on .php/.env                   → IGNORE
 */

// ── Patterns that indicate CODE-FIXABLE errors ────────────────────────────
const CODE_BUG_PATTERNS = [
    /TypeError:\s/i,
    /ReferenceError:\s/i,
    /SyntaxError:\s/i,
    /Cannot read propert(y|ies) of (null|undefined)/i,
    /is not a function/i,
    /is not defined/i,
    /Cannot find module/i,
    /Unexpected token/i,
    /Invalid left-hand side/i,
    /Assignment to constant variable/i,
    /Cannot destructure property/i,
    /is not iterable/i,
    /Cannot use import statement outside a module/i,
    /ERR_MODULE_NOT_FOUND/i,
    /ERR_PACKAGE_PATH_NOT_EXPORTED/i,
];

const SCHEMA_ERROR_PATTERNS = [
    /ValidationError:\s/i,
    /CastError:\s/i,
    /MongoServerError.*duplicate key/i,
    /MongooseError/i,
    /Schema hasn't been registered/i,
    /MissingSchemaError/i,
];

const API_INTEGRATION_PATTERNS = [
    /AxiosError.*(?:400|401|403|422)/i,
    /Invalid API key/i,
    /INVALID_ARGUMENT/i,
    /malformed/i,
    /Missing required.*parameter/i,
    /Invalid request payload/i,
];

const LOGIC_ERROR_PATTERNS = [
    /Cannot convert undefined or null/i,
    /Maximum call stack size exceeded/i,
    /\.split is not a function/i,
    /\.map is not a function/i,
    /\.forEach is not a function/i,
    /\.filter is not a function/i,
    /\.trim is not a function/i,
    /\.replace is not a function/i,
    /\.toLowerCase is not a function/i,
    /\.toUpperCase is not a function/i,
    /JSON\.parse.*Unexpected/i,
    /Unexpected end of JSON input/i,
];

// ── Patterns that should be IGNORED (not fixable by code) ─────────────────
const NETWORK_TRANSIENT_PATTERNS = [
    /ECONNRESET/i,
    /ECONNREFUSED/i,
    /ETIMEDOUT/i,
    /ENETUNREACH/i,
    /ENOTFOUND/i,
    /EHOSTUNREACH/i,
    /socket hang up/i,
    /client network socket disconnected/i,
    /connect ECONNREFUSED/i,
    /getaddrinfo/i,
    /read ECONNRESET/i,
    /write EPIPE/i,
    /request.*timed?\s*out/i,
    /AbortError.*timed?\s*out/i,
];

const THIRD_PARTY_PATTERNS = [
    /status code 502/i,
    /status code 503/i,
    /status code 504/i,
    /status code 529/i,
    /rate.?limit/i,
    /quota.*exceeded/i,
    /too many requests/i,
    /overloaded/i,
    /temporarily unavailable/i,
    /service unavailable/i,
    /upstream connect error/i,
    /anthropic.*overloaded/i,
    /openai.*rate/i,
    /google.*quota/i,
    /429 Too Many/i,
    /Resource has been exhausted/i,
];

const INFRA_PATTERNS = [
    /pm2.*restart/i,
    /SIGTERM/i,
    /SIGINT/i,
    /graceful shutdown/i,
    /out of memory/i,
    /heap out of memory/i,
    /ENOMEM/i,
    /ENOSPC/i,
    /disk.?full/i,
    /max_memory_restart/i,
    /SubscriptionManager.*No subscriptions/i,
    /\[SubscriptionManager\]/i,
];

const BOT_NOISE_PATTERNS = [
    /\[404\].*\.php/i,
    /\[404\].*\.env/i,
    /\[404\].*wp-admin/i,
    /\[404\].*\.git/i,
    /\[404\].*xmlrpc/i,
    /\[404\].*phpunit/i,
    /\[404\].*cgi-bin/i,
    /\[404\].*boaform/i,
    /\[404\].*vendor/i,
    /bot.?scan/i,
    /CORS Rejected/i,
];

// ── Lines that should NEVER trigger analysis ──────────────────────────────
const ALWAYS_IGNORE_PATTERNS = [
    /^\[INCOMING\]/i,
    /^✅/,
    /^🔌 MCP/,
    /^🚀 Mantram AI Server/,
    /^📅/,
    /^🤖 Autonomous Agent/,
    /^🕵️ Agent Intelligence/,
    /^🛒 Credit/,
    /warm-up complete/i,
    /health check/i,
    /^GET\s/,
    /^POST\s/,
    /^PUT\s/,
    /^DELETE\s/,
    /credits\/balance/i,
];

/**
 * @typedef {'CODE_BUG'|'SCHEMA_ERROR'|'API_INTEGRATION'|'LOGIC_ERROR'|'NETWORK_TRANSIENT'|'THIRD_PARTY_DOWN'|'INFRA_CONFIG'|'BOT_NOISE'|'NORMAL'} ErrorCategory
 */

/**
 * Classify a batch of error lines into a category.
 * @param {string} errorText — concatenated error log lines
 * @returns {{ category: ErrorCategory, isActionable: boolean, confidence: number }}
 */
export function classifyError(errorText) {
    if (!errorText || typeof errorText !== 'string') {
        return { category: 'NORMAL', isActionable: false, confidence: 0 };
    }

    // ── Check IGNORE patterns first (cheap rejection) ─────────────────────
    for (const p of ALWAYS_IGNORE_PATTERNS) {
        if (p.test(errorText)) return { category: 'NORMAL', isActionable: false, confidence: 1.0 };
    }
    for (const p of BOT_NOISE_PATTERNS) {
        if (p.test(errorText)) return { category: 'BOT_NOISE', isActionable: false, confidence: 0.95 };
    }
    for (const p of INFRA_PATTERNS) {
        if (p.test(errorText)) return { category: 'INFRA_CONFIG', isActionable: false, confidence: 0.9 };
    }
    for (const p of NETWORK_TRANSIENT_PATTERNS) {
        if (p.test(errorText)) return { category: 'NETWORK_TRANSIENT', isActionable: false, confidence: 0.9 };
    }
    for (const p of THIRD_PARTY_PATTERNS) {
        if (p.test(errorText)) return { category: 'THIRD_PARTY_DOWN', isActionable: false, confidence: 0.85 };
    }

    // ── Check ACTIONABLE patterns ─────────────────────────────────────────
    for (const p of CODE_BUG_PATTERNS) {
        if (p.test(errorText)) return { category: 'CODE_BUG', isActionable: true, confidence: 0.9 };
    }
    for (const p of SCHEMA_ERROR_PATTERNS) {
        if (p.test(errorText)) return { category: 'SCHEMA_ERROR', isActionable: true, confidence: 0.8 };
    }
    for (const p of LOGIC_ERROR_PATTERNS) {
        if (p.test(errorText)) return { category: 'LOGIC_ERROR', isActionable: true, confidence: 0.85 };
    }
    for (const p of API_INTEGRATION_PATTERNS) {
        if (p.test(errorText)) return { category: 'API_INTEGRATION', isActionable: true, confidence: 0.7 };
    }

    // ── Fallback: check for generic error markers ─────────────────────────
    if (/❌|🚨|Server Error:|uncaughtException|unhandledRejection/i.test(errorText)) {
        // Has a stack trace pointing to our code?
        if (/at\s+.*\/(backend|agents|services|routes|utils|ai|mcp)\//i.test(errorText)) {
            return { category: 'CODE_BUG', isActionable: true, confidence: 0.6 };
        }
    }

    return { category: 'NORMAL', isActionable: false, confidence: 0 };
}

/**
 * Extract file paths from a stack trace that point to our codebase.
 * Returns an array of { file, line, col } objects.
 */
export function extractStackFiles(errorText) {
    const files = [];
    // Match stack trace lines like:  at Something (file:///path/to/file.js:123:45)
    // Or:  at file:///path/to/file.js:123:45
    // Or:  at Something (/home/ec2-user/.../backend/routes/content.js:123:45)
    const patterns = [
        /at\s+.*?\((?:file:\/\/\/)?(\/[^:]+\.(?:js|mjs)):(\d+):(\d+)\)/g,
        /at\s+(?:file:\/\/\/)?(\/[^:]+\.(?:js|mjs)):(\d+):(\d+)/g,
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(errorText)) !== null) {
            const filePath = match[1];
            // Only include files from our codebase
            if (filePath.includes('/backend/') && !filePath.includes('node_modules')) {
                files.push({
                    file: filePath,
                    line: parseInt(match[2], 10),
                    col: parseInt(match[3], 10),
                });
            }
        }
    }

    // Deduplicate by file path
    const seen = new Set();
    return files.filter(f => {
        if (seen.has(f.file)) return false;
        seen.add(f.file);
        return true;
    });
}

/**
 * Generate a stable hash for an error to detect duplicates.
 * Uses the error message and first stack frame (ignoring line numbers for stability).
 */
export function errorHash(errorText) {
    // Extract core error message (first line with Error:)
    const msgMatch = errorText.match(/(TypeError|ReferenceError|SyntaxError|Error|ValidationError|CastError|MongoServerError):\s*(.+)/i);
    const msg = msgMatch ? msgMatch[2].trim().substring(0, 120) : '';

    // Extract first file in stack (without line numbers)
    const fileMatch = errorText.match(/at\s+.*?(\/backend\/[^:]+)/);
    const file = fileMatch ? fileMatch[1] : '';

    const raw = `${msg}::${file}`;
    // Simple hash
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
        const char = raw.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return `err_${Math.abs(hash).toString(36)}`;
}
