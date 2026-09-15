import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseChain } from '../lib/cboe-chain.js'
import { buildSnapshot, SCHEMA_VERSION, configHash, stableJson } from '../lib/snapshot.js'

const market = JSON.parse(readFileSync(new URL('./fixtures/market.json', import.meta.url)))
const rawChain = JSON.parse(readFileSync(new URL('./fixtures/chain-sample.json', import.meta.url)))
const chain = parseChain(rawChain)
const closes = Object.fromEntries(
  market.sessions.filter((s) => s.date <= '2026-09-11').map((s) => [s.date, s.close]))
const bars = Object.fromEntries(market.sessions.map((s) => [s.date, s]))
const make = (over = {}) => buildSnapshot({
  closes, chain, capturedAt: '2026-09-11T22:30:00Z', bars, ...over,
})

test('a snapshot carries its schema, its capture time and the config that made it', () => {
  const s = make()
  assert.equal(s.schema, SCHEMA_VERSION)
  assert.equal(s.capturedAt, '2026-09-11T22:30:00Z')
  assert.equal(s.capturedEt.date, '2026-09-11')
  assert.equal(s.asOf, '2026-09-11', 'the last close held')
  assert.equal(s.status, 'ok')
  assert.equal(s.symbol, 'SPY', 'the default underlying')
  assert.equal(s.configHash, configHash(s.config))
  for (const k of ['symbol', 'roots', 'dayBasis', 'straddleMultiplier', 'weeklyDayCount', 'ivolTenorDays', 'plainMode']) {
    assert.ok(k in s.config, `config records ${k}`)
  }
})

test('a snapshot records the chain it came from, including what it rejected', () => {
  const s = make()
  assert.equal(s.source.chainTimestamp, '2026-09-11T20:20:00Z')
  assert.equal(s.source.spot, 764.20)
  assert.equal(s.source.rejected.adjustedRoot, 1)
  assert.ok(s.source.expiries.includes('2026-09-14'))
})

test('the bands land where the engine puts them', () => {
  const s = make()
  assert.equal(s.bands.plainDaily.upper, 769.18)
  assert.equal(s.bands.plainDaily.lower, 759.40)
  assert.equal(s.bands.plainDaily.anchorDate, '2026-09-11')
  assert.ok(s.bands.ivolDaily.halfWidth > 0)
  assert.equal(s.bands.plainWeekly.expiry, '2026-09-18')
})

test('a spot far from the anchor close aborts instead of publishing', () => {
  const stale = parseChain({ ...rawChain, data: { ...rawChain.data, current_price: 700 } })
  const s = make({ chain: stale })
  assert.equal(s.status, 'stale')
  assert.match(s.reason, /spot|close|drift/i)
  assert.equal(s.bands, null, 'nothing is published from a stale chain')
})

test('a failed run is recorded as a row, never as silence', () => {
  const s = buildSnapshot({
    closes, chain: null, capturedAt: '2026-09-11T22:30:00Z', bars,
    failure: 'chain fetch timed out after 60s',
  })
  assert.equal(s.status, 'missing')
  assert.equal(s.reason, 'chain fetch timed out after 60s')
  assert.equal(s.bands, null)
  assert.equal(s.asOf, '2026-09-11', 'a missing run still records where it stood')
})

test('a frozen plain half width is carried forward, not recomputed', () => {
  const previous = {
    asOf: '2026-09-11',
    bands: { plainDaily: { anchorDate: '2026-09-11', halfWidth: 4.55, upper: 768.84, lower: 759.74, frozen: true } },
  }
  const s = make({ previous })
  assert.equal(s.bands.plainDaily.halfWidth, 4.55, 'the value set at the roll survives the refresh')
  assert.equal(s.bands.plainDaily.upper, 768.84)
  assert.equal(s.bands.plainDaily.frozen, true)
  // The iVol family keeps updating, which is the whole difference between them.
  assert.ok(s.bands.ivolDaily.frozen === false)
})

test('a new anchor discards the previous freeze', () => {
  const previous = {
    asOf: '2026-09-10',
    bands: { plainDaily: { anchorDate: '2026-09-10', halfWidth: 6.86, upper: 764.69, lower: 750.97, frozen: true } },
  }
  const s = make({ previous })
  assert.equal(s.bands.plainDaily.anchorDate, '2026-09-11')
  assert.equal(s.bands.plainDaily.halfWidth, 4.89, 'priced fresh because the close moved on')
})

test('the previous session is scored and never the session that made the band', () => {
  const previous = {
    asOf: '2026-09-10',
    bands: {
      plainDaily: { anchorDate: '2026-09-10', center: 757.83, halfWidth: 6.86, upper: 764.69, lower: 750.97 },
      ivolDaily: { anchorDate: '2026-09-10', center: 757.83, halfWidth: 6.78, upper: 764.61, lower: 751.05 },
    },
  }
  const s = make({ previous })
  assert.equal(s.scored.session, '2026-09-11')
  assert.equal(s.scored.plainDaily.upper, 'tagged',
    'the 766.38 high cleared 764.69 and the close of 764.29 came back inside')
  assert.equal(s.scored.plainDaily.lower, 'untouched')
  assert.equal(s.scored.plainDaily.contained, false)
  assert.ok(Math.abs(s.scored.plainDaily.z - (764.29 - 757.83) / 6.86) < 1e-9)
})

test('nothing is scored when there is no earlier band to score', () => {
  const s = make({ previous: null })
  assert.equal(s.scored, null)
})

test('the same inputs serialise to the same bytes', () => {
  const a = stableJson(make())
  const b = stableJson(make())
  assert.equal(a, b)
  assert.ok(a.endsWith('\n'), 'a trailing newline so the file is a clean diff')
  const keys = Object.keys(JSON.parse(a))
  assert.deepEqual(keys, [...keys].sort(), 'keys are sorted so a commit only changes real values')
})

test('the underlying is recorded on the snapshot and inside its config hash', () => {
  const a = make()
  const b = make({ symbol: 'SPX' })
  assert.equal(a.symbol, 'SPY')
  assert.equal(b.symbol, 'SPX')
  assert.equal(b.config.symbol, 'SPX')
  assert.notEqual(a.configHash, b.configHash,
    'a run on a different underlying cannot be mistaken for the same configuration')
})

test('the accepted option roots are recorded, so a settlement mix-up is visible', () => {
  const s = make()
  assert.deepEqual(s.config.roots, ['SPY'])
})
