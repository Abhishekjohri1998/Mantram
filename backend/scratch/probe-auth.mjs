import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
await page.goto('http://127.0.0.1:5173/auth', { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 3000));
const html = await page.evaluate(() => ({
  visibleText: (document.body.innerText || '').slice(0, 500),
  forms: document.querySelectorAll('form').length,
  inputs: Array.from(document.querySelectorAll('input')).map(i => ({ type: i.type, name: i.name, placeholder: i.placeholder })),
  buttons: Array.from(document.querySelectorAll('button')).map(b => (b.innerText || '').trim()).filter(Boolean).slice(0, 15),
  rootChildren: document.getElementById('root').children.length,
  rootInnerHtmlSize: document.getElementById('root').innerHTML.length,
}));
console.log('errors:', errors.slice(0, 5));
console.log('meta:', JSON.stringify(html, null, 2));
await browser.close();
