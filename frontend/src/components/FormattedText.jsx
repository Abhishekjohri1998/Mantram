/**
 * FormattedText — Lightweight markdown-to-HTML renderer
 * 
 * Converts markdown-style text from AI responses into clean,
 * formatted HTML. No raw asterisks, hashes, or markdown symbols
 * should ever appear in the portal.
 * 
 * RULE: Always use <FormattedText> for any AI-generated text content.
 */

import React from 'react';

/**
 * Parse markdown string into clean HTML
 * Handles: headers, bold, italic, bullets, numbered lists, links, line breaks
 */
function parseMarkdown(text) {
    if (!text || typeof text !== 'string') return '';

    let html = text
        // Escape HTML entities first (security)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

        // Headers: ### text → <h3>text</h3>
        .replace(/^####\s*\*{0,2}(.*?)\*{0,2}\s*$/gm, '<h4 class="fmt-h4">$1</h4>')
        .replace(/^###\s*\*{0,2}(.*?)\*{0,2}\s*$/gm, '<h3 class="fmt-h3">$1</h3>')
        .replace(/^##\s*\*{0,2}(.*?)\*{0,2}\s*$/gm, '<h2 class="fmt-h2">$1</h2>')
        .replace(/^#\s*\*{0,2}(.*?)\*{0,2}\s*$/gm, '<h1 class="fmt-h1">$1</h1>')

        // Bold: **text** or __text__
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')

        // Italic: *text* or _text_
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/_(.+?)_/g, '<em>$1</em>')

        // Strikethrough: ~~text~~
        .replace(/~~(.+?)~~/g, '<del>$1</del>')

        // Inline code: `text`
        .replace(/`([^`]+)`/g, '<code class="fmt-code">$1</code>')

        // Links: [text](url)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="fmt-link">$1</a>')

        // Horizontal rule: --- or ***
        .replace(/^[-*]{3,}\s*$/gm, '<hr class="fmt-hr" />')

        // Bullet points: - text or * text or • text
        .replace(/^[\s]*[-*•]\s+(.+)$/gm, '<li class="fmt-li">$1</li>')

        // Numbered lists: 1. text
        .replace(/^[\s]*\d+\.\s+(.+)$/gm, '<li class="fmt-li-num">$1</li>')

        // Wrap consecutive <li> elements in <ul> or <ol>
        .replace(/((?:<li class="fmt-li">.*<\/li>\n?)+)/g, '<ul class="fmt-ul">$1</ul>')
        .replace(/((?:<li class="fmt-li-num">.*<\/li>\n?)+)/g, '<ol class="fmt-ol">$1</ol>')

        // Double newlines → paragraph breaks
        .replace(/\n\n+/g, '</p><p class="fmt-p">')

        // Single newlines → line breaks (but not inside lists)
        .replace(/\n/g, '<br/>');

    // Wrap in paragraph tag
    html = `<p class="fmt-p">${html}</p>`;

    // Clean up empty paragraphs
    html = html.replace(/<p class="fmt-p"><\/p>/g, '');
    html = html.replace(/<p class="fmt-p">(<h[1-4])/g, '$1');
    html = html.replace(/(<\/h[1-4]>)<\/p>/g, '$1');
    html = html.replace(/<p class="fmt-p">(<ul|<ol)/g, '$1');
    html = html.replace(/(<\/ul>|<\/ol>)<\/p>/g, '$1');
    html = html.replace(/<p class="fmt-p">(<hr)/g, '$1');
    html = html.replace(/(\/>\s*)<\/p>/g, '$1');

    return html;
}

// CSS for formatted text
const fmtStyles = `
.formatted-text .fmt-h1 { font-size: 1.4em; font-weight: 700; margin: 16px 0 8px; color: #f1f5f9; }
.formatted-text .fmt-h2 { font-size: 1.2em; font-weight: 700; margin: 14px 0 6px; color: #f1f5f9; }
.formatted-text .fmt-h3 { font-size: 1.05em; font-weight: 600; margin: 12px 0 6px; color: #e2e8f0; }
.formatted-text .fmt-h4 { font-size: 0.95em; font-weight: 600; margin: 10px 0 4px; color: #cbd5e1; }
.formatted-text .fmt-p { margin-bottom: 8px; line-height: 1.7; }
.formatted-text .fmt-ul, .formatted-text .fmt-ol { margin: 8px 0; padding-left: 20px; }
.formatted-text .fmt-li, .formatted-text .fmt-li-num { margin-bottom: 4px; line-height: 1.6; }
.formatted-text .fmt-code { background: rgba(255,255,255,0.08); padding: 1px 6px; border-radius: 4px; font-size: 0.9em; font-family: monospace; }
.formatted-text .fmt-link { color: #818cf8; text-decoration: underline; }
.formatted-text .fmt-hr { border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 16px 0; }
.formatted-text strong { font-weight: 600; color: #f1f5f9; }
.formatted-text em { font-style: italic; color: #cbd5e1; }

/* PDF (light mode) overrides */
.formatted-text-light .fmt-h1, .formatted-text-light .fmt-h2 { color: #0f172a; }
.formatted-text-light .fmt-h3, .formatted-text-light .fmt-h4 { color: #1e293b; }
.formatted-text-light .fmt-code { background: rgba(0,0,0,0.05); }
.formatted-text-light .fmt-link { color: #4f46e5; }
.formatted-text-light strong { color: #0f172a; }
.formatted-text-light em { color: #334155; }
`;

let stylesInjected = false;

/**
 * FormattedText component — renders AI markdown as clean HTML
 * 
 * @param {string} text - Raw text (may contain markdown)
 * @param {string} className - Additional CSS class
 * @param {boolean} light - Use light mode (for PDF export)
 * @param {object} style - Additional inline styles
 */
export default function FormattedText({ text, className = '', light = false, style = {} }) {
    // Inject styles once
    if (!stylesInjected && typeof document !== 'undefined') {
        const styleEl = document.createElement('style');
        styleEl.textContent = fmtStyles;
        document.head.appendChild(styleEl);
        stylesInjected = true;
    }

    if (!text) return null;

    const html = parseMarkdown(text);

    return (
        <div
            className={`formatted-text ${light ? 'formatted-text-light' : ''} ${className}`}
            style={style}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}

/**
 * Utility: strip markdown to plain text (for tooltips, meta, etc.)
 */
export function stripMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/#{1,4}\s*/g, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        .replace(/~~(.+?)~~/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^[-*•]\s+/gm, '• ')
        .replace(/^---+$/gm, '');
}
