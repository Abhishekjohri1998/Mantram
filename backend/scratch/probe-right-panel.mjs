import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new', defaultViewport: { width: 1440, height: 900 } });
const page = await browser.newPage();
const lr = await fetch('http://127.0.0.1:3001/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@mantram.ai', password: 'Mantram@2024' })
}).then(r => r.json());
await page.evaluateOnNewDocument((tok) => { localStorage.setItem('mantram_token', tok); }, lr.token);
await page.goto('http://127.0.0.1:5173/analytics', { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 6000));

const els = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('*'));
  return all
    .filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 100 && r.height > 100 && r.right > 1300 && r.top < 800;
    })
    .slice(0, 20)
    .map(el => ({
      tag: el.tagName,
      cls: (el.className || '').toString().slice(0, 80),
      id: el.id || '',
      text: (el.innerText || '').slice(0, 60).replace(/\n/g, ' '),
      rect: { x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y, w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height },
    }));
});
console.log(JSON.stringify(els, null, 2));
await browser.close();
