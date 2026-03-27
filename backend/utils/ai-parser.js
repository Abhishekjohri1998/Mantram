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
    // Sometimes LLMs return "{\n  \"key\": \"value\"}" which is literally escaped
    // If the string starts with \" and ends with \", it might be double encoded
    if (clean.startsWith('\\"') && clean.endsWith('\\"')) {
        try {
            const unescaped = JSON.parse(`"${clean}"`);
            return extractJSON(unescaped); // Recursively parse the unescaped string
        } catch {}
    }

    // 4. Truncation Repair (Heuristic)
    if ((clean.startsWith('{') && !clean.endsWith('}')) || (clean.startsWith('[') && !clean.endsWith(']'))) {
        // If a string is open, close it
        // Count unescaped double quotes
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

        // Re-balance braces and brackets
        const stack = [];
        for (let i = 0; i < clean.length; i++) {
            const char = clean[i];
            if (char === '{') stack.push('}');
            else if (char === '[') stack.push(']');
            else if (char === '}' || char === ']') {
                if (stack.length > 0 && stack[stack.length - 1] === char) {
                    stack.pop();
                }
            }
        }
        while (stack.length) clean += stack.pop();
    }

    try {
        return JSON.parse(clean);
    } catch (e) {
        // console.warn('JSON.parse failed, attempting "relaxed" cleaning...');
        
        // 5. Final attempt: Remove common invalid trailing commas or bad escapes
        let relaxed = clean
            .replace(/,\s*([}\]])/g, '$1') // Trailing commas
            .replace(/\\n/g, '\n') // Literal \n to actual newline if escaped
            .replace(/\\"/g, '"'); // Literal \" to " (risky but sometimes needed)

        try {
            return JSON.parse(relaxed);
        } catch (innerE) {
            console.error('CRITICAL: AI JSON Parse Failed. Original length:', text.length, 'Cleaned length:', clean.length);
            // console.error('Cleaned content snippet:', clean.substring(0, 100) + '...');
            throw new Error(`Failed to parse AI response as JSON: ${e.message}`);
        }
    }
}
