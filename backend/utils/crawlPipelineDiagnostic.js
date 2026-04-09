import mongoose from 'mongoose';
import Bull from 'bull';
import Redis from 'ioredis';

/**
 * SEO Crawl Pipeline Diagnostic
 * 
 * Traces the full lifecycle of an SEO audit to pinpoint where data is being lost.
 * Adapted to use SeoAudit as the primary 'job' tracker.
 */
export async function diagnoseCrawlPipeline({
  jobId, // This is the ID of the SeoAudit record
  lastError = null, // Optional error from the service layer
}) {
  const SeoAudit = mongoose.model('SeoAudit');
  
  const report = {
    stage: null,       // Which stage failed
    jobRecord: null,
    pagesInDb: 0,
    redisReachable: false,
    dbReachable: false,
    errors: []
  };

  // ── Stage 1: Database Connectivity ─────────────────────────────
  try {
    if (mongoose.connection.readyState === 1) {
      report.dbReachable = true;
    } else {
      throw new Error('Database not connected (readyState: ' + mongoose.connection.readyState + ')');
    }
  } catch (err) {
    report.stage = 'DB_UNREACHABLE';
    report.errors.push(`Database connection check failed: ${err.message}`);
    return report;
  }

  // ── Stage 2: Redis Connectivity (if Redis is configured) ───────
  try {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      // Create a temporary raw Redis client to ping (fail fast)
      const diagRedis = new Redis(redisUrl, {
        maxRetriesPerRequest: 0,
        connectTimeout: 2000,
        lazyConnect: true
      });
      try {
        await diagRedis.connect();
        const ping = await diagRedis.ping();
        report.redisReachable = ping === 'PONG';
      } finally {
        diagRedis.disconnect();
      }
    } else {
      // If no Redis URL, we might be in a simplified local dev mode
      report.redisReachable = true; // Assume OK or n/a
    }
  } catch (err) {
    report.stage = 'REDIS_UNREACHABLE';
    report.errors.push(`Redis ping failed: ${err.message}. Check if Redis server is running and REDIS_URL is correct.`);
    // We don't return here as DB might still have info, but it's a critical warning
  }

  // ── Stage 3: Does an Audit record exist? ───────────────────────
  try {
    const audit = await SeoAudit.findById(jobId).lean();
    if (!audit) {
      report.stage = 'AUDIT_NOT_CREATED';
      report.errors.push(`No SeoAudit record found for ID: ${jobId}`);
      return report;
    }
    report.jobRecord = {
      id: audit._id,
      status: audit.status,
      createdAt: audit.createdAt,
      type: audit.type,
      url: audit.url,
      error: audit.error || null,
      pageCount: audit.results?.siteStats?.pagesCrawled || 0
    };
  } catch (err) {
    report.stage = 'DB_READ_ERROR';
    report.errors.push(`DB error reading audit record: ${err.message}`);
    return report;
  }

  const audit = report.jobRecord;

  // ── Stage 4: Is the audit stuck/running too long? ──────────────
  if (audit.status === 'running') {
    const ageMs = Date.now() - new Date(audit.createdAt).getTime();
    if (ageMs > 10 * 60 * 1000) { // stuck for more than 10 minutes (SEO crawl can be slow)
      report.stage = 'AUDIT_STUCK_RUNNING';
      report.errors.push(
        `Audit has been in "running" state for ${Math.round(ageMs / 60000)} minutes. ` +
        `It likely crashed or timed out without updating the status.`
      );
      return report;
    }
    
    // If still within reasonable time, report it's just in progress
    report.stage = 'AUDIT_IN_PROGRESS';
    report.errors.push('Audit is currently running. Please wait for completion.');
    return report;
  }

  // ── Stage 5: Did the audit fail explicitly? ────────────────────
  if (audit.status === 'failed') {
    report.stage = 'AUDIT_FAILED';
    report.errors.push(`Audit explicitly failed: ${audit.error || 'No error message recorded.'}`);
    return report;
  }

  // ── Stage 6: Audit completed — were results saved? ────────────
  if (audit.status === 'completed') {
    const pageCount = audit.pageCount;
    report.pagesInDb = pageCount;

    if (pageCount === 0) {
      if (lastError && (lastError.includes('403') || lastError.includes('429') || lastError.includes('Bot challenge'))) {
        report.stage = 'HOMEPAGE_FETCH_FAILED';
        report.errors.push(`Homepage fetch was blocked: ${lastError}`);
        return report;
      }
      report.stage = 'AUDIT_COMPLETED_NO_PAGES';
      report.errors.push(
        `Audit status is "completed" but 0 pages were recorded. ` +
        `This suggests the crawl returned an empty result set (blocked by robots.txt or DNS failure).`
      );
      return report;
    }
    
    // Check if results object is missing entirely
    if (!report.jobRecord.pageCount && (!audit.results || Object.keys(audit.results).length === 0)) {
        report.stage = 'EMPTY_RESULTS_OBJECT';
        report.errors.push('Audit completed but the results object is empty. Data was lost during the write phase.');
        return report;
    }
  }

  report.stage = 'UNKNOWN';
  report.errors.push('Pipeline diagnostic could not determine a specific failure point, but no crawl data was found.');
  return report;
}

/**
 * Map diagnostic stages to user-friendly messages
 */
export function getDiagnosticUserMessage(stage) {
  const messages = {
    DB_UNREACHABLE: 'The system database is temporarily unavailable. Please try again in 5 minutes.',
    REDIS_UNREACHABLE: 'The background processing system (Redis) is offline. Advanced crawling features may be limited.',
    AUDIT_NOT_CREATED: 'The health check request failed to initialize. Please refresh and try again.',
    AUDIT_STUCK_RUNNING: 'The crawl started but seems to have stalled. This often happens with very slow websites or bot protection.',
    AUDIT_IN_PROGRESS: 'Analysis is still in progress. Large sites can take up to 2 minutes.',
    AUDIT_FAILED: 'The crawler encountered a critical error. This can happen if the site is down or unreachable.',
    HOMEPAGE_FETCH_FAILED: 'Access Denied: The website is blocking our automated audit tool. (WAF/Cloudflare Block)',
    AUDIT_COMPLETED_NO_PAGES: 'Zero pages were discovered. Please verify if the URL is accessible and not blocking "MantramBot" in robots.txt.',
    EMPTY_RESULTS_OBJECT: 'The crawl finished but the data could not be saved correctly. Our engineers have been notified.',
    UNKNOWN: 'An unknown pipeline failure occurred. No data was returned from the crawl.'
  };
  return messages[stage] || 'Crawl failure detected. Please check your URL and try again.';
}
