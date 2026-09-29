// The two rule sets the dashboard ranks by. Each rule returns 1 (pass), 0 (fail) or null (not
// assessable for this company — it then drops out of the count instead of counting as a fail).
// Verdict thresholds scale with how many rules were assessable: 80% for strong, 60% for
// candidate, 40% for watch — the same 8/6/4-of-10 bands the hand-reviewed list uses.

const fin = v => typeof v === 'number' && isFinite(v);
const b = v => v ? 1 : 0;

export const DIV_RULES = [
  { id: 1, name: 'Small enough to grow', test: 'Market value under $15B' },
  { id: 2, name: 'Starting yield in the usable band', test: 'Yield on the current regular dividend between 1.5% and 4%' },
  { id: 3, name: 'Dividend growing 8%+ a year', test: 'Regular dividend per share up at least 8% a year over five years' },
  { id: 4, name: 'Payout with room left', test: 'Regular dividends 20%–60% of free cash flow over three years (earnings for utilities and financials)' },
  { id: 5, name: 'A long record of raises', test: 'At least 10 consecutive yearly increases' },
  { id: 6, name: 'Cash flow growing faster than the dividend', test: 'Five-year growth of free cash flow (earnings for utilities and financials) at least matches dividend growth' },
  { id: 7, name: 'High return on capital', test: 'Return on invested capital above 12% (return on equity for insurers)' },
  { id: 8, name: 'Light debt', test: 'Net debt under 2.5× EBITDA' },
  { id: 9, name: 'A moat you can say in a sentence', test: 'Judged by hand — only for the reviewed companies' },
  { id: 10, name: 'Kept paying through 2020–21', test: 'No cut to the regular dividend in fiscal 2020 or 2021' },
];

export const GROWTH_RULES = [
  { id: 1, name: 'Fast revenue growth', test: 'Revenue up at least 15% a year over three years' },
  { id: 2, name: 'Growth that keeps going', test: 'Revenue up in each of the last four years, and at least 10% in the latest' },
  { id: 3, name: 'Pricing power', test: 'Gross margin of 40% or more' },
  { id: 4, name: 'Margins widening with scale', test: 'Operating margin positive and at least a point higher than three years ago' },
  { id: 5, name: 'Pays its own way', test: 'Positive free cash flow in each of the last three years' },
  { id: 6, name: 'High return on capital', test: 'Return on invested capital of 15% or more' },
  { id: 7, name: 'A balance sheet that can fund growth', test: 'Net debt under 2× EBITDA, or net cash' },
  { id: 8, name: 'Owners not diluted', test: 'Diluted share count growing under 3% a year over three years' },
  { id: 9, name: 'A price growth can justify', test: 'P/E divided by three-year EPS growth (PEG) under 2' },
  { id: 10, name: 'Rule of 40', test: 'Latest revenue growth plus free-cash-flow margin of 40 or more' },
];

// A hard stop decides on its own; otherwise a verdict needs enough of the rules to have been
// testable — eight for strong, seven for candidate, six for anything — so a company isn't
// rated strong on the strength of the rules its filings let us skip.
function verdictFrom(r, { gate, disq }) {
  const of = r.filter(x => x != null).length;
  const pass = r.filter(x => x === 1).length;
  let v;
  if (disq) v = 'avoid';
  else if (of < 6) v = 'unrated';
  else if (pass < Math.ceil(0.4 * of)) v = 'avoid';
  else if (pass >= Math.ceil(0.8 * of) && of >= 8 && gate.every(i => r[i] === 1)) v = 'strong';
  else if (pass >= Math.ceil(0.6 * of) && of >= 7) v = 'candidate';
  else v = 'watch';
  return { v, pass, of };
}

// ---- dividends --------------------------------------------------------------
export function rateDividend(d, mc) {
  const y = d.yield, g = d.g5, po = d.payout, st = d.streak;
  const r = [
    fin(mc) ? b(mc < 15e9) : null,
    fin(y) ? b(y >= 1.5 && y <= 4) : null,
    fin(g) ? b(g >= 8) : d.paying ? 0 : null,
    po == null ? null : b(fin(po) && po >= 20 && po <= 60),
    d.paying ? b(st >= 10 && st <= 30) : null,
    d.cover5 == null || !fin(g) ? null : b(d.cover5 >= g),
    fin(d.roic) ? b(d.roic > 12) : null,
    d.nde == null ? null : b(d.nde < 2.5),
    null,
    d.noCut2021 == null ? null : b(d.noCut2021),
  ];
  const lastFY = d.lastFY;
  const recentCut = (d.cuts || []).some(y => y > lastFY - 5);
  const disq = recentCut || d.cutAfter || (po != null && po > 90) || (d.nde != null && d.nde > 4) || !d.paying;
  const out = verdictFrom(r, { gate: [2, 3], disq });
  out.r = r;
  out.why = [recentCut && `cut in FY${d.cuts.filter(y => y > lastFY - 5).join(', FY')}`, d.cutAfter && 'cut since the last 10-K',
             po != null && po > 90 && (fin(po) ? `payout ${Math.round(po)}%` : 'payout exceeds cash flow'),
             d.nde != null && d.nde > 4 && (fin(d.nde) ? `net debt ${d.nde.toFixed(1)}× EBITDA` : 'net debt with negative EBITDA'),
             !d.paying && 'no dividend in the last fiscal year'].filter(Boolean);
  out.sc = fin(y) && fin(g) ? ptsYield(y) + ptsGrowth(g) + ptsPayout(fin(po) ? po : 999) + ptsSize(mc) + ptsStreak(st || 0) : null;
  return out;
}

// the same snowball score the reviewed screen uses — yield, growth, payout, size, streak
function ptsYield(y) { return y < 0.5 ? 2 : y < 1 ? 6 : y < 1.5 ? 12 : y <= 4 ? 20 : y <= 5.5 ? 14 : 6; }
function ptsGrowth(g) { return g > 20 ? 26 : g >= 12 ? 30 : g >= 10 ? 24 : g >= 8 ? 18 : g >= 6 ? 12 : g >= 4 ? 6 : 0; }
function ptsPayout(p) { return p <= 25 ? 20 : p <= 40 ? 17 : p <= 55 ? 13 : p <= 70 ? 8 : p <= 85 ? 4 : 0; }
function ptsSize(mc) { const x = mc / 1e9; return x <= 2 ? 15 : x <= 5 ? 12 : x <= 10 ? 9 : x <= 15 ? 6 : 2; }
function ptsStreak(s) { return s >= 10 && s <= 30 ? 15 : s > 30 ? 12 : s >= 5 ? 10 : 4; }

// ---- growth -----------------------------------------------------------------
export function rateGrowth(gr) {
  const r = [
    fin(gr.revG3) ? b(gr.revG3 >= 15) : null,
    gr.revSeen >= 3 && fin(gr.revYoY) ? b(gr.revUp === gr.revSeen && gr.revYoY >= 10) : null,
    fin(gr.gm) ? b(gr.gm >= 40) : null,
    fin(gr.opm) && fin(gr.opmChg) ? b(gr.opm > 0 && gr.opmChg >= 1) : null,
    gr.fcfYears >= 3 ? b(gr.fcfPos3 === 3) : null,
    fin(gr.roic) ? b(gr.roic >= 15) : null,
    gr.nde == null ? null : b(gr.nde < 2),
    fin(gr.dil3) ? b(gr.dil3 < 3) : null,
    gr.pe == null && !(gr.epsNow > 0) ? 0 : fin(gr.peg) ? b(gr.peg > 0 && gr.peg < 2) : 0,
    fin(gr.r40) ? b(gr.r40 >= 40) : null,
  ];
  const shrinking = fin(gr.revYoY) && gr.revYoY < 0;
  const burning = gr.fcfYears >= 3 && gr.fcfPos3 === 0 && gr.nde != null && gr.nde > 0;
  const diluting = fin(gr.dil3) && gr.dil3 > 10;
  const out = verdictFrom(r, { gate: [0, 4], disq: shrinking || burning || diluting });
  out.r = r;
  out.why = [shrinking && `revenue fell ${Math.abs(gr.revYoY).toFixed(0)}% last year`, burning && 'no free cash flow in three years, and net debt',
             diluting && `share count up ${gr.dil3.toFixed(0)}% a year`].filter(Boolean);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  out.sc = fin(gr.revG3)
    ? Math.round(clamp(gr.revG3, -20, 50) + clamp(fin(gr.fcfm) ? gr.fcfm : -20, -20, 40) + clamp(fin(gr.roic) ? gr.roic : 0, -20, 50) / 2
      + (gr.opmChg >= 1 ? 5 : 0) - Math.max(0, (fin(gr.dil3) ? gr.dil3 : 0) - 3) * 2 - (fin(gr.peg) && gr.peg > 3 ? 5 : 0))
    : null;
  return out;
}

// ---- classification ---------------------------------------------------------
// Companies the rules can't describe: banks and lenders (no free cash flow in the usual
// sense), REITs, funds, shells and royalty trusts.
export function excluded(sic, name = '') {
  // business development companies and most closed-end funds file with no industry code
  if (sic == null) return 'fund or BDC (no industry code)';
  if (sic >= 6000 && sic <= 6199) return 'bank or lender';
  if (sic === 6798) return 'REIT';
  if ([6726, 6770, 6792, 6795, 6799].includes(sic)) return 'fund, shell or trust';
  if (/\b(L\.?P\.?|Partners,? LP)$/i.test(name.trim())) return 'partnership';
  return null;
}

export function kindOf(sic) {
  if (sic >= 6300 && sic <= 6411) return 'insurer';
  if (sic >= 6200 && sic < 6300) return 'financial';
  if ((sic >= 4900 && sic <= 4949) || sic === 4961 || sic === 4991) return 'utility';
  return 'standard';
}

export function sectorOf(sic) {
  if (sic == null) return 'Other';
  const s = sic;
  if (s < 1000) return 'Consumer Staples';
  if (s < 1100) return 'Materials';
  if (s < 1300) return 'Energy';
  if (s < 1400) return 'Energy';
  if (s < 1500) return 'Materials';
  if (s < 1800) return 'Industrials';
  if (s < 2200) return 'Consumer Staples';
  if (s < 2400) return 'Consumer Discretionary';
  if (s < 2500) return 'Materials';
  if (s < 2600) return 'Consumer Discretionary';
  if (s < 2700) return 'Materials';
  if (s < 2800) return 'Communication';
  if (s >= 2830 && s <= 2836) return 'Health Care';
  if (s >= 2840 && s <= 2844) return 'Consumer Staples';
  if (s < 2900) return 'Materials';
  if (s < 3000) return 'Energy';
  if (s < 3100) return 'Materials';
  if (s < 3200) return 'Consumer Discretionary';
  if (s < 3400) return 'Materials';
  if (s < 3500) return 'Industrials';
  if (s >= 3570 && s <= 3579) return 'Technology';
  if (s < 3600) return 'Industrials';
  if (s >= 3630 && s <= 3659) return 'Consumer Discretionary';
  if (s >= 3660 && s <= 3679) return 'Technology';
  if (s < 3700) return 'Industrials';
  if ((s >= 3710 && s <= 3716) || (s >= 3750 && s <= 3799 && s !== 3760 && s !== 3769)) return 'Consumer Discretionary';
  if (s < 3800) return 'Industrials';
  if (s >= 3840 && s <= 3851) return 'Health Care';
  if (s < 3900) return 'Technology';
  if (s < 4000) return 'Consumer Discretionary';
  if (s < 4800) return 'Industrials';
  if (s < 4900) return 'Communication';
  if (s >= 4950 && s <= 4959) return 'Industrials';
  if (s < 5000) return 'Utilities';
  if (s >= 5120 && s <= 5129) return 'Health Care';
  if (s >= 5140 && s <= 5149) return 'Consumer Staples';
  if (s < 5200) return 'Industrials';
  if ((s >= 5400 && s <= 5499) || s === 5912) return 'Consumer Staples';
  if (s < 6000) return 'Consumer Discretionary';
  if (s === 6798 || (s >= 6500 && s <= 6599)) return 'Real Estate';
  if (s < 7000) return 'Financials';
  if (s >= 7370 && s <= 7379) return 'Technology';
  if (s >= 7300 && s <= 7399) return 'Industrials';
  if (s >= 7800 && s <= 7899) return 'Communication';
  if (s < 8000) return 'Consumer Discretionary';
  if (s < 8100) return 'Health Care';
  if (s >= 8200 && s <= 8299) return 'Consumer Discretionary';
  if (s === 8731) return 'Health Care';
  if (s < 9000) return 'Industrials';
  return 'Other';
}
