// Shared SEC fetch for the stock loader (sec-load.js) and the fund loader (fund-load.js).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { secInputs } from '../../engine/sec-facts.js';

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// The contact header SEC requires goes to SEC's own hosts only (fix review 2026-11-22: it had been sent to FRED too);
// other sites get curl's own default client name (FRED drops an unknown one)
export const uaFor = (url, ua) => (/(^|\.)sec\.gov$/.test(new URL(url).hostname) ? ua : null);

// GET with SEC's required contact header. A 404 is no data (null); a 403 or 429 (SEC's rate limit, which lasts about
// ten minutes) or a server error is waited out, doubling from 30 s to about 15 minutes in all, then null (fix review
// 2026-11-22: a throttled fetch had read as a company without numbers). SEC_BACKOFF_MS shortens the wait in tests.
export function getter() {
  const UA = process.env.SEC_USER_AGENT;
  if (!UA) throw new Error('SEC_USER_AGENT is not set');
  const base = +(process.env.SEC_BACKOFF_MS ?? 30e3);
  return (url, json = true) => {
    const ua = uaFor(url, UA);
    for (let i = 0; i < 5; i++) {
      try {
        sleep(150);
        const out = execFileSync('curl', ['-s', '--max-time', '60', '-w', '\n%{http_code}', ...(ua ? ['-H', `User-Agent: ${ua}`] : []), url], { maxBuffer: 1 << 28 }).toString();
        const cut = out.lastIndexOf('\n'), code = +out.slice(cut + 1), body = out.slice(0, cut);
        if (code === 200) return json ? JSON.parse(body) : body;
        if (code === 404) return null;
      } catch { /* a dropped connection or a broken body: try again */ }
      sleep(base * 2 ** i);
    }
    return null;
  };
}

// Entries that had numbers last time and have none now (a refused or failed fetch reads as 'no XBRL facts'), or lost
// their industry code (a refused submissions fetch): the weekly run stops on more than a few (audit 2026-11-22)
export const newErrors = (prev, next) => Object.entries(next).filter(([k, v]) => prev?.[k] && !prev[k].error && (v?.error || (prev[k].sic && !v?.sic)))
  .map(([k, v]) => `${k} (${v?.error ?? 'no SIC'})`);
export const MAX_NEW_ERRORS = 5;

// ticker -> CIK and the list of companies (SEC company_tickers.json)
export function companies(get) {
  const rows = Object.values(get('https://www.sec.gov/files/company_tickers.json') ?? {}).map((r) => ({ cik: String(r.cik_str).padStart(10, '0'), ticker: r.ticker, title: r.title }));
  if (rows.length < 5000) throw new Error('SEC company list did not load');
  return rows;
}

// ICE BofA US Corporate Index effective yield (A8), daily, percent -> average over a period; another FRED series by id
// (DTB3: the 3-month Treasury bill, for the interest a fund earns on its own bills and money funds)
export function yieldAverager(get, id = 'BAMLC0A0CMEY') {
  const yields = (get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, false) ?? '').trim().split('\n').slice(1)
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
