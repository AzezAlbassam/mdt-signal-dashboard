#!/usr/bin/env node
// Refreshes the live fields in dividend-data.json (price, market cap, trailing dividend)
// from Financial Modeling Prep. Research fields — growth, streak, payout — are left alone;
// those are judgement calls, not API rows.
//
//   FMP_API_KEY=xxx node tools/refresh-dividends.mjs
//
// Exits 0 and changes nothing if the key is missing, so a scheduled run without the
// secret configured is a clean no-op rather than a red build.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const KEY = process.env.FMP_API_KEY;
if (!KEY) {
  console.log('FMP_API_KEY not set — leaving dividend-data.json untouched.');
  process.exit(0);
}

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'dividend-data.json');
const data = JSON.parse(await readFile(FILE, 'utf8'));

let ok = 0, failed = [];

for (const c of data.companies) {
  const url = 'https://financialmodelingprep.com/stable/profile?symbol=' +
              encodeURIComponent(c.s) + '&apikey=' + encodeURIComponent(KEY);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const [row] = await res.json();
    if (!row || typeof row.price !== 'number' || row.price <= 0) throw new Error('no price');

    c.p = Number(row.price.toFixed(2));
    if (typeof row.marketCap === 'number' && row.marketCap > 0) c.mc = row.marketCap;
    // `dr` is the hand-set regular dividend for the names that pay specials — the API's
    // trailing figure includes those, so it must not overwrite it
    if (typeof row.lastDividend === 'number' && row.lastDividend > 0 && c.dr == null) {
      c.d = row.lastDividend;
    }
    ok++;
  } catch (err) {
    failed.push(`${c.s} (${err.message})`);
  }
}

if (ok === 0) {
  console.error('Every request failed — not writing. First few: ' + failed.slice(0, 3).join(', '));
  process.exit(1);
}

data.generated = new Date().toISOString().slice(0, 10);
await writeFile(FILE, JSON.stringify(data, null, 2) + '\n');

console.log(`Updated ${ok}/${data.companies.length} companies.`);
if (failed.length) console.log('Failed: ' + failed.join(', '));
