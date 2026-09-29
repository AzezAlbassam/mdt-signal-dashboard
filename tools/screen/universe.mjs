#!/usr/bin/env node
// Builds the list of companies the automated screen looks at, writing tools/screen/universe.json.
//
//   node tools/screen/universe.mjs
//
// Dividends tab: NYSE/Nasdaq-listed US companies worth $300M–$15B that paid a dividend in their
// last two fiscal years. Growth tab: US companies worth $300M–$50B whose revenue grew at least
// a third over three years. Both lists are rough cuts — the rules in rules.mjs decide the
// ranking, from each company's own filings.
//
// Which companies paid and how revenue moved come from SEC XBRL frames (one concept across
// every filer). Market caps come from Nasdaq's public screener snapshot, which covers every
// US listing in one request.

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tickerMap, frame, cached, normTicker } from './sec.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const CACHE = join(ROOT, '.cache', 'screen');

const DIV_CAP = [300e6, 15e9];
const GROWTH_CAP = [300e6, 50e9];
const GROWTH_MIN_RATIO = 4 / 3;      // revenue up a third in three years, about 10% a year
const GROWTH_MIN_REVENUE = 50e6;

export async function nasdaqSnapshot(maxAgeDays = 1) {
  return cached(join(CACHE, 'nasdaq.json'), maxAgeDays, async () => {
    const r = await fetch('https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25&offset=0&download=true', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/',
      },
    });
    if (!r.ok) throw new Error('Nasdaq screener HTTP ' + r.status);
    const j = await r.json();
    const rows = (j.data?.rows || []).map(x => ({
      s: normTicker(x.symbol), name: x.name, price: Number(String(x.lastsale).replace(/[$,]/g, '')),
      mc: Number(x.marketCap) || 0, country: x.country || '',
    })).filter(x => x.price > 0);
    return { asOf: new Date().toISOString().slice(0, 10), rows };
  });
}

// cik -> value for a frame, taking the largest where a filer appears twice
async function byCik(concept, unit, period) {
  const m = new Map();
  for (const d of await frame(CACHE, concept, unit, period)) {
    if (!(d.val > 0)) continue;
    if (!m.has(d.cik) || d.val > m.get(d.cik).val) m.set(d.cik, { val: d.val, loc: d.loc });
  }
  return m;
}

async function main() {
  const tickers = await tickerMap(join(CACHE, 'tickers.json'));
  const snap = await nasdaqSnapshot();
  console.log(`SEC listings: ${tickers.size}; Nasdaq snapshot ${snap.asOf}: ${snap.rows.length} rows`);

  // who paid a dividend in the last two calendar-aligned fiscal years
  const payers = new Map();
  for (const period of ['CY2025', 'CY2024']) {
    for (const [c, u] of [['CommonStockDividendsPerShareDeclared', 'USD-per-shares'], ['CommonStockDividendsPerShareCashPaid', 'USD-per-shares'],
                          ['PaymentsOfDividendsCommonStock', 'USD'], ['PaymentsOfDividends', 'USD']]) {
      for (const [cik, v] of await byCik(c, u, period)) if (!payers.has(cik)) payers.set(cik, v.loc);
    }
  }

  // revenue three years apart, whichever revenue concept the filer used
  const rev = {};
  for (const period of ['CY2025', 'CY2024', 'CY2022', 'CY2021']) {
    rev[period] = new Map();
    for (const c of ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax']) {
      for (const [cik, v] of await byCik(c, 'USD', period)) {
        if (!rev[period].has(cik) || v.val > rev[period].get(cik).val) rev[period].set(cik, v);
      }
    }
  }
  const growthRatio = cik => {
    for (const [a, b] of [['CY2025', 'CY2022'], ['CY2024', 'CY2021']]) {
      const now = rev[a].get(cik), then = rev[b].get(cik);
      if (now && then) return { ratio: now.val / then.val, latest: now.val, loc: now.loc };
    }
    return null;
  };

  const verified = JSON.parse(await readFile(join(ROOT, 'dividend-data.json'), 'utf8')).companies.map(c => c.s);
  const renamed = { CSWI: 'CSW' };   // CSW Industrials now trades as CSW on the NYSE

  // One listing per company: the common stock. Notes, debentures, preferreds and depositary
  // shares are listed under the parent's CIK and would otherwise borrow its dividend history.
  const NOT_COMMON = /\bnotes?\b|debenture|preferred|depositary|subordinated|warrant|\brights?\b|\bunits?\b|\d+(\.\d+)?%/i;
  const primary = new Map();
  for (const row of snap.rows) {
    const t = tickers.get(row.s);
    if (!t || NOT_COMMON.test(row.name)) continue;
    const cur = primary.get(t.cik);
    if (!cur || row.mc > cur.row.mc) primary.set(t.cik, { row, t });
  }

  const out = [];
  for (const { row, t } of primary.values()) {
    const payerLoc = payers.get(t.cik);
    const g = growthRatio(t.cik);
    const us = row.country === 'United States' || /^US-/.test(payerLoc || g?.loc || '');
    if (!us) continue;
    const tabs = [];
    if (row.mc >= DIV_CAP[0] && row.mc <= DIV_CAP[1] && payerLoc !== undefined) tabs.push('div');
    if (row.mc >= GROWTH_CAP[0] && row.mc <= GROWTH_CAP[1] && g && g.ratio >= GROWTH_MIN_RATIO && g.latest >= GROWTH_MIN_REVENUE) tabs.push('growth');
    const wasVerified = verified.find(v => (renamed[v] || v) === row.s);
    if (wasVerified && !tabs.includes('div')) tabs.push('div');
    if (!tabs.length) continue;
    out.push({ s: row.s, cik: t.cik, name: t.name, x: t.exchange, tabs, ...(wasVerified ? { verified: wasVerified } : {}) });
  }
  const list = out.sort((a, b) => a.s.localeCompare(b.s));

  const n = k => list.filter(c => c.tabs.includes(k)).length;
  await writeFile(join(HERE, 'universe.json'), JSON.stringify({
    built: new Date().toISOString().slice(0, 10),
    criteria: {
      div: 'NYSE/Nasdaq, US, $300M–$15B, paid a dividend in fiscal 2024 or 2025 (SEC XBRL frames)',
      growth: 'NYSE/Nasdaq, US, $300M–$50B, revenue up at least a third over three years and above $50M',
    },
    companies: list,
  }, null, 0).replace(/\},\{/g, '},\n{') + '\n');
  console.log(`universe: ${list.length} companies — dividends ${n('div')}, growth ${n('growth')}, both ${list.filter(c => c.tabs.length > 1).length}`);
  const missing = verified.filter(v => !list.some(c => c.verified === v));
  if (missing.length) console.log('verified companies not listed:', missing.join(', '));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
