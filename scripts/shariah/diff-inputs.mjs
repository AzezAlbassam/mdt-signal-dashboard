// Weekly refresh report: what changed between two sec-inputs.json files.
//   node scripts/shariah/diff-inputs.mjs <old.json> <new.json>
import fs from 'node:fs'
import { activityFromSic, shariahVerdict } from '../../engine/shariah.js'

const [a, b] = process.argv.slice(2).map((p) => JSON.parse(fs.readFileSync(p, 'utf8')))
const sic = JSON.parse(fs.readFileSync(new URL('../../data/shariah/sic-activity.json', import.meta.url), 'utf8'))
// The verdict that needs no price (R1 activity, R3 income): a certain fail, or something else
const sure = (r) => (r?.period ? shariahVerdict({ activity: activityFromSic(r.sic, sic, r.cik), debt: null, marketValue: null, bookEquity: null,
  illicit: r.illicit, illicitEstimated: r.illicitEstimated, revenue: r.revenue, shares: r.shares }).state : null)
const out = { stocks: Object.keys(b.stocks).length, newQuarter: [], nowFails: [], noLongerFails: [], newlyStale: [], newlyUnreadable: [], debtMoves: [] }
for (const [t, n] of Object.entries(b.stocks)) {
  const o = a.stocks[t]
  if (n.period && o?.period?.end !== n.period.end) out.newQuarter.push(`${t} ${o?.period?.end ?? '—'} → ${n.period.end} (${n.period.form} ${n.period.filed})`)
  if (sure(n) === 'غير جائز' && sure(o) !== 'غير جائز') out.nowFails.push(t)
  if (sure(o) === 'غير جائز' && sure(n) !== 'غير جائز') out.noLongerFails.push(t)
  if (n.stale && !o?.stale) out.newlyStale.push(`${t} (${n.stale})`)
  if (n.error && !o?.error) out.newlyUnreadable.push(`${t} (${n.error})`)
  // debt that moved more than 10% at either reading (the debt test needs prices, so the reply names the move)
  const rd = (r) => [r?.debt, r?.debtHigh ?? r?.debt], m = (x) => (x == null ? '—' : `${(x / 1e6).toFixed(0)}M`)
  if (rd(o).some((x, i) => x > 0 && rd(n)[i] > 0 && Math.abs(rd(n)[i] / x - 1) > 0.1))
    out.debtMoves.push(`${t} ${[...new Set(rd(o).map(m))].join('..')} → ${[...new Set(rd(n).map(m))].join('..')}`)
}
console.log(JSON.stringify(out, null, 1))
