import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });

const lr = await fetch('http://127.0.0.1:3001/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@mantram.ai', password: 'Mantram@2024' })
}).then(r => r.json());

await page.evaluateOnNewDocument((tok) => {
  localStorage.setItem('mantram_token', tok);
}, lr.token);

const navHistory = [];
page.on('framenavigated', f => { if (f === page.mainFrame()) navHistory.push(f.url()); });

await page.goto('http://127.0.0.1:5173/nexus', { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 4000));
console.log('Final URL:', page.url());
console.log('Navigation history:', navHistory);
console.log('Errors:', errs.slice(0, 5));
await browser.close();
