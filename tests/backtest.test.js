import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

// The backtest is a script, so the test runs it and pins what it must produce.
// If the fixture, the calendar or the scoring changes, these counts move and
// the numbers shown to a trader are known to have changed with them.
execFileSync('node', ['scripts/backtest.mjs'], { cwd: new URL('..', import.meta.url), stdio: 'ignore' })
const out = JSON.parse(readFileSync(new URL('../data/em/backtest-spy.json', import.meta.url)))

test('the backtest covers every scorable session and complete week in the fixture', () => {
  assert.equal(out.span.sessions, 97)
  assert.equal(out.calibration.daily.n, 96, 'every session but the first has a prior close')
  assert.equal(out.calibration.weekly.n, 19)
})

test('every daily band is anchored on the session before, never the same one', () => {
  for (const r of out.dailyRows) assert.ok(r.anchor < r.date, `${r.date} anchored on ${r.anchor}`)
  for (const w of out.weeklyRows) assert.ok(w.anchor < w.expiry)
})

test('the weekly band in force on a Friday is last week\'s, not the one that Friday sets', () => {
  // A Friday close-break must be judged against the band that governed that week.
  const fri = out.breakRows.find((r) => r.date === '2026-05-08')
  assert.ok(fri, 'the 2026-05-08 break is in the sample')
  assert.equal(fri.weeklyAnchor, '2026-05-01')
  assert.equal(fri.alreadyThere, true, 'it touched the weekly band that same day')
  assert.equal(fri.reached, false, 'but a Friday has no later session, so it cannot count as a run')
})

test('the setup counts are the ones the ratings were written from', () => {
  const s = out.setups
  assert.deepEqual([s.fadeLower.n, s.fadeLower.k], [21, 11])
  assert.deepEqual([s.fadeUpper.n, s.fadeUpper.k], [27, 14])
  assert.deepEqual([s.afterLowerTagNextUp.n, s.afterLowerTagNextUp.k], [20, 14])
  assert.deepEqual([s.afterUpperTagNextDown.n, s.afterUpperTagNextDown.k], [27, 16])
  // Only sessions after the break count: the close-break signal does not exist
  // until the close, so the break day's own range would be look-ahead.
  assert.deepEqual([s.breakToWeekly.n, s.breakToWeekly.k], [22, 8])
  assert.deepEqual([s.breakToWeeklyWithDaysLeft.n, s.breakToWeeklyWithDaysLeft.k], [18, 8])
  assert.deepEqual([s.breakTouchedWeeklySameDay.n, s.breakTouchedWeeklySameDay.k], [22, 8],
    'reproduced independently twice under the inclusive rule as 11 of 22, of which 3 were same-day-only')
  assert.equal(s.weeklyFadeLower.reportable, false, 'five weeks is not a rate')
})

test('a fade on the close sits at the reflection-principle base rate, not above it', () => {
  const s = out.setups.fadeAny
  assert.ok(s.interval.low < 0.5 && s.interval.high > 0.5,
    `the interval [${s.interval.low.toFixed(2)}, ${s.interval.high.toFixed(2)}] must straddle 0.5`)
})

test('the base rates the setups are judged against are recorded', () => {
  assert.ok(out.setups.baseNextUp.n >= 90)
  assert.equal(out.calibration.theory.fadeGivenTouch, 0.5)
  assert.ok(out.calibration.theory.pathContainment > 0.35 && out.calibration.theory.pathContainment < 0.5)
})
