/**
 * Strip markdown formatting from text for clean display and copy-paste.
 * Converts **bold** → bold, *italic* → italic, ## headers → plain text, etc.
 * Preserves line breaks and overall structure.
 */
export function stripMarkdown(text) {
    if (!text || typeof text !== 'string') return text || '';
    return text
        // Remove bold: **text** or __text__
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        // Remove italic: *text* or _text_ (but not inside words like don't)
        .replace(/(?<!\w)\*(.+?)\*(?!\w)/g, '$1')
        .replace(/(?<!\w)_(.+?)_(?!\w)/g, '$1')
        // Remove strikethrough: ~~text~~
        .replace(/~~(.+?)~~/g, '$1')
        // Remove markdown headers: ## Header → Header
        .replace(/^#{1,6}\s+/gm, '')
        // Remove markdown bullet points: - item → item, * item → item
        .replace(/^[\s]*[-*]\s+/gm, '')
        // Remove markdown links: [text](url) → text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove inline code: `code` → code
        .replace(/`([^`]+)`/g, '$1')
        // Remove code blocks: ```code``` → code
        .replace(/```[\s\S]*?```/g, (match) => match.replace(/```\w*\n?/g, '').trim())
        // Clean up extra whitespace
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
