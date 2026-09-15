#!/usr/bin/env node
/**
 * One evening's snapshot: fetch the closes and the option chain, build the
 * bands, score yesterday, and write the record.
 *
 * All the judgment lives in lib/. This file only does I/O, and it is written so
 * that every failure still produces a row. A history that quietly skips the
 * days the feed was unhealthy is biased toward calm markets.
 *
 *   node scripts/snapshot.mjs [--dry-run]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseChain } from '../lib/cboe-chain.js'
import { buildSnapshot, stableJson } from '../lib/snapshot.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'data', 'em')
const CHAIN_URL = 'https://cdn.cboe.com/api/global/delayed_quotes/options/SPY.json'
const STOOQ_URL = 'https://stooq.com/q/d/l/?s=spy.us&i=d'
const YAHOO_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=1y&interval=1d'
const DRY = process.argv.includes('--dry-run')
/** Run the whole pipeline against the committed fixtures, with no network. */
const FIXTURE = process.argv.includes('--fixture')

const log = (...a) => console.log('[em]', ...a)

async function fetchWithRetry (url, { tries = 4, timeoutMs = 120000, json = true } = {}) {
  let lastError
  for (let attempt = 1; attempt <= tries; attempt++) {
    const control = new AbortController()
    const timer = setTimeout(() => control.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        signal: control.signal,
        headers: { 'user-agent': 'mdt-signal-dashboard/1.0 (+github pages)' },
      })
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} ${res.statusText}`)
        // 403 and 407 are policy denials from a proxy, not congestion.
        // Retrying them wastes the run's budget and changes nothing.
        err.permanent = res.status === 403 || res.status === 407
        throw err
      }
      return json ? await res.json() : await res.text()
    } catch (err) {
      lastError = err
      log(`attempt ${attempt}/${tries} failed for ${new URL(url).host}: ${err.message}`)
      if (err.permanent) break
      if (attempt < tries) await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError
}

/** Daily bars keyed by date. Stooq first because it needs no key and no shaping. */
async function fetchBars () {
  if (FIXTURE) {
    const market = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/market.json'), 'utf8'))
    const bars = Object.fromEntries(market.sessions
      .filter((s) => s.date <= '2026-09-11')
      .map((s) => [s.date, { date: s.date, open: s.open, high: s.high, low: s.low, close: s.close }]))
    log(`bars from the committed fixture: ${Object.keys(bars).length}`)
    return bars
  }
  try {
    const csv = await fetchWithRetry(STOOQ_URL, { json: false, timeoutMs: 60000 })
    const rows = csv.trim().split('\n').slice(1)
    if (rows.length < 30) throw new Error(`only ${rows.length} rows returned`)
    const bars = {}
    for (const line of rows) {
      const [date, open, high, low, close] = line.split(',')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      bars[date] = { date, open: +open, high: +high, low: +low, close: +close }
    }
    log(`bars from stooq: ${Object.keys(bars).length}`)
    return bars
  } catch (err) {
    log(`stooq failed (${err.message}); falling back to the chart API`)
    const data = await fetchWithRetry(YAHOO_URL, { timeoutMs: 60000 })
    const r = data.chart.result[0]
    const q = r.indicators.quote[0]
    const bars = {}
    r.timestamp.forEach((t, i) => {
      if (q.close[i] == null) return
      const date = new Date(t * 1000).toISOString().slice(0, 10)
      bars[date] = { date, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i] }
    })
    log(`bars from the chart API: ${Object.keys(bars).length}`)
    return bars
  }
}

const readJson = async (path, fallback = null) => {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { return fallback }
}

async function main () {
  const capturedAt = new Date().toISOString()
  await mkdir(join(OUT, 'history'), { recursive: true })
  const latestPath = join(OUT, 'latest.json')
  const previous = await readJson(latestPath)

  let bars = {}
  let chain = null
  let failure = null
  try {
    bars = await fetchBars()
  } catch (err) {
    failure = `price history unavailable: ${err.message}`
  }
  if (!failure) {
    try {
      const raw = FIXTURE
        ? JSON.parse(await readFile(join(ROOT, 'tests/fixtures/chain-sample.json'), 'utf8'))
        : await fetchWithRetry(CHAIN_URL)
      chain = parseChain(raw)
      log(`chain: ${chain.contracts.length} contracts, spot ${chain.spot}, rejected ${JSON.stringify(chain.rejected)}`)
    } catch (err) {
      failure = `option chain unavailable: ${err.message}`
    }
  }

  const closes = Object.fromEntries(
    Object.values(bars).map((b) => [b.date, b.close]).sort((a, b) => (a[0] < b[0] ? -1 : 1)))
  const snapshot = buildSnapshot({ closes, chain, capturedAt, bars, previous, failure })

  log(`status ${snapshot.status}${snapshot.reason ? `: ${snapshot.reason}` : ''}`)
  if (snapshot.status === 'ok') {
    for (const [k, b] of Object.entries(snapshot.bands)) {
      if (b) log(`  ${k.padEnd(13)} ${b.lower} .. ${b.upper}  (anchor ${b.anchorDate} ${b.anchorClose}, expiry ${b.expiry}, ${b.days}d)`)
    }
    if (snapshot.scored) log(`  scored ${snapshot.scored.session} against the ${snapshot.scored.anchorDate} bands`)
  }

  if (DRY) { log('dry run, nothing written'); return }

  await writeFile(latestPath, stableJson(snapshot))
  if (snapshot.asOf) {
    await writeFile(join(OUT, 'history', `${snapshot.asOf}.json`), stableJson(snapshot))
  }

  const index = await readJson(join(OUT, 'index.json'), { schema: 1, rows: [] })
  const row = {
    asOf: snapshot.asOf,
    capturedAt: snapshot.capturedAt,
    status: snapshot.status,
    reason: snapshot.reason,
    scored: snapshot.scored ?? null,
  }
  index.rows = index.rows.filter((r) => r.asOf !== snapshot.asOf).concat(row)
    .sort((a, b) => (a.asOf < b.asOf ? -1 : 1))
  await writeFile(join(OUT, 'index.json'), stableJson(index))
  log(`wrote latest.json, history/${snapshot.asOf}.json and index.json (${index.rows.length} rows)`)
}

main().catch((err) => { console.error('[em] fatal:', err); process.exit(1) })
