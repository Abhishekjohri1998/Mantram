/**
 * Mantram AI — Competitor Monitor
 * 
 * Lightweight competitor crawl that detects:
 * - New pages added by competitors
 * - Content changes on existing pages
 * - Removed/redirected pages
 * - Title/meta keyword overlap with your brand
 * - Content strategy patterns (word count, topics)
 */

import { researchDomain } from './web-research.js';

/**
 * Crawl a competitor and create a snapshot
 * @param {string} competitorUrl - Competitor domain URL
 * @returns {Promise<Object>} Snapshot data
 */
export async function crawlCompetitor(competitorUrl) {
  console.log(`🕵️ Competitor Monitor: Crawling ${competitorUrl}...`);

  const crawlResult = await researchDomain(competitorUrl);

  if (!crawlResult) {
    return { error: 'Failed to crawl competitor', pages: [] };
  }

  // Extract page inventory
  const pages = (crawlResult.pages || []).map(p => ({
    url: p.url || '',
    title: p.title || '',
    metaDesc: p.meta?.description || '',
    wordCount: p.wordCount || 0,
    h1: p.h1 || '',
  }));

  // Extract keywords from titles and meta descriptions
  const titleKeywords = extractKeywords(pages.map(p => p.title).join(' '));
  const metaKeywords = extractKeywords(pages.map(p => p.metaDesc).join(' '));

  // Schema types found
  const schemaTypes = [...new Set(
    (crawlResult.pages || []).flatMap(p => p.schemas || []).filter(Boolean)
  )];

  const avgWordCount = pages.length
    ? Math.round(pages.reduce((s, p) => s + p.wordCount, 0) / pages.length)
    : 0;

  return {
    competitorUrl,
    pages,
    totalPages: pages.length,
    avgWordCount,
    titleKeywords,
    metaKeywords,
    schemaTypes,
    sitemapUrls: crawlResult.sitemapUrls || [],
    hasRobotsTxt: crawlResult.hasRobotsTxt || false,
    hasSitemap: crawlResult.hasSitemap || false,
  };
}

/**
 * Compare current crawl with previous snapshot to detect changes
 * @param {Object} current - Current crawl data
 * @param {Object} previous - Previous snapshot from DB
 * @returns {Object} Change analysis
 */
export function compareSnapshots(current, previous) {
  if (!previous) {
    return {
      isFirstSnapshot: true,
      newPages: current.pages.map(p => ({ url: p.url, title: p.title })),
      changedPages: [],
      removedPages: [],
      summary: `First snapshot: ${current.pages.length} pages indexed`,
    };
  }

  const prevMap = {};
  for (const p of (previous.pages || [])) {
    prevMap[normalizeUrl(p.url)] = p;
  }

  const currMap = {};
  for (const p of (current.pages || [])) {
    currMap[normalizeUrl(p.url)] = p;
  }

  // Detect new pages
  const newPages = current.pages
    .filter(p => !prevMap[normalizeUrl(p.url)])
    .map(p => ({ url: p.url, title: p.title }));

  // Detect changed pages (title or wordCount significantly different)
  const changedPages = current.pages
    .filter(p => {
      const prev = prevMap[normalizeUrl(p.url)];
      if (!prev) return false;
      const titleChanged = prev.title !== p.title;
      const contentChanged = Math.abs((prev.wordCount || 0) - (p.wordCount || 0)) > 50;
      return titleChanged || contentChanged;
    })
    .map(p => {
      const prev = prevMap[normalizeUrl(p.url)];
      return {
        url: p.url, title: p.title,
        changeType: prev.title !== p.title ? 'title_changed' : 'content_updated',
        prevTitle: prev.title,
        wordCountDelta: p.wordCount - (prev.wordCount || 0),
      };
    });

  // Detect removed pages
  const removedPages = (previous.pages || [])
    .filter(p => !currMap[normalizeUrl(p.url)])
    .map(p => ({ url: p.url, title: p.title }));

  // New keywords
  const prevKeywords = new Set(previous.titleKeywords || []);
  const newKeywords = (current.titleKeywords || []).filter(k => !prevKeywords.has(k));

  // Summary
  const parts = [];
  if (newPages.length) parts.push(`${newPages.length} new pages`);
  if (changedPages.length) parts.push(`${changedPages.length} pages updated`);
  if (removedPages.length) parts.push(`${removedPages.length} pages removed`);
  if (newKeywords.length) parts.push(`${newKeywords.length} new keyword targets`);

  return {
    isFirstSnapshot: false,
    newPages,
    changedPages,
    removedPages,
    newKeywords,
    summary: parts.length ? parts.join(', ') : 'No significant changes detected',
  };
}

/**
 * Analyze keyword overlap between brand and competitor
 * @param {string[]} brandKeywords - Your brand's target keywords
 * @param {string[]} competitorKeywords - Competitor's extracted keywords
 * @returns {Object} Overlap analysis
 */
export function analyzeKeywordOverlap(brandKeywords, competitorKeywords) {
  const brandSet = new Set(brandKeywords.map(k => k.toLowerCase()));
  const compSet = new Set(competitorKeywords.map(k => k.toLowerCase()));

  const overlap = [...brandSet].filter(k => compSet.has(k));
  const uniqueToBrand = [...brandSet].filter(k => !compSet.has(k));
  const uniqueToCompetitor = [...compSet].filter(k => !brandSet.has(k));

  return {
    overlapCount: overlap.length,
    overlap,
    uniqueToBrand,
    uniqueToCompetitor,
    overlapPercentage: brandSet.size > 0 ? Math.round((overlap.length / brandSet.size) * 100) : 0,
    competitorOnlyKeywords: uniqueToCompetitor.slice(0, 20), // Opportunity keywords
  };
}

/**
 * Format competitor monitor data for AI prompt
 */
export function formatCompetitorMonitorForPrompt(monitorData) {
  if (!monitorData || !monitorData.competitors?.length) return '';

  let text = '\n=== COMPETITOR MONITORING INTELLIGENCE ===\n';

  for (const comp of monitorData.competitors) {
    text += `\n--- ${comp.name || comp.url} ---\n`;
    text += `Pages indexed: ${comp.totalPages} | Avg word count: ${comp.avgWordCount}\n`;

    if (comp.changes) {
      const c = comp.changes;
      if (c.newPages?.length) {
        text += `🆕 New pages: ${c.newPages.length}\n`;
        for (const p of c.newPages.slice(0, 3)) text += `  - "${p.title}" → ${p.url}\n`;
      }
      if (c.changedPages?.length) {
        text += `✏️ Updated pages: ${c.changedPages.length}\n`;
        for (const p of c.changedPages.slice(0, 3)) text += `  - "${p.title}" (${p.changeType})\n`;
      }
      if (c.removedPages?.length) text += `🗑️ Removed pages: ${c.removedPages.length}\n`;
      if (c.newKeywords?.length) {
        text += `🎯 New keyword targets: ${c.newKeywords.slice(0, 10).join(', ')}\n`;
      }
    }

    if (comp.overlap) {
      text += `Keyword overlap with you: ${comp.overlap.overlapPercentage}% (${comp.overlap.overlapCount} shared keywords)\n`;
      if (comp.overlap.competitorOnlyKeywords?.length) {
        text += `Opportunity keywords (competitor targets, you don't): ${comp.overlap.competitorOnlyKeywords.slice(0, 5).join(', ')}\n`;
      }
    }
  }

  return text;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).replace(/\/+$/, '').toLowerCase();
  } catch { return url?.toLowerCase()?.replace(/\/+$/, '') || ''; }
}

/**
 * Extract significant keywords from text
 */
function extractKeywords(text) {
  if (!text) return [];
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'can', 'this', 'that', 'these', 'those', 'it', 'its',
    'no', 'not', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
    'other', 'some', 'such', 'than', 'too', 'very', 'just', 'about', 'up',
    'out', 'so', 'if', 'then', 'into', 'what', 'which', 'who', 'how', 'our',
    'your', 'we', 'us', 'you', 'he', 'she', 'they', 'them', 'their', 'my',
  ]);

  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  // Count frequency
  const freq = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });

  // Return top keywords by frequency
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([kw]) => kw);
}
