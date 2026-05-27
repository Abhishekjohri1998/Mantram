// One-shot: dedupe corrupted stripe ESM files where content is doubled.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('node_modules/stripe/esm');
const MARKER = '// File generated from our OpenAPI spec';

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(full));
    else if (e.isFile() && full.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = await walk(ROOT);
let fixed = 0;
for (const f of files) {
  const c = readFileSync(f, 'utf8');
  if (!c.startsWith(MARKER)) continue;
  // Find second occurrence
  const idx2 = c.indexOf(MARKER, MARKER.length);
  if (idx2 === -1) continue;
  // Check if first half == second half (true duplication)
  const half = c.slice(0, idx2);
  const rest = c.slice(idx2);
  if (rest === half) {
    writeFileSync(f, half, 'utf8');
    fixed++;
    console.log('Deduped:', f.replace(ROOT, ''));
  } else if (rest.startsWith(half.trimEnd())) {
    // Tail might have extra whitespace
    writeFileSync(f, half, 'utf8');
    fixed++;
    console.log('Deduped (trim):', f.replace(ROOT, ''));
  }
}
console.log(`\nDone. Fixed ${fixed} files.`);
