import test from 'node:test'
import assert from 'node:assert/strict'
import { hcpFit, hcpProject, W, K } from '../engine/hcp.js'

// A series HCP should be able to describe exactly: log-linear trend plus two clean cycles.
const TREND = 0.0003
const CYCLES = [[120, 0.05], [45, 0.03]] // period in bars, amplitude in log price
const truth = (x) => {
  let v = 4 + TREND * x
  for (const [P, A] of CYCLES) v += A * Math.sin((2 * Math.PI * x) / P + P / 7)
  return Math.exp(v)
}
const series = (n) => Array.from({ length: n }, (_, i) => truth(i))

test('recovers the periods of a signal built from known cycles', () => {
  const closes = series(W + 100)
  const end = closes.length - 1
  const f = hcpFit(closes, end)
  assert.ok(f, 'expected a fit')
  assert.equal(f.periods.length, K)
  for (const [P] of CYCLES) {
    const near = f.periods.some((q) => Math.abs(q - P) / P < 0.05)
    assert.ok(near, `no fitted period within 5% of ${P}; got ${f.periods.map((q) => q.toFixed(1))}`)
  }
  // Two cycles explain the series, but the §1.3 grid is 200 log-spaced periods, so a true
  // period between two grid points is approximated by the pair straddling it (here 44.8 and
  // 46.1 for 45). That leaves a residual of a few tenths of a percent — the grid's
  // resolution, not a fitting error. Anything much above it would be.
  assert.ok(f.rmse < 5e-3, `rmse ${f.rmse}`)
})

test('projects the continuation of that signal past the last bar', () => {
  const closes = series(W + 100)
  const end = closes.length - 1
  const proj = hcpProject(closes, end, 40)
  assert.ok(proj)
  assert.equal(proj.length, 40)
  for (let h = 1; h <= 40; h += 1) {
    const want = truth(end + h)
    const err = Math.abs(Math.log(proj[h - 1] / want))
    assert.ok(err < 0.01, `bar +${h}: projected ${proj[h - 1].toFixed(3)} vs ${want.toFixed(3)}`)
  }
})

// PROTOCOL-study11.md §6: this must pass before any result is produced.
test('no look-ahead: bars after the fit bar cannot change the fit', () => {
  const base = series(W + 100)
  const end = W + 20 // leaves 79 bars of future to tamper with
  const before = hcpFit(base, end)
  assert.ok(before)

  const mutated = base.slice()
  for (let i = end + 1; i < mutated.length; i += 1) mutated[i] *= 1 + 0.5 * Math.sin(i) // wild
  const after = hcpFit(mutated, end)
  assert.ok(after)
  assert.deepEqual(after.periods, before.periods)
  assert.deepEqual([...after.coef], [...before.coef])
  for (let h = 0; h <= 40; h += 1) assert.equal(after.at(h), before.at(h))
})

test('no look-ahead: truncating at the fit bar gives identical values', () => {
  const base = series(W + 100)
  const end = W + 20
  const full = hcpFit(base, end)
  const cut = hcpFit(base.slice(0, end + 1), end)
  assert.ok(full && cut)
  assert.deepEqual([...cut.coef], [...full.coef])
  for (let h = 0; h <= 40; h += 1) assert.equal(cut.at(h), full.at(h))
})

test('the fitted line is not pinned to the last close', () => {
  // §1.5 keeps the fit's own level, which is what the posted chart shows. Guards against a
  // later "helpful" re-anchoring that would quietly change what the study measured.
  const closes = series(W + 100)
  const end = closes.length - 1
  closes[end] *= 1.08 // one freak close
  const f = hcpFit(closes, end)
  assert.ok(f)
  assert.ok(Math.abs(Math.log(f.at(0) / closes[end])) > 0.02, 'fit should not follow one bar')
})

test('reports no fit rather than guessing when the window is short or dirty', () => {
  assert.equal(hcpFit(series(W - 1), W - 2), null)
  assert.equal(hcpFit(series(W + 10), W + 50), null, 'end past the end of the array')
  assert.equal(hcpFit(series(W + 10), -1), null)
  // The window at end = W+9 is bars 10..W+9, so the bad close has to land inside it.
  const bad = series(W + 10)
  bad[500] = 0
  assert.equal(hcpFit(bad, W + 9), null, 'a non-positive close in the window')
  const nan = series(W + 10)
  nan[500] = NaN
  assert.equal(hcpFit(nan, W + 9), null)
})

test('a bad close before the window does not block the fit', () => {
  // The flip side of the guard above: history older than the window is never read, so a
  // broken early bar must not quietly drop a symbol from the study.
  const closes = series(W + 10)
  closes[3] = 0
  const f = hcpFit(closes, W + 9)
  assert.ok(f, 'bar 3 is outside the window 10..W+9 and must not matter')
})

test('a flat series fits flat and projects flat', () => {
  const closes = Array.from({ length: W + 5 }, () => 100)
  const f = hcpFit(closes, closes.length - 1)
  assert.ok(f)
  for (const h of [1, 10, 40]) assert.ok(Math.abs(f.at(h) - 100) < 1e-6, `at(${h}) = ${f.at(h)}`)
})
