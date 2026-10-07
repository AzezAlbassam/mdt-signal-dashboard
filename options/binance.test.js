import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseBinanceSymbol, buildContracts, needsDepth, gradeOiFor } from './binance.js'
import { contractMetrics } from './engine.js'

test('parses Binance option symbols', () => {
  assert.deepEqual(parseBinanceSymbol('BTC-270326-120000-C'), { asset: 'BTC', expiry: '2027-03-26', strike: 120000, type: 'C' })
  assert.deepEqual(parseBinanceSymbol('DOGE-261030-0.25-P'), { asset: 'DOGE', expiry: '2026-10-30', strike: 0.25, type: 'P' })
  assert.equal(parseBinanceSymbol('BTCUSDT'), null)
})

const feeds = {
  symbols: [
    { symbol: 'BTC-270326-120000-C', unit: 1, minQty: '0.01', filters: [{ filterType: 'LOT_SIZE', stepSize: '0.01' }, { filterType: 'PRICE_FILTER', tickSize: '5' }] },
    { symbol: 'BTC-261009-100000-P', unit: 1, minQty: '0.01', filters: [] },
    { symbol: 'BTC-261007-100000-C', unit: 1, minQty: '0.01', filters: [] }, // expires today: dropped
    { symbol: 'ETH-270326-5000-C', unit: 1, minQty: '0.01', filters: [] }, // other coin: dropped
  ],
  tickers: [
    { symbol: 'BTC-270326-120000-C', bidPrice: '9800', askPrice: '10000', volume: '4.5' },
    { symbol: 'BTC-261009-100000-P', bidPrice: '0', askPrice: '50', volume: '0' },
  ],
  marks: [{ symbol: 'BTC-270326-120000-C', delta: '0.41' }],
  openInterest: [{ symbol: 'BTC-270326-120000-C', sumOpenInterest: '60' }],
  asset: 'BTC',
  today: '2026-10-07',
}

test('joins the four feeds into engine contracts', () => {
  const cs = buildContracts(feeds)
  assert.deepEqual(cs.map((c) => c.sym), ['BTC-270326-120000-C', 'BTC-261009-100000-P'])
  const c = cs[0]
  assert.equal(c.expiry, '2027-03-26')
  assert.equal(c.bid, 9800)
  assert.equal(c.adv, 4.5)
  assert.equal(c.oi, 60)
  assert.equal(c.delta, 0.41)
  assert.equal(c.lot, 0.01)
  assert.equal(c.multiplier, 1)
  assert.equal(c.tick, 5)
  assert.equal(cs[1].oi, 0)
})

test('depth is fetched only where the bid could change the size', () => {
  const [c, noBid] = buildContracts(feeds)
  assert.equal(needsDepth(c), true) // 10% of 4.5 = 0.45 < 5% of 60 = 3
  assert.equal(needsDepth(noBid), false)
  assert.equal(needsDepth({ ...c, adv: 0, volume: 0 }), false) // no volume: bid path is worth 0
  assert.equal(needsDepth({ ...c, adv: 100 }), false) // 10% of 100 = 10 ≥ 3: OI binds anyway
  assert.equal(needsDepth({ ...c, depthKnown: true }), false)
})

test('a contract that skips depth gets the same size it would with any bid', () => {
  // OI binds: with or without the bid the size is 5% of OI
  const c = { ...buildContracts(feeds)[0], adv: 100 }
  assert.equal(contractMetrics({ ...c, bidSize: 0 }).capContracts, contractMetrics({ ...c, bidSize: 50 }).capContracts)
})

test('grade thresholds scale with the coin price', () => {
  assert.deepEqual(gradeOiFor(100000), [200, 50, 10])
})
