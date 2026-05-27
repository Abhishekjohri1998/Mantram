import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const report = JSON.parse(readFileSync(path.resolve('scratch/bughunt/report.json'), 'utf8'));

console.log(`\n=== Triage of ${report.runs.length} runs ===\n`);

// 1) The recurring JS error
const errBuckets = new Map();
for (const r of report.runs) {
  for (const e of r.pageErrors || []) {
    const key = e.message.slice(0, 120);
    if (!errBuckets.has(key)) errBuckets.set(key, []);
    errBuckets.get(key).push(r.tag);
  }
  for (const c of r.consoleErrors || []) {
    const key = '[console] ' + c.text.slice(0, 120);
    if (!errBuckets.has(key)) errBuckets.set(key, []);
    errBuckets.get(key).push(r.tag);
  }
}
console.log('--- Top page/console errors ---');
[...errBuckets.entries()]
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 15)
  .forEach(([msg, tags]) => {
    console.log(`(${tags.length}x) ${msg}`);
    console.log('   first hits:', tags.slice(0, 3).join(', '));
  });

// 2) Routes with most network failures
console.log('\n--- Routes with most network failures ---');
const netByRoute = new Map();
for (const r of report.runs) {
  netByRoute.set(r.tag, r.netFailCount);
}
[...netByRoute.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12)
  .forEach(([tag, n]) => console.log(`  ${n.toString().padStart(3)}  ${tag}`));

// 3) Aggregated unique failing URLs
console.log('\n--- Unique failing URLs (top 25) ---');
const urlBuckets = new Map();
for (const r of report.runs) {
  for (const f of r.netFails || []) {
    const key = (f.url || 'unknown').split('?')[0] + ' ' + (f.status || f.reason || 'err');
    urlBuckets.set(key, (urlBuckets.get(key) || 0) + 1);
  }
}
[...urlBuckets.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 25)
  .forEach(([url, n]) => console.log(`  ${n.toString().padStart(3)}x ${url}`));

// 4) Suspiciously thin pages (mobile-only blanks)
console.log('\n--- Pages with <500 chars body text (likely blank) ---');
const blanks = report.runs.filter(r => (r.meta?.bodyTextLen || 0) < 500);
for (const b of blanks) {
  console.log(`  ${b.tag}  meta=${JSON.stringify(b.meta)}`);
}

// 5) Mobile vs desktop char delta (mobile much thinner = likely broken responsive)
console.log('\n--- Routes where mobile << desktop body text (responsive bug suspects) ---');
const byRoute = {};
for (const r of report.runs) byRoute[r.tag] = r;
const routeNames = new Set(report.runs.map(r => r.route));
for (const route of routeNames) {
  const d = report.runs.find(r => r.route === route && r.viewport === 'desktop');
  const m = report.runs.find(r => r.route === route && r.viewport === 'mobile');
  if (!d || !m) continue;
  const dn = d.meta?.bodyTextLen || 0;
  const mn = m.meta?.bodyTextLen || 0;
  if (dn > 1500 && mn < dn * 0.4) {
    console.log(`  ${route}   desktop=${dn}  mobile=${mn}  (mobile/desktop=${(mn / dn * 100).toFixed(0)}%)`);
  }
}

// 6) URLs that redirected unexpectedly
console.log('\n--- Routes where final URL ≠ requested URL ---');
for (const r of report.runs) {
  if (!r.finalUrl) continue;
  const expected = `http://127.0.0.1:5173${r.route}`;
  if (!r.finalUrl.startsWith(expected)) {
    console.log(`  ${r.tag}  ${r.route}  →  ${r.finalUrl.replace('http://127.0.0.1:5173', '')}`);
  }
}
