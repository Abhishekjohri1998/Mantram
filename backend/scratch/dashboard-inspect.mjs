import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
const loginResp = await fetch('http://127.0.0.1:3001/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@mantram.ai', password: 'Mantram@2024' }),
}).then(r => r.json());
const token = loginResp.token;
await page.evaluateOnNewDocument((tok) => {
  localStorage.setItem('mantram_token', tok);
  localStorage.setItem('mantram-theme', 'light');
  document.documentElement.classList.add('theme-light');
}, token);
await page.goto('http://127.0.0.1:5173/dashboard', { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 8000));
const info = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('[class*="rounded-2xl"][class*="border"]'));
  const samples = cards.slice(0, 6).map(c => {
    const cs = getComputedStyle(c);
    return {
      tag: c.tagName,
      classFragment: c.className.slice(0, 100),
      bg: cs.backgroundColor,
      border: cs.borderTopColor + ' / ' + cs.borderTopWidth,
      boxShadow: cs.boxShadow,
      rect: c.getBoundingClientRect().toJSON(),
    };
  });
  const root = getComputedStyle(document.documentElement);
  return {
    theme: {
      bg: root.getPropertyValue('--sys-bg').trim(),
      surface: root.getPropertyValue('--sys-surface').trim(),
      surface2: root.getPropertyValue('--sys-surface-2').trim(),
      border: root.getPropertyValue('--sys-border').trim(),
      shadowSm: root.getPropertyValue('--sys-shadow-sm').trim(),
      ringTrack: root.getPropertyValue('--sys-ring-track').trim(),
    },
    cards: samples,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
