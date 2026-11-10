// The forward log: validating logged calls and resolving them against price data.
//
// The rules these tests encode are PRE-REGISTERED in PROTOCOL.md, written before any
// call was logged. That ordering is the whole value of the exercise. Deciding what
// counts as a hit after seeing the outcome is how every guru record in existence gets
// to be 90% accurate.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { validateCall, indexOnOrAfter, resolveCall } from '../engine/calllog.js'

const bars = [
  { date: '2026-09-01', open: 7000, high: 7020, low: 6990, close: 7010 },
  { date: '2026-09-02', open: 7010, high: 7060, low: 7005, close: 7050 },
  { date: '2026-09-03', open: 7050, high: 7140, low: 7045, close: 7090 }, // tags 7130
  { date: '2026-09-04', open: 7090, high: 7100, low: 7000, close: 7020 },
  { date: '2026-09-07', open: 7020, high: 7030, low: 6960, close: 6980 },
  { date: '2026-09-08', open: 6980, high: 7010, low: 6970, close: 7000 },
  { date: '2026-09-09', open: 7000, high: 7080, low: 6995, close: 7070 },
]

const baseCall = {
  tweetId: '2047111703502987474',
  postedAt: '2026-09-01T18:00:00Z',
  rawText: '…',
  klass: 'forward_call',
  klassReason: 'names instrument, two levels, and a future window',
  instrument: 'SPX',
  levels: [7130],
  horizonDays: 5,
}

describe('validateCall', () => {
  test('accepts a complete forward call', () => {
    assert.doesNotThrow(() => validateCall(baseCall))
  })

  test('a classification without a stated reason is rejected', () => {
    // The reason is what makes the judgement auditable afterwards.
    const bad = { ...baseCall, klassReason: '' }
    assert.throws(() => validateCall(bad), /klassReason/)
  })

  test('the raw text must be kept verbatim so every call can be re-judged', () => {
    const bad = { ...baseCall }
    delete bad.rawText
    assert.throws(() => validateCall(bad), /rawText/)
  })

  test('only the four pre-registered classes are allowed', () => {
    for (const k of ['forward_call', 'retrospective', 'promo', 'ambiguous']) {
      assert.doesNotThrow(() => validateCall({ ...baseCall, klass: k, levels: [1] }))
    }
    assert.throws(() => validateCall({ ...baseCall, klass: 'good_call' }), /klass/)
  })

  test('a forward call must carry at least one level or a direction', () => {
    const bad = { ...baseCall, levels: [] }
    assert.throws(() => validateCall(bad), /level|direction/i)
    assert.doesNotThrow(() => validateCall({ ...bad, direction: 'long' }))
  })

  test('a non-forward call needs no levels — it is not being scored', () => {
    assert.doesNotThrow(() =>
      validateCall({ ...baseCall, klass: 'retrospective', levels: [] }),
    )
  })

  test('postedAt must parse, so calls can be ordered against bars', () => {
    assert.throws(() => validateCall({ ...baseCall, postedAt: 'last tuesday' }), /postedAt/)
  })
})

describe('indexOnOrAfter', () => {
  test('finds the first session at or after a date', () => {
    assert.equal(indexOnOrAfter(bars, '2026-09-03'), 2)
  })

  test('skips weekends to the next session', () => {
    // 2026-09-05 is a Saturday; the next session is the 7th.
    assert.equal(indexOnOrAfter(bars, '2026-09-05'), 4)
  })

  test('returns null past the end of the data', () => {
    assert.equal(indexOnOrAfter(bars, '2026-12-01'), null)
  })
})

describe('resolveCall — was the level reached, and did it turn there?', () => {
  // PRE-REGISTERED, see PROTOCOL.md:
  //   horizon      5 sessions from the post
  //   touch        price trades to within 0.1% of the level
  //   reversal     penetration <= 0.5% and excursion >= 1.0% within 5 sessions of the touch
  const opts = { tolerancePct: 0.1, maxPenetrationPct: 0.5, minExcursionPct: 1.0 }

  test('a level tagged inside the horizon counts as touched', () => {
    const r = resolveCall(bars, baseCall, opts)
    assert.equal(r.levels[0].touched, true)
    assert.equal(r.levels[0].touchDate, '2026-09-03')
  })

  test('touched and then turned is a hit', () => {
    // High 7140 vs level 7130 → penetration 0.14%. Falls to 6960 → excursion 2.4%.
    const r = resolveCall(bars, baseCall, opts)
    assert.equal(r.levels[0].reversed, true)
    assert.equal(r.outcome, 'hit')
  })

  test('a level price never reaches is a miss, not an excuse', () => {
    const r = resolveCall(bars, { ...baseCall, levels: [7400] }, opts)
    assert.equal(r.levels[0].touched, false)
    assert.equal(r.outcome, 'miss')
  })

  test('touched but sliced straight through is a miss', () => {
    // Level 7020: tagged on day 1, but price keeps running to 7140 — no turn.
    const early = { ...baseCall, levels: [7020], horizonDays: 2 }
    const r = resolveCall(bars, early, { ...opts, maxPenetrationPct: 0.5 })
    assert.equal(r.levels[0].touched, true)
    assert.equal(r.levels[0].reversed, false)
    assert.equal(r.outcome, 'miss')
  })

  test('a call still inside its horizon with nothing hit is unresolved, not a miss', () => {
    const r = resolveCall(bars.slice(0, 2), baseCall, opts)
    assert.equal(r.outcome, 'unresolved')
  })

  test('two levels, one hit, is scored partial — never rounded up to a hit', () => {
    const two = { ...baseCall, levels: [7130, 7400] }
    const r = resolveCall(bars, two, opts)
    assert.equal(r.levels.filter((l) => l.reversed).length, 1)
    assert.equal(r.outcome, 'partial')
  })

  test('only forward calls are scored at all', () => {
    const r = resolveCall(bars, { ...baseCall, klass: 'retrospective' }, opts)
    assert.equal(r.outcome, 'not_scored')
  })

  test('the horizon is counted in sessions, not calendar days', () => {
    const short = { ...baseCall, horizonDays: 1 }
    const r = resolveCall(bars, short, opts)
    // Only 2026-09-02 is inside a 1-session horizon; 7130 is not tagged until the 3rd.
    assert.equal(r.levels[0].touched, false)
  })
})
