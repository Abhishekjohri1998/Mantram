import { Router } from 'express';
import { protect, optionalAuth } from '../middleware/auth.js';
import { requireStudio } from '../middleware/studioAccess.js';
import { requireCredits, logTokenUsage } from '../middleware/credits.js';
import Brand from '../models/Brand.js';
import SeoAudit from '../models/SeoAudit.js';
import GeoProbeHistory from '../models/GeoProbeHistory.js';
import GscSnapshot from '../models/GscSnapshot.js';
import SeoSnapshot from '../models/SeoSnapshot.js';
import { safeErrorMessage } from '../utils/safeError.js';
import {
  researchDomain, researchDomainLight, researchCompetitors,
  formatSiteResearch, formatCompetitorResearch,
  discoverBacklinks, analyzeCompetitorLinkProfile,
} from '../utils/web-research.js';
import { runRealLLMProbe, generateProbePrompts } from '../utils/llm-probe.js';
import { probeAIVisibility } from '../services/geoProbe.js';
import { getPageSpeed, formatPageSpeedForPrompt } from '../utils/pagespeed.js';
import { mineAutocomplete, formatAutocompleteForPrompt } from '../utils/autocomplete.js';
import { runKeywordIntelligence } from '../utils/keyword-intelligence.js';
import { batchPAA, formatPAAForPrompt } from '../utils/paa-scraper.js';
import {
  getKeywordIntelligence, getDomainBacklinks,
  formatKeywordDataForPrompt, formatBacklinkDataForPrompt,
  isDataForSEOConfigured,
  getEnrichedBacklinks, formatEnrichedBacklinkData,
} from '../utils/dataforseo.js';
import { getMozDomainAuthority, getMozBatchDA, formatMozDataForPrompt, isMozConfigured } from '../utils/moz.js';
import {
  getInstantSiteIntelligence, getDomainRankings, getCompetitiveOverlap,
  discoverSerpCompetitors, getBrandMentions,
  formatRankedKeywordsForPrompt, formatInstantPageForPrompt,
  formatSerpCompetitorsForPrompt, formatDomainIntersectionForPrompt,
  isOnPageConfigured,
} from '../utils/onpage-api.js';
import { jsRenderCrawl, formatJSCrawlForPrompt } from '../utils/js-crawler.js';
import { scoreSiteContent, formatContentScoresForPrompt } from '../utils/content-scorer.js';
import { crawlCompetitor, compareSnapshots, analyzeKeywordOverlap, formatCompetitorMonitorForPrompt } from '../utils/competitor-monitor.js';
import CompetitorSnapshot from '../models/CompetitorSnapshot.js';

const router = Router();

  }
});

export default router;
