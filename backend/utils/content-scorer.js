/**
 * Mantram AI — Content Scoring Engine
 * 
 * Grades existing page content for SEO quality:
 * - Readability (Flesch-Kincaid)
 * - Keyword optimization (density, placement, TF-IDF)
 * - Heading structure (hierarchy, keyword presence)
 * - Content freshness signals
 * - Internal linking quality
 * - Engagement signals (content depth, media usage)
 */

/**
 * Score a single page's content
 * @param {Object} pageData - { url, title, metaDesc, h1s, h2s, bodyText, wordCount, internalLinks, externalLinks, images, schemas }
 * @param {string[]} targetKeywords - Keywords to optimize for
 * @returns {Object} Detailed content score breakdown
 */
export function scorePageContent(pageData, targetKeywords = []) {
  const {
    url = '', title = '', metaDesc = '', h1s = [], h2s = [],
    bodyText = '', wordCount = 0, internalLinks = [], externalLinks = [],
    images = [], schemas = [],
  } = pageData;

  const text = (bodyText || '').toLowerCase();
  const titleLower = (title || '').toLowerCase();
  const descLower = (metaDesc || '').toLowerCase();
  const kwsLower = targetKeywords.map(k => k.toLowerCase()).filter(Boolean);

  // ── 1. Readability Score (0-100) ──
  const readability = computeReadability(bodyText, wordCount);

  // ── 2. Keyword Optimization (0-100) ──
  const keywordScore = computeKeywordScore(text, titleLower, descLower, h1s, h2s, kwsLower, wordCount);

  // ── 3. Heading Structure (0-100) ──
  const headingScore = computeHeadingScore(h1s, h2s, kwsLower, wordCount);

  // ── 4. Content Depth (0-100) ──
  const depthScore = computeDepthScore(wordCount, h2s, images, externalLinks);

  // ── 5. Technical SEO (0-100) ──
  const technicalScore = computeTechnicalScore(title, metaDesc, url, schemas, images);

  // ── 6. Internal Linking (0-100) ──
  const linkingScore = computeLinkingScore(internalLinks, externalLinks, wordCount);

  // ── Overall Score ──
  const overall = Math.round(
    readability.score * 0.15 +
    keywordScore.score * 0.25 +
    headingScore.score * 0.15 +
    depthScore.score * 0.20 +
    technicalScore.score * 0.15 +
    linkingScore.score * 0.10
  );

  // Grade
  const grade = overall >= 90 ? 'A+' : overall >= 80 ? 'A' : overall >= 70 ? 'B'
    : overall >= 60 ? 'C' : overall >= 50 ? 'D' : 'F';

  // Top recommendations
  const recommendations = generateRecommendations({
    readability, keywordScore, headingScore, depthScore, technicalScore, linkingScore,
  });

  return {
    url,
    overall, grade,
    breakdown: {
      readability, keyword: keywordScore, heading: headingScore,
      depth: depthScore, technical: technicalScore, linking: linkingScore,
    },
    recommendations,
    wordCount,
  };
}

/**
 * Score multiple pages and provide site-wide content analysis
 */
export function scoreSiteContent(pages, targetKeywords = []) {
  const scored = pages.map(p => scorePageContent(p, targetKeywords));

  // Site-wide metrics
  const avgScore = scored.length ? Math.round(scored.reduce((s, p) => s + p.overall, 0) / scored.length) : 0;
  const gradeDistribution = { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };
  scored.forEach(p => { gradeDistribution[p.grade] = (gradeDistribution[p.grade] || 0) + 1; });

  // Top issues across all pages
  const allRecommendations = {};
  scored.forEach(p => {
    p.recommendations.forEach(r => {
      allRecommendations[r.type] = (allRecommendations[r.type] || { ...r, count: 0 });
      allRecommendations[r.type].count++;
    });
  });

  const topIssues = Object.values(allRecommendations)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    pageCount: scored.length,
    averageScore: avgScore,
    averageGrade: avgScore >= 90 ? 'A+' : avgScore >= 80 ? 'A' : avgScore >= 70 ? 'B'
      : avgScore >= 60 ? 'C' : avgScore >= 50 ? 'D' : 'F',
    gradeDistribution,
    topIssues,
    pages: scored.sort((a, b) => a.overall - b.overall), // Worst first
    bestPage: scored.reduce((b, p) => p.overall > (b?.overall || 0) ? p : b, null),
    worstPage: scored.reduce((w, p) => p.overall < (w?.overall || 100) ? p : w, null),
  };
}

/**
 * Format content scores for AI prompt
 */
export function formatContentScoresForPrompt(siteScores) {
  if (!siteScores || !siteScores.pageCount) return '';

  let text = '\n=== CONTENT QUALITY SCORES ===\n';
  text += `Pages scored: ${siteScores.pageCount} | Average: ${siteScores.averageScore}/100 (${siteScores.averageGrade})\n`;
  text += `Grade distribution: ${Object.entries(siteScores.gradeDistribution).map(([g, c]) => `${g}:${c}`).join(' | ')}\n`;

  if (siteScores.worstPage) {
    text += `\nWeakest page: ${siteScores.worstPage.url} (${siteScores.worstPage.overall}/100)\n`;
  }

  if (siteScores.topIssues?.length) {
    text += `\nTop content issues across site:\n`;
    for (const issue of siteScores.topIssues.slice(0, 5)) {
      text += `  - ${issue.message} (affects ${issue.count} pages)\n`;
    }
  }

  return text;
}

// ─── Scoring Helpers ─────────────────────────────────────────────────────

function computeReadability(text, wordCount) {
  if (!text || wordCount < 50) return { score: 0, level: 'insufficient', detail: 'Not enough content to score' };

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const sentenceCount = Math.max(sentences.length, 1);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const syllables = words.reduce((s, w) => s + countSyllables(w), 0);

  // Flesch-Kincaid Reading Ease
  const fk = 206.835 - (1.015 * (wordCount / sentenceCount)) - (84.6 * (syllables / wordCount));
  const clamped = Math.max(0, Math.min(100, fk));

  // Average sentence length
  const avgSentLen = Math.round(wordCount / sentenceCount);
  const sentLenPenalty = avgSentLen > 25 ? -10 : avgSentLen > 20 ? -5 : 0;

  // Paragraph variety (check for short paragraphs)
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 10);
  const paraBonus = paragraphs.length >= 3 ? 5 : 0;

  const score = Math.min(100, Math.max(0, Math.round(clamped + sentLenPenalty + paraBonus)));
  const level = score >= 80 ? 'easy' : score >= 60 ? 'moderate' : score >= 40 ? 'difficult' : 'very_difficult';

  return { score, level, avgSentenceLength: avgSentLen, fleschKincaid: Math.round(clamped) };
}

function computeKeywordScore(text, titleLower, descLower, h1s, h2s, keywords, wordCount) {
  if (!keywords.length || wordCount < 30) return { score: 50, density: 0, inTitle: false, inDesc: false, inH1: false, detail: 'No target keywords' };

  let score = 0;
  const primaryKw = keywords[0];

  // Keyword in title (+20)
  const inTitle = titleLower.includes(primaryKw);
  if (inTitle) score += 20;

  // Keyword in meta description (+15)
  const inDesc = descLower.includes(primaryKw);
  if (inDesc) score += 15;

  // Keyword in H1 (+15)
  const inH1 = h1s.some(h => h.toLowerCase().includes(primaryKw));
  if (inH1) score += 15;

  // Keyword in H2s (+10)
  const inH2 = h2s.some(h => h.toLowerCase().includes(primaryKw));
  if (inH2) score += 10;

  // Keyword in first 100 words (+10)
  const first100 = text.split(/\s+/).slice(0, 100).join(' ');
  if (first100.includes(primaryKw)) score += 10;

  // Keyword density (ideal: 1-2.5%)
  const kwCount = (text.match(new RegExp(escapeRegex(primaryKw), 'gi')) || []).length;
  const density = wordCount > 0 ? (kwCount / wordCount) * 100 : 0;
  if (density >= 0.5 && density <= 3) score += 15;
  else if (density > 3) score += 5; // Over-optimized
  else if (density > 0) score += 8;

  // Secondary keywords coverage (+15)
  const secondaryHits = keywords.slice(1).filter(kw => text.includes(kw)).length;
  const secondaryCoverage = keywords.length > 1 ? secondaryHits / (keywords.length - 1) : 0;
  score += Math.round(secondaryCoverage * 15);

  return {
    score: Math.min(100, score),
    density: Math.round(density * 100) / 100,
    inTitle, inDesc, inH1, inH2,
    primaryKeyword: primaryKw,
    secondaryCoverage: Math.round(secondaryCoverage * 100),
  };
}

function computeHeadingScore(h1s, h2s, keywords, wordCount) {
  let score = 0;

  // Has exactly one H1 (+30)
  if (h1s.length === 1) score += 30;
  else if (h1s.length > 1) score += 10; // Multiple H1s is bad but not terrible
  // else 0 for no H1

  // Has H2s (+20)
  if (h2s.length >= 2) score += 20;
  else if (h2s.length === 1) score += 10;

  // H2 to content ratio (one per ~300 words is good)
  const idealH2s = Math.max(1, Math.floor(wordCount / 300));
  const h2Ratio = h2s.length / idealH2s;
  if (h2Ratio >= 0.5 && h2Ratio <= 2) score += 20;
  else if (h2Ratio > 0) score += 10;

  // Keywords in headings (+30)
  if (keywords.length > 0) {
    const kwInH1 = h1s.some(h => keywords.some(k => h.toLowerCase().includes(k)));
    const kwInH2 = h2s.some(h => keywords.some(k => h.toLowerCase().includes(k)));
    if (kwInH1) score += 15;
    if (kwInH2) score += 15;
  } else {
    score += 30; // No keywords to check = pass
  }

  return { score: Math.min(100, score), h1Count: h1s.length, h2Count: h2s.length };
}

function computeDepthScore(wordCount, h2s, images, externalLinks) {
  let score = 0;

  // Word count (ideal: 1200-2500 for blog, 300-800 for product)
  if (wordCount >= 1200) score += 30;
  else if (wordCount >= 800) score += 25;
  else if (wordCount >= 500) score += 20;
  else if (wordCount >= 300) score += 15;
  else if (wordCount >= 100) score += 5;

  // Sections (H2s suggest depth)
  if (h2s.length >= 5) score += 20;
  else if (h2s.length >= 3) score += 15;
  else if (h2s.length >= 1) score += 10;

  // Images/media (visual depth)
  const imgCount = images?.length || 0;
  if (imgCount >= 3) score += 20;
  else if (imgCount >= 1) score += 10;

  // External references (authority signals)
  const extCount = externalLinks?.length || 0;
  if (extCount >= 2) score += 15;
  else if (extCount >= 1) score += 10;

  // Content comprehensiveness bonus
  if (wordCount >= 1500 && h2s.length >= 4 && imgCount >= 2) score += 15;

  return { score: Math.min(100, score), wordCount, sections: h2s.length, images: imgCount, externalRefs: extCount };
}

function computeTechnicalScore(title, metaDesc, url, schemas, images) {
  let score = 0;

  // Title tag (+25)
  if (title) {
    score += 15;
    if (title.length >= 30 && title.length <= 60) score += 10; // Optimal length
    else if (title.length > 0) score += 5;
  }

  // Meta description (+20)
  if (metaDesc) {
    score += 10;
    if (metaDesc.length >= 120 && metaDesc.length <= 160) score += 10;
    else if (metaDesc.length > 0) score += 5;
  }

  // URL structure (+15)
  if (url) {
    const path = new URL(url).pathname;
    if (path.length < 80) score += 5;
    if (!path.includes('?') && !path.includes('#')) score += 5;
    if (/^[a-z0-9\-\/]+$/i.test(path)) score += 5; // Clean URL
  }

  // Schema.org structured data (+20)
  if (schemas?.length > 0) score += 20;

  // Image alt text (+20)
  const totalImages = images?.length || 0;
  const withAlt = images?.filter(i => i.hasAlt !== false)?.length || 0;
  if (totalImages === 0) score += 20; // No images = no penalty
  else {
    const altRatio = withAlt / totalImages;
    score += Math.round(altRatio * 20);
  }

  return { score: Math.min(100, score), titleLength: title?.length || 0, descLength: metaDesc?.length || 0, hasSchema: schemas?.length > 0 };
}

function computeLinkingScore(internalLinks, externalLinks, wordCount) {
  let score = 0;
  const intCount = internalLinks?.length || 0;
  const extCount = externalLinks?.length || 0;

  // Internal links (ideal: 3-10 per 1000 words)
  const idealInternal = Math.max(2, Math.floor(wordCount / 300));
  if (intCount >= idealInternal) score += 40;
  else if (intCount >= 2) score += 25;
  else if (intCount >= 1) score += 15;

  // External links (1-3 is good for credibility)
  if (extCount >= 1 && extCount <= 5) score += 30;
  else if (extCount > 5) score += 20;

  // Anchor text variety
  const anchorTexts = (internalLinks || []).map(l => l.text?.toLowerCase()).filter(Boolean);
  const uniqueAnchors = new Set(anchorTexts);
  if (uniqueAnchors.size >= Math.floor(anchorTexts.length * 0.5)) score += 15; // Good variety

  // Not too many links (link dilution)
  if (intCount + extCount <= wordCount / 50) score += 15;

  return { score: Math.min(100, score), internalCount: intCount, externalCount: extCount };
}

function generateRecommendations(scores) {
  const recs = [];

  if (scores.readability.score < 60) {
    recs.push({ type: 'readability', priority: 'medium', message: `Readability is ${scores.readability.level}. Shorten sentences and use simpler words.` });
  }
  if (!scores.keywordScore.inTitle) {
    recs.push({ type: 'keyword_title', priority: 'high', message: `Primary keyword "${scores.keywordScore.primaryKeyword}" not in title tag.` });
  }
  if (!scores.keywordScore.inDesc) {
    recs.push({ type: 'keyword_desc', priority: 'medium', message: `Primary keyword not in meta description.` });
  }
  if (!scores.keywordScore.inH1) {
    recs.push({ type: 'keyword_h1', priority: 'high', message: `Primary keyword not in H1 heading.` });
  }
  if (scores.keywordScore.density > 3) {
    recs.push({ type: 'keyword_stuffing', priority: 'high', message: `Keyword density ${scores.keywordScore.density}% is too high. Reduce to 1-2.5%.` });
  }
  if (scores.keywordScore.density < 0.5 && scores.keywordScore.density > 0) {
    recs.push({ type: 'low_density', priority: 'medium', message: `Keyword density ${scores.keywordScore.density}% is very low. Increase to 1-2%.` });
  }
  if (scores.headingScore.h1Count === 0) {
    recs.push({ type: 'missing_h1', priority: 'critical', message: 'Missing H1 tag — every page needs exactly one H1.' });
  }
  if (scores.headingScore.h1Count > 1) {
    recs.push({ type: 'multiple_h1', priority: 'medium', message: `${scores.headingScore.h1Count} H1 tags found — use only one per page.` });
  }
  if (scores.depthScore.wordCount < 300) {
    recs.push({ type: 'thin_content', priority: 'high', message: `Only ${scores.depthScore.wordCount} words. Aim for 800+ for substantive content.` });
  }
  if (!scores.technicalScore.hasSchema) {
    recs.push({ type: 'no_schema', priority: 'medium', message: 'No structured data (Schema.org) found. Add relevant schema markup.' });
  }
  if (scores.technicalScore.titleLength > 60) {
    recs.push({ type: 'title_long', priority: 'low', message: `Title tag is ${scores.technicalScore.titleLength} chars — trim to ≤60.` });
  }
  if (scores.linking.internalCount < 2) {
    recs.push({ type: 'low_internal_links', priority: 'medium', message: 'Fewer than 2 internal links. Add more to improve crawlability.' });
  }

  return recs.sort((a, b) => {
    const prio = { critical: 0, high: 1, medium: 2, low: 3 };
    return (prio[a.priority] || 3) - (prio[b.priority] || 3);
  });
}

// ─── Utility Helpers ─────────────────────────────────────────────────────

function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 2) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
