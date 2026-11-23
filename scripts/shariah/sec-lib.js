// Shared SEC fetch for the stock loader (sec-load.js) and the fund loader (fund-load.js).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { secInputs } from '../../engine/sec-facts.js';

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// The contact header SEC requires goes to SEC's own hosts only (fix review 2026-11-22: it had been sent to FRED too);
// other sites get curl's own default client name (FRED drops an unknown one)
export const uaFor = (url, ua) => (/(^|\.)sec\.gov$/.test(new URL(url).hostname) ? ua : null);

// GET with SEC's required contact header. A 404 is no data (null); a 403 or 429 (SEC's rate limit, which lasts about
// ten minutes) or a server error is waited out, doubling from 30 s, with a sixth try after about 15 minutes (fix review
// 2026-11-22: a throttled fetch had read as a company without numbers). Still refused then, the run stops: the loaders
// write at the end, so nothing is written (final check 2026-11-22: the fifth try came before the block lifted). A
// server error or a dropped connection that lasts reads as no data, as before. SEC_BACKOFF_MS shortens the wait in tests.
export function getter() {
  const UA = process.env.SEC_USER_AGENT;
  if (!UA) throw new Error('SEC_USER_AGENT is not set');
  const base = +(process.env.SEC_BACKOFF_MS ?? 30e3);
  return (url, json = true) => {
    const ua = uaFor(url, UA);
    let code = 0, refused = false;
    for (let i = 0; i < 6; i++) {
      if (i) sleep(base * 2 ** (i - 1));
      try {
        sleep(150);
        const out = execFileSync('curl', ['-s', '--max-time', '60', '-w', '\n%{http_code}', ...(ua ? ['-H', `User-Agent: ${ua}`] : []), url], { maxBuffer: 1 << 28 }).toString();
        const cut = out.lastIndexOf('\n'), body = out.slice(0, cut);
        code = +out.slice(cut + 1);
        refused ||= code === 403 || code === 429;
        if (code === 200) return json ? JSON.parse(body) : body;
        if (code === 404) return null;
      } catch { code = 0; /* a dropped connection or a broken body: try again */ }
    }
    // (a refusal on any try, whatever the last one got: review of the final check, five 429s and then a 503 read as none)
    if (refused) throw new Error(`SEC refused ${url} (HTTP 403/429) for about 15 minutes: stopped, nothing written`);
    return null;
  };
}

// Entries that had numbers last time and have none now (a refused or failed fetch reads as 'no XBRL facts'), or lost
// their industry code (a refused submissions fetch): the weekly run stops on more than a few (audit 2026-11-22)
export const newErrors = (prev, next) => Object.entries(next).filter(([k, v]) => prev?.[k] && !prev[k].error && (v?.error || (prev[k].sic && !v?.sic)))
  .map(([k, v]) => `${k} (${v?.error ?? 'no SIC'})`);
export const MAX_NEW_ERRORS = 5;
// funds that had their holdings last time and have none now (a refused N-PORT fetch): any one stops the run (fix review
// round 2: XLK and SPUS would have been published as «ما لقينا تقرير مكوناته»)
export const lostFunds = (prev, next) => next.filter((f) => !f.rows && f.err && prev.find((p) => p.sym === f.sym)?.rows).map((f) => `${f.sym} (${f.err})`);

// Which near-line holdings get their quarter average first (band-needed.json): those whose answer can change a fund's
// verdict (verification 2026-11-22: 8 of the first 10 could change none). In a passing fund, a pass that would turn
// unknown, or an unknown whose fail would cross 5% (final check 2026-11-22: an unknown row's weight is already in the
// sum: DHI's 0.103% in SPUS was counted twice); in an unjudged fund under 5% non-compliant, an unknown that would pass
// it, or any row whose fail would cross 5%; never a fund past its 150 days.
export const canFlip = (f, x) => {
  if (f.old || !(f.badWeight < 0.05)) return false;
  const w = Math.abs(x.w), sum = f.badWeight + f.unknownWeight;
  if (f.state === 'مختلط جائز') return x.s === 'ما ينحكم' ? f.badWeight + w >= 0.05 : sum + w >= 0.05;
  return (x.s === 'ما ينحكم' && sum - w < 0.05) || f.badWeight + w >= 0.05;
};

// The average daily close over a quarter from saved bars ({date: [...], close: [...]}): only when the bars run from the
// quarter's start (give or take a long weekend) to past its end, with 40 trading days or more; else null. The stock page
// carries these, so its verdict does not wait for TradingView (2026-11-23).
export function barsQuarterAvg(b, start, end) {
  const days = (b?.date ?? []).map((d, i) => [d, b.close[i]]).filter(([d, c]) => d >= start && d <= end && c > 0);
  if (days.length < 40 || !(b.date.at(-1) >= end) || (Date.parse(days[0][0]) - Date.parse(start)) / 864e5 > 5 || (Date.parse(end) - Date.parse(days.at(-1)[0])) / 864e5 > 5) return null;
  return { a: days.reduce((s, [, c]) => s + c, 0) / days.length, n: days.length, last: b.date.at(-1) };
}

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

// 0.00% convertible notes read from the filings (data/shariah/zero-coupon.json): in the high debt reading only, until the
// owner decides (A4)
const ZERO = (() => { try { return JSON.parse(readFileSync(new URL('../../data/shariah/zero-coupon.json', import.meta.url), 'utf8')).companies ?? {}; } catch { return {}; } })();
export const zeroCouponOf = (cik) => ZERO[cik] ?? null;

// does SEC's data hold any fact from a filing made on or after that date?
const factsFiledFrom = (cf, d) => Object.values(cf.facts ?? {}).some((nsx) => Object.values(nsx).some((t) => Object.values(t.units ?? {}).some((us) => us.some((x) => x.filed >= d))));

// One company's inputs (or {error}). SEC_CACHE: a folder of companyfacts saved earlier the same day (<cik>.json).
export function inputsFor(cik, get, avgYield) {
  const cached = process.env.SEC_CACHE && existsSync(`${process.env.SEC_CACHE}/${cik}.json`);
  const cf = cached ? JSON.parse(readFileSync(`${process.env.SEC_CACHE}/${cik}.json`)) : get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
  const sub = get(`https://data.sec.gov/submissions/CIK${cik}.json`);
  if (!cf) return { cik, error: 'no XBRL facts', sic: sub?.sic ?? null };
  const minEnd = new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10);
  const probe = secInputs(cf, { yieldPct: 0, minEnd });
  const y = probe.period ? avgYield(probe.period.start, probe.period.end) : null;
  const r = probe.period ? secInputs(cf, { yieldPct: y, minEnd, sic: sub?.sic, zeroCoupon: zeroCouponOf(cik) }) : probe;
  // T4 freshness: is there a 10-Q/10-K newer than the period we used?
  const rec = sub?.filings?.recent ?? {};
  const latest = (rec.form ?? []).map((f, i) => ({ f, d: rec.filingDate[i], p: rec.reportDate[i] })).find((x) => /^10-[QK]/.test(x.f));
  // a non-reliance notice (8-K item 4.02) filed after the report in use: its figures are withdrawn until SEC's data carries
  // the quarter refiled or a newer one, which moves period.filed past the notice (final check 2026-11-22: Datavault AI's
  // Q2 2026 10-Q, 8-K of 2026-10-26; a 10-K/A of the withdrawn year leaves the withdrawn quarter in use)
  const filed = (rec.form ?? []).map((f, i) => ({ f, d: rec.filingDate[i], items: rec.items?.[i] ?? '' }));
  const nonReliance = r.period ? filed.find((x) => x.f === '8-K' && /(^|,)\s*4\.02\b/.test(x.items) && x.d > r.period.filed)?.d ?? null : null;
  return { cik, sic: sub?.sic ?? null, sicDescription: sub?.sicDescription ?? null, yieldPct: y, ...r, ...(nonReliance ? { nonReliance } : {}),
    // (a stale entry too: NextEra's figures stop at 2026-03-31 while 10-Qs were filed after; final check 2026-11-22. inData:
    // SEC's data has facts from that filing on, so only its revenue is under tags we do not read: APA, TMC)
    newerFiling: latest && (r.period ? latest.p > r.period.end : r.stale && latest.p > r.stale)
      ? (r.period ? latest : { ...latest, inData: factsFiledFrom(cf, latest.d) })
      : null };
}
