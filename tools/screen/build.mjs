#!/usr/bin/env node
// Builds the dashboard's data from SEC filings and one price snapshot:
//
//   node tools/screen/universe.mjs     # who is in scope (rarely needs re-running)
//   node tools/screen/build.mjs        # everything else — writes screen-data.json and screen-series.json
//
// For every company in tools/screen/universe.json: pull its filer profile and XBRL facts from
// SEC EDGAR (cached a week under .cache/screen), derive split-adjusted fiscal-year history
// (derive.mjs), and apply the dividend and growth rules (rules.mjs). The 43 companies in
// dividend-data.json that were reviewed by hand keep their reviewed figures and verdicts on
// the dividends tab; everything else is the automated read of the filings.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { companyProfile, companyFacts } from './sec.mjs';
import { derive } from './derive.mjs';
import { rateDividend, rateGrowth, excluded, kindOf, sectorOf, DIV_RULES, GROWTH_RULES } from './rules.mjs';
import { nasdaqSnapshot } from './universe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const CACHE = join(ROOT, '.cache', 'screen');
const fin = v => typeof v === 'number' && isFinite(v);
const r1 = v => fin(v) ? Math.round(v * 10) / 10 : v === Infinity ? 999 : v === -Infinity ? -999 : null;
const r2 = v => fin(v) ? Math.round(v * 100) / 100 : null;
const r4 = v => fin(v) ? Math.round(v * 1e4) / 1e4 : null;
const mil = v => fin(v) ? Math.round(v / 1e5) / 10 : null;     // $ millions, one decimal

const universe = JSON.parse(await readFile(join(HERE, 'universe.json'), 'utf8'));
const only = process.argv.slice(2).map(s => s.toUpperCase());
const list = universe.companies.filter(c => !only.length || only.includes(c.s) || only.includes(c.verified));
// Nasdaq's endpoint sometimes refuses cloud runners; then last run's prices stand, dated as such
let snap;
try {
  snap = await nasdaqSnapshot();
} catch (e) {
  const prev = JSON.parse(await readFile(join(ROOT, 'screen-data.json'), 'utf8'));
  console.log(`Price snapshot failed (${e.message}); keeping prices from ${prev.prices.asOf}.`);
  snap = { asOf: prev.prices.asOf, rows: prev.companies.map(c => ({ s: c.s, price: c.p, mc: c.mc })) };
}
const px = new Map(snap.rows.map(r => [r.s, r]));
const reviewed = JSON.parse(await readFile(join(ROOT, 'dividend-data.json'), 'utf8'));
const reviewedFull = JSON.parse(await readFile(join(ROOT, 'dividend-stocks.json'), 'utf8'));

const out = [], series = {}, skipped = [], failed = [];
let done = 0;

async function one(c) {
  const sub = await companyProfile(CACHE, c.s, c.cik);
  const why = excluded(sub?.sic ?? null, sub?.name || c.name);
  if (why && !c.verified) { skipped.push([c.s, why]); return; }
  const x = await companyFacts(CACHE, c.s, c.cik);
  if (x.missing) { failed.push([c.s, x.missing]); return; }
  const kind = kindOf(sub?.sic);
  const mkt = px.get(c.s);
  const d = derive(x, sub, mkt, { kind });
  if (d.error) { failed.push([c.s, d.error]); return; }
  const mc = mkt?.mc > 0 ? mkt.mc : fin(x.cover?.shares) && mkt?.price ? x.cover.shares * mkt.price : null;
  const lastFY = Number(d.lastEnd.slice(0, 4));
  const warns = d.notes.filter(n => n.sev === 'warn').length;
  const conf = d.stale || warns >= 2 ? 'low' : warns === 1 ? 'medium' : 'high';

  const row = {
    s: c.s, n: sub?.name || c.name, cik: c.cik, x: c.x, sec: sectorOf(sub?.sic), sic: sub?.sic ?? null, k: kind,
    p: r2(mkt?.price), mc: fin(mc) ? Math.round(mc) : null, fy: d.lastEnd, stale: d.stale || undefined,
  };

  if (c.tabs.includes('div')) {
    const dv = { ...d.div, lastFY };
    const rate = rateDividend(dv, mc);
    // a special-heavy or patchy dividend record lowers confidence on top of the general warnings
    const dConf = dv.sources.some(s => /three quarters|cash paid/.test(s)) && conf === 'high' ? 'medium' : conf;
    row.d = {
      y: r2(dv.yield), dps: r4(dv.dpsCur), cb: dv.curBasis, g5: r1(dv.g5), gy: dv.gYears, st: dv.streak, so: dv.streakOpen || undefined,
      yrs: dv.yrs, fy1: dv.firstYear, po: r1(dv.payout), pb: dv.payoutBasis, cov: r1(dv.cover5), roic: r1(dv.roic), nde: r2(dv.nde),
      cuts: dv.cuts.length ? dv.cuts : undefined, cutAfter: dv.cutAfter || undefined, sp: dv.specialYears.length ? dv.specialYears : undefined,
      r: rate.r, v: rate.v, pass: rate.pass, of: rate.of, sc: rate.sc, why: rate.why.length ? rate.why : undefined, conf: dConf,
    };
    const rv = c.verified && reviewed.companies.find(v => v.s === c.verified);
    if (rv?.v) {
      const full = reviewedFull.stocks.find(v => v.s === c.verified);
      const rules = full?.analysis?.rules || [];
      const rr = DIV_RULES.map(R => { const m = rules.find(x => x.id === R.id); return m ? (m.pass ? 1 : 0) : null; });
      const V = rv.v;
      row.ver = c.verified;
      row.d = {
        ...row.d, y: fin(V.dpsReg) && mkt?.price ? r2(V.dpsReg / mkt.price * 100) : row.d.y, dps: V.dpsReg ?? row.d.dps, cb: 'reviewed current rate',
        g5: V.g5, st: V.st, so: undefined, po: V.po, pb: 'reviewed', cov: V.fcfG5, roic: V.roic, nde: V.nde,
        r: rr, v: V.verdict, pass: V.pass, of: 10, conf: V.conf, why: undefined, moat: rv.m,
        auto: { g5: row.d.g5, st: row.d.st, po: row.d.po, v: row.d.v },
      };
    }
  }
  if (c.tabs.includes('growth') && kind !== 'insurer') {
    const g = d.gro;
    const rate = rateGrowth(g);
    row.g = {
      rev: mil(g.rev), rg: r1(g.revG3), ry: r1(g.revYoY), up: g.revUp, seen: g.revSeen, gm: r1(g.gm), gmc: r1(g.gmChg),
      om: r1(g.opm), omc: r1(g.opmChg), fm: r1(g.fcfm), fp: g.fcfPos3, roic: r1(g.roic), nde: r2(g.nde), dil: r1(g.dil3),
      eg: r1(g.epsG3), pe: r1(g.pe), peg: r2(g.peg), r40: r1(g.r40),
      r: rate.r, v: rate.v, pass: rate.pass, of: rate.of, sc: rate.sc, why: rate.why.length ? rate.why : undefined, conf,
    };
  }
  if (!row.d && !row.g) return;
  out.push(row);

  const S = d.series;
  series[c.s] = {
    fy: S.fy, rev: S.rev.map(mil), gp: S.gp.map(mil), opi: S.opi.map(mil), ni: S.ni.map(mil), cfo: S.cfo.map(mil),
    capex: S.capex.map(mil), fcf: S.fcf.map(mil), div: S.div.map(mil), bb: S.buyback.map(mil),
    dps: S.dps.map(r4), dsp: S.dpsSpecial.some(v => v > 0) ? S.dpsSpecial.map(r4) : undefined, dsrc: S.dpsSource,
    eps: S.eps.map(r4), sh: S.shares.map(v => fin(v) ? Math.round(v / 1e4) / 100 : null),
    debt: S.debt.map(mil), cash: S.cash.map(mil), eq: S.equity.map(mil), ebitda: S.ebitda.map(mil),
    notes: d.notes.map(n => [n.sev === 'warn' ? 1 : 0, n.text]), splits: d.splits.map(s => [s.label, s.between]),
  };
}

// a small pool; the SEC queue in sec.mjs keeps the request rate polite regardless
const queue = list.slice();
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const c = queue.shift();
    try { await one(c); } catch (e) { failed.push([c.s, e.message]); }
    if (++done % 100 === 0) console.log(`${done}/${list.length}`);
  }
}));

out.sort((a, b) => a.s.localeCompare(b.s));
const count = (k, v) => out.filter(c => c[k]?.v === v).length;
const verdicts = ['strong', 'candidate', 'watch', 'avoid', 'unrated'];
const data = {
  generated: new Date().toISOString().slice(0, 10),
  prices: { asOf: snap.asOf, source: 'Nasdaq public stock screener (last sale)' },
  universe: universe.criteria,
  counts: {
    div: Object.fromEntries(verdicts.map(v => [v, count('d', v)])),
    growth: Object.fromEntries(verdicts.map(v => [v, count('g', v)])),
    excluded: skipped.length,
  },
  divRules: DIV_RULES, growthRules: GROWTH_RULES,
  companies: out,
};
if (!only.length) {
  await writeFile(join(ROOT, 'screen-data.json'), JSON.stringify(data));
  await writeFile(join(ROOT, 'screen-series.json'), JSON.stringify(series));
} else {
  console.log(JSON.stringify(out, null, 1).slice(0, 6000));
}
console.log(`\n${out.length} companies written; ${skipped.length} excluded by type; ${failed.length} failed`);
console.log('dividends:', JSON.stringify(data.counts.div), '\ngrowth:', JSON.stringify(data.counts.growth));
if (failed.length) console.log('failed:', failed.slice(0, 40).map(f => f.join(' — ')).join('\n  '));
const why = {};
for (const [, w] of skipped) why[w] = (why[w] || 0) + 1;
console.log('excluded:', JSON.stringify(why));
