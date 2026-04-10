import { Router } from 'express';
import mongoose from 'mongoose';
import Bull from 'bull';
import SeoAudit from '../models/SeoAudit.js';
import { protect } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/debug/crawl-health
 * Diagnostic endpoint for checking the health of the crawl pipeline.
 * Restricted to authenticated users (optionally add admin check in production).
 */
router.get('/crawl-health', protect, async (req, res) => {
  const checks = [];
  
  // 1. Redis/Queue Reachability
  try {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      const dummyQueue = new Bull('diag-ping-debug', redisUrl);
      const ping = await dummyQueue.client.ping().catch(e => { throw e; });
      checks.push({ name: 'Redis', ok: ping === 'PONG', details: ping });
      await dummyQueue.close();
    } else {
      checks.push({ name: 'Redis', ok: true, details: 'Local mode (no REDIS_URL)' });
    }
  } catch (e) {
    checks.push({ name: 'Redis', ok: false, error: e.message });
  }

  // 2. DB Connectivity
  try {
    const dbStatus = mongoose.connection.readyState;
    // 1 = connected
    checks.push({ 
      name: 'Database', 
      ok: dbStatus === 1, 
      details: dbStatus === 1 ? 'Connected' : `Status Code: ${dbStatus}` 
    });
  } catch (e) {
    checks.push({ name: 'Database', ok: false, error: e.message });
  }

  // 3. Recent SEO Audit status
  let recentJobs = [];
  try {
    recentJobs = await SeoAudit.find({
      type: 'health-check'
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('_id status url createdAt updatedAt error results')
    .lean();
  } catch (e) {
    checks.push({ name: 'Recent Audits Query', ok: false, error: e.message });
  }

  // 4. Summarize Recent Jobs
  const jobSummaries = recentJobs.map(job => {
    const pagesCrawled = job.results?.siteStats?.pagesCrawled || 0;
    const wordCount = job.results?.siteStats?.totalWordCount || 0;
    
    return {
      id: job._id,
      status: job.status,
      targetUrl: job.url,
      createdAt: job.createdAt,
      durationMs: new Date(job.updatedAt) - new Date(job.createdAt),
      pagesSaved: pagesCrawled,
      avgWords: pagesCrawled > 0 ? (wordCount / pagesCrawled).toFixed(0) : 0,
      error: job.error || null,
      // "Pipeline Ratio" check (if 0 pages, flag it)
      potentialLoss: pagesCrawled === 0 && job.status === 'completed'
    };
  });

  const allOk = checks.every(c => c.ok);
  
  return res.status(allOk ? 200 : 503).json({
    ok: allOk,
    timestamp: new Date().toISOString(),
    checks,
    recentJobs: jobSummaries,
    diagnosis: allOk 
      ? 'Crawl pipeline is healthy.' 
      : `Potential issues detected in: ${checks.filter(c => !c.ok).map(c => c.name).join(', ')}`
  });
});

export default router;
