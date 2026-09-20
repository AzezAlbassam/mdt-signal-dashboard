import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sessionsBetween, isMarketHoliday, isTradingDay } from '../lib/calendar.js'

const real = JSON.parse(readFileSync(new URL('./fixtures/market-long.json', import.meta.url))).sessions.map((s) => s.date)

test('the rule-based calendar reproduces every real session from 2016 to 2026', () => {
  const gen = sessionsBetween(real[0], real[real.length - 1])
  const R = new Set(real)
  const G = new Set(gen)
  const extra = gen.filter((d) => !R.has(d))
  const missing = real.filter((d) => !G.has(d))
  assert.deepEqual(extra, [], `calendar opens the market on days it was closed: ${extra.join(', ')}`)
  assert.deepEqual(missing, [], `calendar closes the market on days it was open: ${missing.join(', ')}`)
  assert.equal(gen.length, real.length)
})

test('Juneteenth is a closure only from 2022, when the exchange adopted it', () => {
  assert.equal(isMarketHoliday('2021-06-18'), false, 'observed Friday in 2021 was a normal session')
  assert.equal(isTradingDay('2021-06-18'), true)
  assert.equal(isMarketHoliday('2022-06-20'), true, 'the 19th fell on a Sunday, observed Monday')
  assert.equal(isMarketHoliday('2023-06-19'), true)
  assert.equal(isMarketHoliday('2026-06-19'), true)
})

test('one-off national days of mourning are closures', () => {
  assert.equal(isMarketHoliday('2018-12-05'), true, 'George H. W. Bush')
  assert.equal(isMarketHoliday('2025-01-09'), true, 'Jimmy Carter')
  assert.equal(isTradingDay('2018-12-04'), true)
  assert.equal(isTradingDay('2018-12-06'), true)
})

test('Good Friday is honoured across the decade', () => {
  for (const d of ['2016-03-25', '2017-04-14', '2018-03-30', '2019-04-19', '2020-04-10',
    '2021-04-02', '2022-04-15', '2023-04-07', '2024-03-29', '2025-04-18', '2026-04-03']) {
    assert.equal(isMarketHoliday(d), true, d)
  }
})
