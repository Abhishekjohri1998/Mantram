/**
 * End-to-end bug hunt harness.
 * Visits each listed route at desktop + mobile widths, captures:
 *   - full-page screenshot
 *   - all console errors / warnings (filtered)
 *   - all failed network requests (status >= 400 or aborted)
 *   - all uncaught JS errors
 * Writes a JSON report + a /shots folder.
 */
import puppeteer from 'puppeteer';
import path from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

const ROUTES = [
  // [routeName, path, requiresAuth]
  ['landing', '/', false],
  ['auth', '/auth', false],
  ['signup', '/signup', false],
  ['verify-email', '/verify-email', false],
  ['privacy', '/privacy-policy', false],
  ['terms', '/terms', false],
  ['blog', '/blog', false],
  ['dashboard', '/dashboard', true],
  ['nexus', '/nexus', true],
  ['brand-dna', '/brand-dna', true],
  ['brands', '/brands', true],
  ['analytics', '/analytics', true],
  ['content-studio', '/content-studio', true],
  ['creative-studio', '/creative-studio', true],
  ['video-studio', '/video-studio', true],
  ['social-media-studio', '/social-media-studio', true],
  ['seo-studio', '/seo-studio', true],
  ['research-studio', '/research-studio', true],
  ['brainstorm', '/brainstorm', true],
  ['conversations', '/conversations', true],
  ['integrations', '/integrations', true],
  ['credits', '/credits', true],
  ['templates', '/templates', true],
  ['skills', '/skills', true],
  ['settings', '/settings', true],
  ['brand-calendar', '/brand-calendar', true],
  ['virality-predictor', '/virality-predictor', true],
  ['avatar-generator', '/avatar-generator', true],
  ['pulse-studio', '/pulse-studio', true],
  ['performance-marketing', '/performance-marketing', true],
  ['retention-studio', '/retention-studio', true],
  ['ai-canvas', '/ai-canvas', true],
  ['team', '/team', true],
  ['under-construction', '/under-construction', false],
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
];

const OUT_DIR = path.resolve('scratch', 'bughunt');
const SHOTS_DIR = path.join(OUT_DIR, 'shots');
mkdirSync(SHOTS_DIR, { recursive: true });

// 1) Get a real JWT
const loginResp = await fetch('http://127.0.0.1:3001/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@mantram.ai', password: 'Mantram@2024' }),
}).then(r => r.json());
if (!loginResp?.token) {
  console.error('LOGIN FAILED', loginResp);
  process.exit(1);
}
const TOKEN = loginResp.token;
console.log('✓ login OK, user =', loginResp.user?.name);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-features=IsolateOrigins,site-per-process'],
});

const report = { startedAt: new Date().toISOString(), runs: [] };

for (const [routeName, routePath, requiresAuth] of ROUTES) {
  for (const vp of VIEWPORTS) {
    const tag = `${routeName}-${vp.name}`;
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.mobile, deviceScaleFactor: 1 });
    const consoleMsgs = [];
    const netFails = [];
    const pageErrors = [];

    page.on('console', m => {
      const t = m.type();
      if (t === 'error' || t === 'warning') {
        consoleMsgs.push({ type: t, text: m.text() });
      }
    });
    page.on('pageerror', e => pageErrors.push({ message: e.message, stack: (e.stack || '').slice(0, 500) }));
    page.on('requestfailed', req => netFails.push({ url: req.url(), reason: req.failure()?.errorText, method: req.method() }));
    page.on('response', resp => {
      const s = resp.status();
      if (s >= 400 && !resp.url().includes('favicon')) {
        netFails.push({ url: resp.url(), status: s, method: resp.request().method() });
      }
    });

    // Seed token + theme + dismiss walkthroughs
    if (requiresAuth) {
      await page.evaluateOnNewDocument((tok) => {
        try {
          localStorage.setItem('mantram_token', tok);
          localStorage.setItem('mantram-theme', 'light');
          // Pre-mark walkthroughs as done so they don't intercept clicks
          localStorage.setItem('mantram-walkthroughs-completed', JSON.stringify(['dashboard','contentStudio','creativeStudio']));
        } catch {}
        document.documentElement.classList.add('theme-light');
      }, TOKEN);
    }

    const url = `http://127.0.0.1:5173${routePath}`;
    let loadOk = true, loadError = null, finalUrl = url;
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });
    } catch (e) {
      loadOk = false;
      loadError = e.message;
    }

    // Allow lazy chunks and initial fetches to settle
    await new Promise(r => setTimeout(r, 4000));
    finalUrl = page.url();

    // Capture the rendered page (full page for desktop, viewport for mobile to keep size sane)
    const shotPath = path.join(SHOTS_DIR, `${tag}.png`);
    try {
      await page.screenshot({ path: shotPath, fullPage: vp.name === 'desktop' });
    } catch (e) {
      consoleMsgs.push({ type: 'screenshot-error', text: e.message });
    }

    // Heuristic: capture visible text density to detect blank-page bugs
    const meta = await page.evaluate(() => ({
      title: document.title,
      bodyTextLen: (document.body.innerText || '').length,
      hasMainSelector: !!document.querySelector('main, [class*="DashboardLayout"]'),
      h1: document.querySelector('h1')?.innerText?.slice(0, 80) || null,
      rootChildCount: document.getElementById('root')?.children?.length || 0,
    })).catch(e => ({ error: e.message }));

    report.runs.push({
      tag, route: routePath, viewport: vp.name, loadOk, loadError, finalUrl,
      shot: path.relative(OUT_DIR, shotPath),
      meta,
      consoleErrors: consoleMsgs.filter(m => m.type === 'error'),
      consoleWarnings: consoleMsgs.filter(m => m.type === 'warning'),
      pageErrors,
      netFails: netFails.slice(0, 30), // cap to keep report sane
      netFailCount: netFails.length,
    });

    console.log(`✓ ${tag} → ${meta.bodyTextLen}ch, ${pageErrors.length}err, ${netFails.length}netFail`);
    await page.close();
  }
}

await browser.close();

writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\nWrote ${path.join(OUT_DIR, 'report.json')}`);
console.log(`Total runs: ${report.runs.length}`);
