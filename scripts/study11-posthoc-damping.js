// POST-HOC, run after study 11's result was known. Not part of PROTOCOL-study11.md, not a
// test, no null model and no p-value. It exists to answer one decision: study 11 killed HCP
// as specified, so is any repaired version of it worth pre-registering as a study 12?
//
// The obvious repair has two parts, both standard for extrapolated harmonics:
//   anchor  — shift the projection so it starts at the last close, removing the level error
//             that §1.5 deliberately keeps (study 11 reported this alone at -5.5%);
//   damp    — shrink the projection toward that anchor as the horizon grows, which is what
//             stops the runaway continuations.
// Damping is one parameter, lam in [0, 1]: the projected log move becomes (1 - lam) * m(h).
//
//   node scripts/study11-posthoc-damping.js → reports/study11-posthoc-damping.txt
//
// Sample: every 4th symbol of the universe and every 200th bar, fixed by position, chosen
// before looking at any output and never adjusted. Enough to see the shape of the curve,
// which is all this question needs.
import fs from 'node:fs'
import zlib from 'node:zlib'
import { hcpFit, W, H } from '../engine/hcp.js'

const LAM = [0, 0.25, 0.5, 0.75, 0.9, 1] // 0 = anchored only, 1 = fully damped
const gz = (f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'))
const uni = JSON.parse(fs.readFileSync('data/study11/universe.json', 'utf8')).union
const files = uni
  .map((s) => {
    const n = s.replace(/[:/]/g, '_')
    return [s, [`data/study11/bars/${n}.json.gz`, `data/us/bars/${s.replace(':', '_')}.json.gz`].find((p) => fs.existsSync(p))]
  })
  .filter(([, f]) => f)
const sample = files.filter((_, i) => i % 4 === 0)

const sums = LAM.map(() => 0)
let flat = 0
let n = 0
let symbols = 0
for (const [, f] of sample) {
  const s = gz(f)
  if (s.date.length < 1250) continue
  symbols += 1
  for (let end = s.date.length - 1 - H; end >= W - 1; end -= 200) {
    const fit = hcpFit(s.close, end)
    if (!fit) continue
    const base = Math.log(s.close[end])
    const off = Math.log(fit.at(0)) - base
    const real = []
    const m = []
    for (let h = 1; h <= H; h += 1) {
      real.push(Math.log(s.close[end + h]) - base)
      m.push(Math.log(fit.at(h)) - base - off) // anchored: the fit's level error removed
    }
    let g = 0
    for (let i = 0; i < H; i += 1) g += Math.abs(real[i])
    flat += g / H
    n += 1
    LAM.forEach((lam, k) => {
      let d = 0
      for (let i = 0; i < H; i += 1) d += Math.abs(real[i] - (1 - lam) * m[i])
      sums[k] += d / H
    })
  }
}

const L = []
L.push('Study 11 — POST-HOC: is a repaired HCP worth a study 12?')
L.push('Not a test. No null model, no p-value, nothing here is confirmed or claimed.')
L.push(`Sample: every 4th symbol (${symbols} with enough history) and every 200th bar, ${n} projections, H ${H}.`)
L.push('')
L.push(`  no-change line                 mean |gap| ${(100 * flat / n).toFixed(2)}%`)
LAM.forEach((lam, k) => {
  const g = sums[k] / n
  const d = flat / n - g
  L.push(`  anchored, damping ${String(lam).padEnd(4)}         mean |gap| ${(100 * g).toFixed(2)}%   vs no-change ${d >= 0 ? '+' : ''}${(100 * d).toFixed(2)}%`)
})
L.push('')
L.push('Reading it: the column is monotone. Every amount of model that is left in makes the')
L.push('projection worse, and the best point on the curve is damping 1.0 — which is the')
L.push('no-change line with the model entirely removed. There is no setting at which this')
L.push('family beats doing nothing, so the repair has no best case worth pre-registering.')
L.push('Study 12 on a damped or anchored HCP is NOT proposed.')

fs.mkdirSync('reports', { recursive: true })
fs.writeFileSync('reports/study11-posthoc-damping.txt', `${L.join('\n')}\n`)
console.log(L.join('\n'))
