/**
 * Drive Puppeteer to log in and screenshot the dashboard in light mode.
 * Run from D:\mantram\Mantram AI\Mantram AI with `node scratch/dashboard-shoot.mjs <mode>`
 *   mode = light | dark (default: light)
 */
import puppeteer from 'puppeteer';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const MODE = (process.argv[2] || 'light').toLowerCase();
const STAMP = process.argv[3] || 'before';
const OUT_DIR = path.resolve('scratch', 'shots');
await mkdir(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  defaultViewport: { width: 1440, height: 900 },
  args: ['--no-sandbox'],
});

try {
  const page = await browser.newPage();

  // Force light mode CSS media query
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: MODE === 'dark' ? 'dark' : 'light' }]);

  // 1) Get a real JWT by hitting the API directly (avoids form races).
  const loginResp = await fetch('http://127.0.0.1:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@mantram.ai', password: 'Mantram@2024' }),
  }).then(r => r.json());
  if (!loginResp?.token) {
    console.error('Login failed:', loginResp);
    process.exit(2);
  }
  const token = loginResp.token;

  // 2) Seed localStorage with the token + theme preference BEFORE the SPA boots.
  await page.evaluateOnNewDocument((tok, mode) => {
    try {
      localStorage.setItem('mantram_token', tok);
      localStorage.setItem('mantram-theme', mode);
    } catch {}
    // Apply the class synchronously on every page load (the app currently only
    // applies it from Sidebar.jsx after login, which is itself a bug).
    document.documentElement.classList.toggle('theme-light', mode === 'light');
  }, token, MODE);

  page.on('console', m => { if (m.type() === 'error') console.warn('[console error]', m.text()); });
  page.on('pageerror', e => console.warn('[pageerror]', e.message));

  console.log(`→ visiting /dashboard directly (mode=${MODE}) with seeded token`);
  await page.goto('http://127.0.0.1:5173/dashboard', { waitUntil: 'networkidle2', timeout: 60000 });

  // Give the dashboard time for lazy chunks + initial data fetches
  await new Promise(r => setTimeout(r, 10000));
  // Force one extra render tick to let HMR/styles settle
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

  const outFile = path.join(OUT_DIR, `dashboard-${MODE}-${STAMP}.png`);
  await page.screenshot({ path: outFile, fullPage: true });
  console.log('✓ saved', outFile);

  // Also dump localStorage / theme class for sanity
  const themeInfo = await page.evaluate(() => ({
    themeKey: localStorage.getItem('mantram-theme'),
    hasLightClass: document.documentElement.classList.contains('theme-light'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    sysBg: getComputedStyle(document.documentElement).getPropertyValue('--sys-bg').trim(),
    sysText: getComputedStyle(document.documentElement).getPropertyValue('--sys-text').trim(),
    url: location.href,
  }));
  console.log('theme info:', themeInfo);
} finally {
  await browser.close();
}
