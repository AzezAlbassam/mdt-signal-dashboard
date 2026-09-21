#!/usr/bin/env node
/**
 * "If I started with ten thousand from 2026, what happens?"
 *
 * The study answers in percentages of the money at risk. An account does not
 * work in percentages: it buys whole contracts, and a contract whose worst
 * case exceeds the risk budget cannot be bought in a smaller size. So the
 * first thing this script measures is not the return. It is whether the trade
 * is buyable at all at this account size, which turns out to be the answer.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { simulateAccount, sizePosition, windowResults, CONTRACT_MULTIPLIER } from '../lib/account.js'
import { simulateSingle } from '../lib/premium.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const S = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/market-long.json'), 'utf8')).sessions
const money = (x) => (x < 0 ? '−$' : '$') + Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 0 })
const pct = (x, d = 1) => (x == null ? '   — ' : (x * 100).toFixed(d).padStart(6) + '%')

const TRADE = { side: 'call', widthSigma: 1.25, wingSigma: 0.5, hold: 21, structure: 'spread', costPerLeg: 0.05 }
const CAPITAL = 10000
const RULE = 0.05
const FROM = '2026-01-01'

const out = { generated: '2026-09-21', capital: CAPITAL, riskRule: RULE, from: FROM, trade: TRADE }
out.sampleEnds = S[S.length - 1].date
out.note = 'The data ends 2026-09-14, so "from 2026" is eight and a half months, not a year.'

// ── 1. what one contract costs, month by month, against a $10,000 account
{
  const span = S.filter((s) => s.date >= FROM)
  const raw = simulateSingle(span, { ...TRADE, start: 0 })
  out.affordability = raw.map((t) => {
    const s = sizePosition({ equity: CAPITAL, riskPct: RULE, maxLossPoints: t.maxLoss })
    return {
      entryDate: t.entryDate, exitDate: t.exitDate, entryVix: t.entryVix,
      shortStrike: t.shortStrike, longStrike: t.longStrike,
      creditDollars: t.premiumIn * CONTRACT_MULTIPLIER,
      oneContractRisk: s.contractRisk,
      budget: s.budget,
      contractsAllowed: s.contracts,
      onePositionRiskPct: s.onePositionRiskPct,
      equityNeededForOne: s.equityNeededForOne,
      pnlIfOneContract: t.pnl * CONTRACT_MULTIPLIER,
    }
  })
  out.meanOneContractRisk = out.affordability.reduce((a, r) => a + r.oneContractRisk, 0) / out.affordability.length
  out.meanEquityNeeded = out.affordability.reduce((a, r) => a + r.equityNeededForOne, 0) / out.affordability.length
}

// ── 2. the rule, followed exactly
out.byTheRule = simulateAccount(S, { capital: CAPITAL, riskPct: RULE, from: FROM, ...TRADE })

// ── 3. the rule broken: one contract regardless, which is what most people do
out.forced = simulateAccount(S, { capital: CAPITAL, riskPct: RULE, from: FROM, forceOneContract: true, ...TRADE })

// ── 4. the account size at which the rule actually permits a position
out.sizes = []
for (const capital of [10000, 25000, 50000, 100000, 250000, 500000]) {
  for (const riskPct of [0.05, 0.10, 0.20]) {
    const r = simulateAccount(S, { capital, riskPct, from: FROM, ...TRADE })
    out.sizes.push({
      capital, riskPct, n: r.n, skipped: r.skipped,
      contracts: r.trades.length ? r.trades[0].contracts : 0,
      finalEquity: r.finalEquity, returnPct: r.returnPct, maxDrawdownPct: r.maxDrawdownPct,
    })
  }
}

// ── 5. one window is an anecdote: every 8-month window of the decade,
//      $10,000 forcing one contract, which is the only way it trades at all
out.windows = windowResults(S, {
  months: 8, capital: CAPITAL, riskPct: RULE, forceOneContract: true, ...TRADE,
})
// And the same for an account the rule actually fits.
out.windowsProper = windowResults(S, {
  months: 8, capital: 250000, riskPct: RULE, ...TRADE,
})

// ── 6. the narrower wing, the only lever that shrinks the contract
out.narrower = []
for (const wingSigma of [0.5, 0.375, 0.25, 0.125]) {
  const span = S.filter((s) => s.date >= FROM)
  const raw = simulateSingle(span, { ...TRADE, wingSigma, start: 0 })
  const meanRisk = raw.reduce((a, t) => a + t.maxLoss, 0) / raw.length * CONTRACT_MULTIPLIER
  const r = simulateAccount(S, { capital: CAPITAL, riskPct: RULE, from: FROM, ...TRADE, wingSigma })
  // What the decade says about this wing, so a smaller contract is not mistaken
  // for a free lunch.
  const decade = []
  for (let start = 0; start < 21; start++) {
    const ts = simulateSingle(S, { ...TRADE, wingSigma, start })
    if (ts.length < 5) continue
    const risk = ts.reduce((a, t) => a + t.maxLoss, 0) / ts.length
    const pnl = ts.reduce((a, t) => a + t.pnl, 0) / ts.length
    decade.push(pnl / risk)
  }
  out.narrower.push({
    wingSigma, meanContractRisk: meanRisk,
    contractsAt10k: Math.floor(CAPITAL * RULE / meanRisk),
    tradesTaken: r.n,
    decadeReturnOnRisk: decade.reduce((a, b) => a + b, 0) / decade.length,
    decadeWorstPhase: Math.min(...decade),
  })
}

writeFileSync(join(ROOT, 'data/em/ten-thousand.json'), JSON.stringify(out, null, 2) + '\n')

// ── print
console.log(`$${CAPITAL.toLocaleString()} from ${FROM}, data ends ${out.sampleEnds}\n`)

console.log('1. CAN YOU EVEN BUY ONE? Each month a trade came up in 2026')
console.log('entry        VIX    sell     buy    credit   1 contract risks   5% budget   contracts')
for (const a of out.affordability) {
  console.log(`${a.entryDate}  ${a.entryVix.toFixed(1).padStart(4)}  ${a.shortStrike.toFixed(1).padStart(6)}  ${a.longStrike.toFixed(1).padStart(6)}  ${money(a.creditDollars).padStart(7)}   ${money(a.oneContractRisk).padStart(8)} (${pct(a.onePositionRiskPct, 0).trim()})      ${money(a.budget).padStart(5)}        ${a.contractsAllowed}`)
}
console.log(`\nAverage: one contract risks ${money(out.meanOneContractRisk)}. The 5% rule allows ${money(CAPITAL * RULE)}.`)
console.log(`To buy ONE contract at 5% risk you need about ${money(out.meanEquityNeeded)}.`)

console.log('\n2. FOLLOWING THE RULE EXACTLY')
const r = out.byTheRule
console.log(`Trades taken: ${r.n}.  Opportunities skipped as unaffordable: ${r.skipped}.`)
console.log(`Final equity: ${money(r.finalEquity)}.  Return: ${pct(r.returnPct)}.`)

console.log('\n3. BREAKING THE RULE: one contract anyway, every month')
const f = out.forced
console.log(`Trades: ${f.n}, of which ${f.wins} won.  Every one broke the sizing rule (${f.overRiskTrades} of ${f.n}).`)
console.log(`Largest single position: ${pct(f.maxSingleRiskPct)} of the account, against a 5% rule.`)
console.log(`Final equity: ${money(f.finalEquity)}.  Return: ${pct(f.returnPct)}.  Worst drawdown: ${pct(f.maxDrawdownPct)}.`)
console.log('\nentry        exit         VIX  contracts   risk      P&L     equity after')
for (const t of f.trades) {
  console.log(`${t.entryDate}  ${t.exitDate}  ${t.entryVix.toFixed(1).padStart(4)}      ${t.contracts}     ${money(t.riskDollars).padStart(7)}  ${money(t.pnlDollars).padStart(8)}   ${money(t.equityAfter).padStart(8)}`)
}

console.log('\n4. THE ACCOUNT SIZE THE RULE ACTUALLY NEEDS')
console.log('capital     risk rule   trades   skipped   contracts   final equity    return   drawdown')
for (const s of out.sizes) {
  console.log(`${money(s.capital).padStart(9)}   ${pct(s.riskPct, 0)}      ${String(s.n).padStart(3)}      ${String(s.skipped).padStart(4)}       ${String(s.contracts).padStart(4)}     ${money(s.finalEquity).padStart(11)}  ${pct(s.returnPct)}   ${pct(s.maxDrawdownPct)}`)
}

console.log('\n5. ONE WINDOW IS AN ANECDOTE: every 8-month window of the decade')
for (const [label, w] of [['$10,000, one contract forced', out.windows], ['$250,000, rule followed', out.windowsProper]]) {
  console.log(`\n${label} — ${w.count} windows`)
  console.log(`  worst ${pct(w.worst.returnPct)}   5th ${pct(w.p05.returnPct)}   25th ${pct(w.p25.returnPct)}   median ${pct(w.median.returnPct)}   75th ${pct(w.p75.returnPct)}   95th ${pct(w.p95.returnPct)}   best ${pct(w.best.returnPct)}`)
  console.log(`  profitable in ${pct(w.shareProfitable, 0)} of windows.  Worst window: ${w.worst.from} → ${w.worst.to}.`)
}

console.log('\n6. THE ONLY LEVER THAT SHRINKS THE CONTRACT — and what it costs')
console.log('wing     1 contract risks   contracts at $10k   trades taken   decade return on risk   worst phase')
for (const n of out.narrower) {
  console.log(`${String(n.wingSigma).padStart(5)}σ      ${money(n.meanContractRisk).padStart(8)}              ${String(n.contractsAt10k).padStart(2)}             ${String(n.tradesTaken).padStart(2)}            ${pct(n.decadeReturnOnRisk)}          ${pct(n.decadeWorstPhase)}`)
}

console.log('\ndata/em/ten-thousand.json written')
