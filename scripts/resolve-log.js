// Resolve every open forward call in the log against price data, then print the scorecard.
//
//   node scripts/resolve-log.js
//
// Thresholds come from PROTOCOL.md and are not tunable here. See section 3.

import fs from 'node:fs'

import { validateCall, resolveCall } from '../engine/calllog.js'
import { wilsonInterval } from '../engine/stats.js'
import { sampleSizeFor } from '../engine/power.js'

const LOG = process.env.FORWARD_LOG ?? 'forward-log/calls.json'
const DATA = process.env.SPX_CSV ?? '/tmp/zen/data/spx_all.csv'

const THRESHOLDS = { tolerancePct: 0.1, maxPenetrationPct: 0.5, minExcursionPct: 1.0 }

function loadBars(file) {
  if (!fs.existsSync(file)) return []
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
  const idx = Object.fromEntries(lines[0].split(',').map((h, i) => [h.trim(), i]))
  return lines.slice(1).map((l) => {
    const f = l.split(',')
    return {
      date: f[idx.date], open: +f[idx.open], high: +f[idx.high],
      low: +f[idx.low], close: +f[idx.close],
    }
  })
}

const log = JSON.parse(fs.readFileSync(LOG, 'utf8'))
const bars = loadBars(DATA)

log.calls.forEach(validateCall)

const counts = { forward_call: 0, retrospective: 0, promo: 0, ambiguous: 0 }
for (const c of log.calls) counts[c.klass] += 1

let changed = 0
for (const call of log.calls) {
  if (call.klass !== 'forward_call') continue
  if (call.resolution && call.resolution.outcome !== 'unresolved') continue
  if (call.instrument !== 'SPX') {
    call.resolution = { outcome: 'not_resolvable', note: 'no price data on this plan' }
    continue
  }
  const before = call.resolution?.outcome
  call.resolution = { ...resolveCall(bars, call, THRESHOLDS), resolvedAt: log.asOf ?? null }
  if (call.resolution.outcome !== before) changed += 1
}

fs.writeFileSync(LOG, JSON.stringify(log, null, 1) + '\n')

const scored = log.calls.filter((c) => c.klass === 'forward_call' && c.resolution)
const hits = scored.filter((c) => c.resolution.outcome === 'hit').length
const partial = scored.filter((c) => c.resolution.outcome === 'partial').length
const misses = scored.filter((c) => c.resolution.outcome === 'miss').length
const open = scored.filter((c) => c.resolution.outcome === 'unresolved').length
const resolved = hits + partial + misses

console.log(`\nForward log — ${log.account}, protocol fixed ${log.protocolFixedAt}`)
console.log(`Posts logged: ${log.calls.length}   (${changed} newly resolved this run)\n`)
console.log('by class')
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(15)} ${v}`)

if (resolved === 0) {
  console.log(`\n${open} forward call(s) open, none resolved yet. Nothing to score.`)
  console.log(`Per PROTOCOL.md §5, ${sampleSizeFor(0.40, 0.90)} resolved calls test the 90% claim.\n`)
  process.exit(0)
}

// A partial is a failure of the call as stated — see PROTOCOL.md §3.
const rate = hits / resolved
const ci = wilsonInterval(hits, resolved)
const pct = (x) => `${(x * 100).toFixed(1)}%`

console.log(`\nresolved ${resolved}   hit ${hits}   partial ${partial}   miss ${misses}   open ${open}`)
console.log(`hit rate ${pct(rate)}   95% CI [${pct(ci[0])}, ${pct(ci[1])}]`)

const need = sampleSizeFor(0.40, 0.90)
if (resolved < need) {
  console.log(`\nStill short of the ${need} resolved calls that would test the 90% claim.`)
} else if (ci[0] > 0.90) {
  console.log('\nThe 90% claim SURVIVES: the interval sits entirely above it.')
} else if (ci[1] < 0.90) {
  console.log(`\nThe 90% claim FAILS: even the top of the interval (${pct(ci[1])}) is below 90%.`)
} else {
  console.log('\nInconclusive: the interval still straddles 90%.')
}
console.log()
