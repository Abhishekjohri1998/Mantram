import { crawlWithRetry } from './crawlService.js';
import { diagnoseCrawlFailure } from '../utils/crawlDiagnosis.js';
import { generateGroundedNarrative } from './groundingService.js';
import { extractJSON } from '../utils/ai-parser.js';
import { diagnoseCrawlPipeline, getDiagnosticUserMessage } from '../utils/crawlPipelineDiagnostic.js';

/**
 * SEO Report Service
 * 
 * Orchestrates the full lifecycle of an SEO Health Check:
 * 1. Crawl (with auto-retry and quality guarding)
 * 2. Audit (tiered validation)
 * 3. Diagnosis (if failed)
 * 4. Grounded AI Narrative (if partial or full)
 */
export async function buildSeoHealthReport(website, options = {}) {
  const { brandContext, provider, jobId } = options;

  // STEP 1: Crawl with auto-retry
  const { pages, audit, attemptsMade, strategyUsed, siteResearch } = await crawlWithRetry(website, {
    maxPages: options.maxPages || 200,
    timeout: options.timeout || 60000
  });

  // STEP 2: NO SUCCESSFUL PAGES discovered — Trigger Pipeline Diagnostic
  const successfulPages = (pages || []).filter(p => p.success);
  
  if (successfulPages.length === 0) {
    const diagnosis = await diagnoseCrawlPipeline({ jobId, lastError: pages?.[0]?.error });
    return {
      status: 'CRAWL_PIPELINE_FAILURE',
      success: false,
      reason: 'No successful pages were discovered during the crawl.',
      diagnosis, // Full diagnostic report
      userMessage: getDiagnosticUserMessage(diagnosis.stage),
      attemptsMade,
      strategyUsed,
      metrics: {
        totalPages: 0,
        meaningfulRatio: 0
      }
    };
  }

  // STEP 3: Handle INVALID state (Hard Block - Data found but poor quality)
  if (audit.reportMode === 'INVALID') {
    const diagnosis = diagnoseCrawlFailure(audit);
    return {
      status: 'CRAWL_INVALID',
      success: false,
      reason: audit.blockers.join('; '),
      diagnosis,
      metrics: audit.quality,
      attemptsMade,
      strategyUsed,
      message: 'Recrawl Required: High Hallucination Risk',
      suggestedAction: 'Wait 10 minutes for site cache to clear or check bot protection settings.'
    };
  }

  // STEP 3: Build deterministic report structure (metrics only)
  // (In a real app, logic to aggregate 'pages' into 'siteStats' would go here)
  const report = {
    url: website,
    status: audit.reportMode, // 'FULL' or 'PARTIAL'
    audit,
    pages,
    siteStats: siteResearch.siteIntelligence || {}, // Inherit from web-research output
    findingsMode: audit.reportMode === 'PARTIAL' ? 'ESTIMATED' : 'MEASURED',
    warnings: audit.warnings,
    attemptsMade,
    strategyUsed
  };

  // STEP 4: Handle AI Narratives (Grounded)
  if (audit.reportMode === 'PARTIAL') {
    // If partial, we suppress complex AI narratives to avoid hallucinations
    report.summary = `Partial analysis complete (${Math.round(audit.quality.meaningfulRatio * 100)}% coverage). Grounded narratives are suppressed due to low data density.`;
    report.hallucinationsAvoided = true;
    return report;
  }

  // STEP 5: Full AI Narrative (Grounded)
  // This part would be the actual AI prompt call, grounded in JSON
  // For now, return a placeholder that the route will fill or we can implement the prompt here.
  return report;
}
