import puppeteer from 'puppeteer';
import path from 'node:path';
const browser = await puppeteer.launch({ headless: 'new', defaultViewport: { width: 1600, height: 900 } });
const page = await browser.newPage();
const r = await fetch('http://127.0.0.1:3001/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@mantram.ai', password: 'Mantram@2024' }),
}).then(r => r.json());
await page.evaluateOnNewDocument((tok, mode) => {
  localStorage.setItem('mantram_token', tok);
  localStorage.setItem('mantram-theme', mode);
  document.documentElement.classList.toggle('theme-light', mode === 'light');
}, r.token, 'light');
await page.goto('http://127.0.0.1:5173/dashboard', { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 8000));
// Find and screenshot the first three top cards as their own clips
const targets = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('[class*="rounded-2xl"][class*="border"][class*="bg-[var(--sys-surface)]"]'));
  return cards.slice(0, 3).map((c) => {
    const r = c.getBoundingClientRect();
    return { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: r.width + 24, height: r.height + 24 };
  });
});
const out = path.resolve('scratch', 'shots');
for (let i = 0; i < targets.length; i++) {
  await page.screenshot({ path: path.join(out, `card-light-${i}.png`), clip: targets[i] });
  console.log('saved', i, targets[i]);
}
await browser.close();
