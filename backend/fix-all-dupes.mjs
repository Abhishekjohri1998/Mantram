// Scan ALL .js / .mjs files under node_modules for full-content duplication
// (file size = even AND first half exactly equals second half) and dedupe.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('node_modules');

async function* walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      // Skip nested node_modules to avoid blowups
      if (e.name === '.bin' || e.name === '.cache') continue;
      yield* walk(full);
    } else if (e.isFile() && (full.endsWith('.js') || full.endsWith('.mjs') || full.endsWith('.cjs'))) {
      yield full;
    }
  }
}

let scanned = 0, fixed = 0, samples = [];
for await (const f of walk(ROOT)) {
  scanned++;
  let st;
  try { st = statSync(f); } catch { continue; }
  if (st.size < 40 || st.size % 2 !== 0) continue;
  if (st.size > 2_000_000) continue;
  const c = readFileSync(f, 'utf8');
  const halfLen = c.length / 2;
  if (!Number.isInteger(halfLen)) continue;
  const a = c.slice(0, halfLen);
  const b = c.slice(halfLen);
  if (a === b && a.length > 0) {
    writeFileSync(f, a, 'utf8');
    fixed++;
    if (samples.length < 20) samples.push(f.replace(ROOT, ''));
  }
}
console.log(`Scanned: ${scanned}, Fixed: ${fixed}`);
console.log('Samples:');
for (const s of samples) console.log(' ', s);
