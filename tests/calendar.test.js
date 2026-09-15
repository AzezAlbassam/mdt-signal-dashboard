import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  isTradingDay, isMarketHoliday, nextTradingDay, prevTradingDay,
  tradingDaysInMonth, lastTradingDayOfMonth, sessionsBetween,
  weekAnchor, weekExpiry, easterSunday, etParts, sessionDateFor,
} from '../lib/calendar.js'

const market = JSON.parse(readFileSync(new URL('./fixtures/market.json', import.meta.url)))
const REAL_SESSIONS = market.sessions.map(s => s.date)

test('easter and Good Friday are computed, not tabulated', () => {
  assert.equal(easterSunday(2026), '2026-04-05')
  assert.equal(easterSunday(2027), '2027-03-28')
  assert.equal(easterSunday(2024), '2024-03-31')
  assert.equal(isMarketHoliday('2026-04-03'), true, 'Good Friday 2026')
  assert.equal(isMarketHoliday('2027-03-26'), true, 'Good Friday 2027')
})

test('the 2026 NYSE holiday set is exactly right', () => {
  const expected = [
    '2026-01-01', // New Year's Day, Thursday
    '2026-01-19', // MLK, third Monday
    '2026-02-16', // Washington's Birthday, third Monday
    '2026-04-03', // Good Friday
    '2026-05-25', // Memorial Day, last Monday
    '2026-06-19', // Juneteenth, Friday
    '2026-07-03', // Independence Day observed, the 4th is a Saturday
    '2026-09-07', // Labor Day, first Monday
    '2026-11-26', // Thanksgiving, fourth Thursday
    '2026-12-25', // Christmas, Friday
  ]
  for (const d of expected) assert.equal(isMarketHoliday(d), true, `${d} should be a holiday`)
  // every other weekday in 2026 must be a session
  const found = []
  for (let t = Date.UTC(2026, 0, 1); t <= Date.UTC(2026, 11, 31); t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10)
    if (isMarketHoliday(d)) found.push(d)
  }
  assert.deepEqual(found, expected)
})

test('weekend observance shifts Saturday holidays back and Sunday holidays forward', () => {
  assert.equal(isMarketHoliday('2027-12-24'), true, 'Christmas 2027 falls Saturday, observed Friday')
  assert.equal(isMarketHoliday('2027-12-25'), false, 'the Saturday itself is not a session anyway')
  assert.equal(isMarketHoliday('2028-07-04'), true, 'Independence Day 2028 is a Tuesday, observed in place')
  assert.equal(isMarketHoliday('2021-07-05'), true, 'the 4th fell Sunday in 2021, observed Monday')
})

test('the generated session list reproduces 97 real sessions exactly', () => {
  const from = REAL_SESSIONS[0], to = REAL_SESSIONS.at(-1)
  const generated = sessionsBetween(from, to)
  assert.equal(generated.length, REAL_SESSIONS.length)
  assert.deepEqual(generated, REAL_SESSIONS)
})

test('weekends are never sessions', () => {
  assert.equal(isTradingDay('2026-09-12'), false)
  assert.equal(isTradingDay('2026-09-13'), false)
  assert.equal(isTradingDay('2026-09-11'), true)
  assert.equal(isTradingDay('2026-09-14'), true)
})

test('next and previous session hop weekends and holidays together', () => {
  assert.equal(nextTradingDay('2026-09-04'), '2026-09-08', 'Friday to Tuesday over Labor Day')
  assert.equal(prevTradingDay('2026-09-08'), '2026-09-04')
  assert.equal(nextTradingDay('2026-06-18'), '2026-06-22', 'Thursday to Monday over Juneteenth')
  assert.equal(prevTradingDay('2026-06-22'), '2026-06-18')
  assert.equal(nextTradingDay('2026-07-02'), '2026-07-06', 'over the observed Independence Day')
  assert.equal(nextTradingDay('2026-09-11'), '2026-09-14', 'plain weekend')
  assert.equal(prevTradingDay('2026-09-14'), '2026-09-11')
})

test('trading days per month match the real session counts', () => {
  assert.equal(tradingDaysInMonth(2026, 5), 20, 'May 2026 loses Memorial Day')
  assert.equal(tradingDaysInMonth(2026, 6), 21, 'June 2026 loses Juneteenth')
  assert.equal(tradingDaysInMonth(2026, 7), 22, 'July 2026 loses the observed 3rd')
  assert.equal(tradingDaysInMonth(2026, 8), 21, 'August 2026 is clean')
  assert.equal(tradingDaysInMonth(2026, 9), 21, 'September 2026 loses Labor Day')
  // cross-check against the real data for the months it fully covers
  for (const m of [5, 6, 7, 8]) {
    const real = REAL_SESSIONS.filter(d => d.startsWith(`2026-${String(m).padStart(2, '0')}`)).length
    assert.equal(tradingDaysInMonth(2026, m), real, `month ${m}`)
  }
})

test('last trading day of the month handles weekends and month ends', () => {
  assert.equal(lastTradingDayOfMonth(2026, 4), '2026-04-30')
  assert.equal(lastTradingDayOfMonth(2026, 5), '2026-05-29', 'the 30th and 31st are a weekend')
  assert.equal(lastTradingDayOfMonth(2026, 7), '2026-07-31')
  assert.equal(lastTradingDayOfMonth(2026, 8), '2026-08-31')
  assert.equal(lastTradingDayOfMonth(2026, 1), '2026-01-30')
})

test('the weekly anchor is the last session of the preceding week', () => {
  // On a Friday, after the close, that Friday is itself the anchor.
  assert.equal(weekAnchor('2026-09-11'), '2026-09-11')
  assert.equal(weekAnchor('2026-06-12'), '2026-06-12')
  // Mid-week the anchor stays on the previous Friday.
  assert.equal(weekAnchor('2026-09-14'), '2026-09-11')
  assert.equal(weekAnchor('2026-07-15'), '2026-07-10')
  assert.equal(weekAnchor('2026-05-18'), '2026-05-15')
  assert.equal(weekAnchor('2026-08-24'), '2026-08-21')
  assert.equal(weekAnchor('2026-09-08'), '2026-09-04', 'the Tuesday after Labor Day')
  // When Friday is a holiday the Thursday closes the week.
  assert.equal(weekAnchor('2026-06-22'), '2026-06-18', 'Juneteenth week ends Thursday')
  assert.equal(weekAnchor('2026-07-06'), '2026-07-02', 'Independence week ends Thursday')
})

test('the weekly expiry is the last session of the week the anchor opens', () => {
  assert.equal(weekExpiry('2026-09-11'), '2026-09-18', 'a normal week')
  assert.equal(weekExpiry('2026-09-04'), '2026-09-11', 'the Labor Day week still ends Friday')
  assert.equal(weekExpiry('2026-06-12'), '2026-06-18', 'Juneteenth shortens the week to Thursday')
  assert.equal(weekExpiry('2026-07-02'), '2026-07-10', 'anchored on a Thursday that closed its own week')
})

test('sessions between counts the anchor out and the target in', () => {
  assert.equal(sessionsBetween('2026-09-11', '2026-09-18').length - 1, 5, 'a full week is five sessions')
  assert.equal(sessionsBetween('2026-09-04', '2026-09-11').length - 1, 4, 'Labor Day week is four')
  assert.equal(sessionsBetween('2026-09-10', '2026-09-11').length - 1, 1, 'one session ahead')
  assert.equal(sessionsBetween('2026-09-11', '2026-09-14').length - 1, 1, 'Friday to Monday is one session')
})

test('the eastern-time session date respects both DST transitions', () => {
  // Spring forward 2026-03-08, fall back 2026-11-01.
  assert.deepEqual(etParts('2026-03-09T20:59:00Z'), { date: '2026-03-09', hour: 16, minute: 59 })
  assert.deepEqual(etParts('2026-01-09T20:59:00Z'), { date: '2026-01-09', hour: 15, minute: 59 })
  assert.deepEqual(etParts('2026-11-02T21:00:00Z'), { date: '2026-11-02', hour: 16, minute: 0 })
  assert.deepEqual(etParts('2026-07-01T03:30:00Z'), { date: '2026-06-30', hour: 23, minute: 30 })
})

test('the anchor session is the last completed session at that instant', () => {
  // Before Friday's close the anchor is still Thursday.
  assert.equal(sessionDateFor('2026-09-11T19:30:00Z'), '2026-09-10', '15:30 ET Friday, still open')
  // After the close it becomes Friday and stays there all weekend.
  assert.equal(sessionDateFor('2026-09-11T20:30:00Z'), '2026-09-11', '16:30 ET Friday')
  assert.equal(sessionDateFor('2026-09-13T15:00:00Z'), '2026-09-11', 'Sunday')
  assert.equal(sessionDateFor('2026-09-14T12:00:00Z'), '2026-09-11', 'Monday pre-market')
  assert.equal(sessionDateFor('2026-09-14T20:30:00Z'), '2026-09-14', 'after Monday close')
  // A holiday never becomes the anchor.
  assert.equal(sessionDateFor('2026-09-07T20:30:00Z'), '2026-09-04', 'Labor Day evening')
})
