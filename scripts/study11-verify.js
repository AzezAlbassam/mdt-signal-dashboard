// Does pine/hcp.pine compute the same HCP as engine/hcp.js? The Pine draws polylines, which
// "Export chart data" does not export, so there is nothing to diff as a CSV the way
// scripts/study6-verify.js does. What the Pine does expose is its table, and that is enough:
// the periods, the line's value now and the projected value pin the whole fit.
//
//   node scripts/study11-verify.js <EXCHANGE:SYMBOL> [YYYY-MM-DD] [window]
//
// Put the indicator on a DAILY chart of the same symbol, read its table, and compare. To make
// the comparison meaningful the two must fit the SAME last bar:
//   - the date argument defaults to the last bar stored here, which is what to aim at;
//   - on TradingView use bar replay to stop the chart on that date, or compare on a symbol
//     whose stored last bar is the most recent session;
//   - check the table's "fitted window" says the same number of bars. TradingView loads a
//     limited history on some plans, and a shorter window is a different fit, not a bug.
import fs from 'node:fs'
import zlib from 'node:zlib'
import { hcpFit, W, H } from '../engine/hcp.js'

const [symbol, dateArg, windowArg] = process.argv.slice(2)
if (!symbol) throw new Error('usage: study11-verify.js <EXCHANGE:SYMBOL> [YYYY-MM-DD] [window]')
const w = windowArg ? Number(windowArg) : W

const gz = (f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'))
const n = symbol.replace(/[:/]/g, '_')
const file = [`data/study11/bars/${n}.json.gz`, `data/us/bars/${symbol.replace(':', '_')}.json.gz`].find((p) => fs.existsSync(p))
if (!file) throw new Error(`no stored bars for ${symbol}`)
const s = gz(file)

const end = dateArg ? s.date.indexOf(dateArg) : s.date.length - 1
if (end < 0) throw new Error(`${symbol} has no bar on ${dateArg} (stored ${s.date[0]} .. ${s.date[s.date.length - 1]})`)
const fit = hcpFit(s.close, end, { w })
if (!fit) throw new Error(`no fit at ${s.date[end]} (needs ${w} bars at or before it; this bar is #${end + 1})`)

const close = s.close[end]
const pct = (v) => `${v >= 0 ? '+' : ''}${(100 * v).toFixed(2)}%`
console.log(`${symbol}  fit on ${s.date[end]}  (bars ${file.includes('study11') ? 'data/study11' : 'data/us'}, window ${w})`)
console.log('')
console.log('  the Pine table should read:')
console.log(`    line now        ${fit.at(0).toPrecision(8)}`)
console.log(`    vs price        ${pct(fit.at(0) / close - 1)}`)
console.log(`    projected       ${fit.at(H).toPrecision(8)}`)
console.log(`    implies         ${pct(fit.at(H) / close - 1)} vs price now`)
console.log(`    cycles (bars)   ${fit.periods.map((p) => p.toFixed(0)).join(', ')}`)
console.log(`    fitted window   ${w} bars`)
console.log('')
console.log(`  (close on that bar ${close}; fit rmse ${(100 * fit.rmse).toFixed(2)}% of price)`)
console.log('  projection, every 5th bar:')
for (let h = 5; h <= H; h += 5) console.log(`    +${String(h).padStart(2)}  ${fit.at(h).toPrecision(8)}  ${pct(fit.at(h) / close - 1)}`)
console.log('')
console.log('  The periods must match to the bar and the prices to about 4 significant figures.')
console.log('  A different window, or a chart stopped on a different bar, explains most mismatches.')
console.log('  If the periods differ while the window matches, the two searches disagree: report it.')
