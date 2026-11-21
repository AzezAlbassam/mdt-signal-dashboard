// Shared SEC fetch for the stock loader (sec-load.js) and the fund loader (fund-load.js).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { secInputs } from '../../engine/sec-facts.js';

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// GET with SEC's required contact header, 3 tries; null on HTTP errors (curl -f exit 22)
export function getter() {
  const UA = process.env.SEC_USER_AGENT;
  if (!UA) throw new Error('SEC_USER_AGENT is not set');
  return (url, json = true) => {
    for (let i = 0; i < 3; i++) {
      try { sleep(150); const t = execFileSync('curl', ['-sf', '--max-time', '60', '-H', `User-Agent: ${UA}`, url], { maxBuffer: 1 << 28 }).toString(); return json ? JSON.parse(t) : t; }
      catch (e) { if (e.status === 22) return null; sleep(2000 * (i + 1)); }
    }
    return null;
  };
}

// ticker -> CIK and the list of companies (SEC company_tickers.json)
export function companies(get) {
  const rows = Object.values(get('https://www.sec.gov/files/company_tickers.json') ?? {}).map((r) => ({ cik: String(r.cik_str).padStart(10, '0'), ticker: r.ticker, title: r.title }));
  if (rows.length < 5000) throw new Error('SEC company list did not load');
  return rows;
}

// ICE BofA US Corporate Index effective yield (A8), daily, percent -> average over a period
export function yieldAverager(get) {
  const yields = (get('https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLC0A0CMEY', false) ?? '').trim().split('\n').slice(1)
    .map((l) => l.split(',')).filter(([, v]) => v && v !== '.').map(([d, v]) => [d, +v]);
  if (!yields.length) throw new Error('FRED yield series did not load');
  return (a, b) => { const v = yields.filter(([d]) => d >= a && d <= b).map(([, y]) => y); return v.length ? v.reduce((s, y) => s + y, 0) / v.length : null; };
}

// One company's inputs (or {error}). SEC_CACHE: a folder of companyfacts saved earlier the same day (<cik>.json).
export function inputsFor(cik, get, avgYield) {
  const cached = process.env.SEC_CACHE && existsSync(`${process.env.SEC_CACHE}/${cik}.json`);
  const cf = cached ? JSON.parse(readFileSync(`${process.env.SEC_CACHE}/${cik}.json`)) : get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
  const sub = get(`https://data.sec.gov/submissions/CIK${cik}.json`);
  if (!cf) return { cik, error: 'no XBRL facts', sic: sub?.sic ?? null };
  const minEnd = new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10);
  const probe = secInputs(cf, { yieldPct: 0, minEnd });
  const y = probe.period ? avgYield(probe.period.start, probe.period.end) : null;
  const r = probe.period ? secInputs(cf, { yieldPct: y, minEnd }) : probe;
  // T4 freshness: is there a 10-Q/10-K newer than the period we used?
  const rec = sub?.filings?.recent ?? {};
  const latest = (rec.form ?? []).map((f, i) => ({ f, d: rec.filingDate[i], p: rec.reportDate[i] })).find((x) => /^10-[QK]/.test(x.f));
  return { cik, sic: sub?.sic ?? null, sicDescription: sub?.sicDescription ?? null, yieldPct: y, ...r,
    newerFiling: latest && r.period && latest.p > r.period.end ? latest : null };
}
