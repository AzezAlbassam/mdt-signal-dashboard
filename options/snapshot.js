// Pull delayed option chains from Cboe for every ticker on the watchlist, fold today's
// volume into a rolling 20-session history, and write one compact snapshot per ticker.
//
//   node options/snapshot.js <dataDir> [--add MSTR,HOOD] [--remove XYZ] [--only MSTR]
//
// <dataDir> holds watchlist.json, removed.json, history/<T>.json and receives <T>.json + index.json.
// Runs in GitHub Actions; the page reads the snapshots as static files.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { chainRows, mergeSession, averageVolume, tickerSummary, nyDate } from './engine.js'

const INDEXES = new Set(['SPX', 'NDX', 'RUT', 'VIX', 'XSP', 'DJX', 'OEX', 'XEO'])
const UA = 'options-liquidity-snapshot/1.0'

const readJson = async (p, fallback) => {
  try {
    return JSON.parse(await readFile(p, 'utf8'))
  } catch {
    return fallback
  }
}

const cleanTickers = (s) =>
  (s ?? '').split(/[,\s]+/).map((t) => t.trim().toUpperCase().replace(/^\$/, '')).filter((t) => /^[A-Z.]{1,6}$/.test(t))

// NYSE full-day holidays and 13:00 early closes.
// ponytail: a hand list through 2028 (from the exchange rules); add the next years before then.
const HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
  '2028-01-17', '2028-02-21', '2028-04-14', '2028-05-29', '2028-06-19', '2028-07-04', '2028-09-04', '2028-11-23', '2028-12-25',
])
const EARLY_CLOSE = new Set(['2026-11-27', '2026-12-24', '2027-11-26', '2028-07-03', '2028-11-24'])

// The feed runs 15 minutes behind the market, so every clock time here is the market time
// its data shows plus LAG. Index-ETF options (SPY, QQQ, IWM) trade 15 minutes past the close.
const LAG = 15

/** New York clock on a trading day — minutes since midnight and the day's close — or null. */
function nyClock(now) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  )
  const date = `${p.year}-${p.month}-${p.day}`
  if (p.weekday === 'Sat' || p.weekday === 'Sun' || HOLIDAYS.has(date)) return null
  return { m: Number(p.hour) * 60 + Number(p.minute), close: EARLY_CLOSE.has(date) ? 780 : 960 }
}
const finalAt = (c) => c.close + 15 + LAG + 5 // the feed shows 5 minutes past the last options trade

/** Whether the feed shows the session trading: 9:30 to the close (+15 for index-ETF options). */
export function marketOpen(now = new Date()) {
  const c = nyClock(now)
  return c != null && c.m >= 570 + LAG && c.m < c.close + 15 + LAG
}

/** The latest moment at or before `now` when a trading day's volume became final in the feed. */
export function lastClose(now = new Date()) {
  let t = new Date(Math.floor(now.getTime() / 60000) * 60000)
  for (let i = 0; i < 6 * 1440; i += 1) {
    const c = nyClock(t)
    if (c && c.m === finalAt(c)) return t
    t = new Date(t.getTime() - 60000)
  }
  return null
}

/**
 * What a long-running job should do next. GitHub's scheduler can start a job hours late,
 * so one job stays alive through the session instead of trusting the clock to start it:
 *   - inside the quote window: snapshot about once an hour
 *   - shortly before the window or the close: wait for it
 *   - otherwise: one snapshot if the last close is not captured yet, then stop
 * Returns { action: 'run' } | { action: 'wait', seconds } | { action: 'stop' }.
 */
export function plan(now, lastAttempt, lastSuccess = lastAttempt) {
  const c = nyClock(now)
  const since = lastAttempt ? (now - lastAttempt) / 60000 : Infinity
  const close = lastClose(now)
  // Captured means a pass succeeded after the close; a failed attempt does not count.
  const closeCaptured = lastSuccess && close && lastSuccess >= close
  const start = 600 + LAG
  if (c && c.m >= start && c.m < c.close - 10 + LAG) {
    if (since >= 55) return { action: 'run' }
    return { action: 'wait', seconds: Math.round(Math.min(60 - since, c.close - 10 + LAG - c.m) * 60) + 30 }
  }
  if (c && c.m < start && start - c.m <= 150) {
    if (!closeCaptured && since >= 55) return { action: 'run' }
    // Wake a couple of minutes in: the busiest chains are stamped a minute before they are
    // fetched, and a chain stamped before the window does not count as today's quotes.
    return { action: 'wait', seconds: (start - c.m) * 60 + 150 }
  }
  if (c && c.m >= c.close - 10 + LAG && c.m < finalAt(c)) return { action: 'wait', seconds: (finalAt(c) - c.m) * 60 + 30 }
  if (closeCaptured) return { action: 'stop' }
  // The close pass failed: try again about hourly through the evening, not all night.
  if (since < 55) return c && c.m < finalAt(c) + 180 ? { action: 'wait', seconds: Math.round((60 - since) * 60) } : { action: 'stop' }
  return { action: 'run' }
}

/**
 * When quotes are representative: 10:00 to 10 minutes before the close, New York. Spreads
 * in the first half hour and the last minutes are routinely two to three times wider.
 */
export function quoteWindow(now = new Date()) {
  const c = nyClock(now)
  return c != null && c.m >= 600 + LAG && c.m < c.close - 10 + LAG
}

/**
 * The moment after which the page should call the data late: the next pass plan() would run
 * (at least an hour away — hourly in the quote window, then the close capture, then the next
 * trading day's first pass), plus 90 minutes for a late or slow job.
 */
export function staleAfter(now) {
  let t = new Date(Math.floor(now.getTime() / 60000) * 60000 + 60 * 60000)
  for (let i = 0; i < 8 * 1440; i += 1) {
    const c = nyClock(t)
    if (c && ((c.m >= 600 + LAG && c.m < c.close - 10 + LAG) || c.m === finalAt(c))) return new Date(t.getTime() + 90 * 60000).toISOString()
    t = new Date(t.getTime() + 60000)
  }
  return null
}

/**
 * The trading day a missing chain counts against: today on a trading day, else the last one.
 * A pass on a weekend or holiday sees that day's chains again and adds no news.
 */
export function missDay(now) {
  return nyDate(nyClock(now) ? now : lastClose(now) ?? now)
}

/** When the chain itself was last updated, per Cboe's own stamp (UTC); null if unknown. */
function chainTime(raw, now) {
  const ts = raw?.timestamp
  if (typeof ts !== 'string') return null
  const d = new Date(`${ts.replace(' ', 'T')}Z`)
  return Number.isNaN(d.getTime()) || d > now ? null : d
}

/** The figures index.json carries for one ticker, from the contracts the page will read. */
function entryOf(snap, contracts, today) {
  const s = tickerSummary(contracts, today)
  return {
    price: snap.price, contracts: snap.rows.length, session: snap.session, historySessions: snap.historySessions, fetchedAt: snap.fetchedAt,
    tier: s.tier, medianSpread: s.medianSpread == null ? null : Math.round(s.medianSpread * 1000) / 1000,
    capacity: s.capacity, caps: s.caps, oi: s.oi,
  }
}

// While a session is still trading its volume is partial: ADV averages completed sessions only.
const completedSessions = (history, session, at) =>
  (history?.dates?.length ?? 0) - (marketOpen(at) && session === nyDate(at) && history?.dates?.at(-1) === session ? 1 : 0)

const COLS = ['sym', 'exp', 'type', 'strike', 'bid', 'ask', 'bidSize', 'volume', 'oi', 'delta', 'adv', 'sessions']

async function fetchChain(ticker) {
  const sym = INDEXES.has(ticker) ? `_${ticker}` : ticker
  const url = `https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(sym)}.json`
  let status = 0
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
      if (res.ok) return res.json()
      status = res.status
      // Cboe answers 403/404 for a symbol with no chain — and, now and then, for one that
      // has a chain. Believe it only on the second asking.
      if ((status === 403 || status === 404) && attempt >= 2) throw Object.assign(new Error('no listed options'), { noOptions: true })
    } catch (e) {
      if (e.noOptions) throw e
      status = String(e.cause?.code ?? e.message)
    }
    // Throttled or flaky: back off hard; a full-universe run is not in a hurry.
    await new Promise((r) => setTimeout(r, 5000 * attempt))
  }
  throw new Error(`Cboe did not answer (${status})`)
}

export async function snapshotTicker(ticker, dataDir, now) {
  const raw = await fetchChain(ticker)
  const today = nyDate(now)
  const { rows, session, totalVolume, price } = chainRows(raw, ticker, today)
  if (rows.length === 0) throw Object.assign(new Error('no listed options'), { noOptions: true })
  // A chain missing a whole field (a renamed column, a broken feed) would size every contract
  // at zero and still pass validation: count it as a failed fetch, keep the last snapshot.
  // (A field that is there but zero is real: some small chains have no quotes at all.)
  const listed = raw?.data?.options ?? []
  if (listed.length >= 20 && !listed.some((o) => o.bid != null || o.ask != null)) throw new Error('chain came back without quotes')
  if (rows.filter((r) => r.delta == null).length > rows.length / 2) throw new Error('chain came back without deltas')
  if (rows.length >= 20 && rows.every((r) => !r.oi)) throw new Error('chain came back without open interest')

  // History: one figure per contract per session, the day's final volume.
  const histPath = join(dataDir, 'history', `${ticker}.json`)
  let history = await readJson(histPath, null)
  if (session && totalVolume > 0) {
    history = mergeSession(history, session, Object.fromEntries(rows.map((r) => [r.sym, r.volume])))
    await writeFile(histPath, JSON.stringify(history))
  }

  // Quotes count as representative only when the chain itself is from the quote window: a
  // source can return a chain it last updated before today's open. Otherwise keep the last
  // representative quotes for any contract that already has them.
  const dataTime = chainTime(raw, now) ?? now
  const fresh = quoteWindow(dataTime)
  const completed = completedSessions(history, session, now)
  const prev = await readJson(join(dataDir, `${ticker}.json`), null)
  const prevQuotes = new Map()
  if (prev?.rows) {
    const ci = Object.fromEntries(prev.cols.map((c, i) => [c, i]))
    for (const r of prev.rows) prevQuotes.set(r[ci.sym], { bid: r[ci.bid], ask: r[ci.ask], bidSize: r[ci.bidSize] })
  }
  const keepPrev = !fresh && Boolean(prev?.quotesIntraday)
  const quotesFrom = keepPrev ? prev.quotesFrom : dataTime.toISOString()
  const quotesIntraday = fresh || keepPrev

  const expiries = [...new Set(rows.map((r) => r.expiry))].sort()
  const expIndex = new Map(expiries.map((e, i) => [e, i]))
  const contracts = rows.map((r) => {
    const q = keepPrev && prevQuotes.has(r.sym) ? prevQuotes.get(r.sym) : r
    const { adv, sessions } = averageVolume(history?.vol?.[r.sym]?.slice(0, completed))
    // Round here, once: the summary below must be computed from exactly the values the
    // page will read, or a contract on a delta boundary counts in one and not the other.
    const delta = r.delta == null ? null : Math.round(r.delta * 1000) / 1000
    return { ...r, bid: q.bid, ask: q.ask, bidSize: q.bidSize, delta, adv: Math.round(adv * 10) / 10, sessions }
  })
  const out = contracts.map((c) => [
    c.sym, expIndex.get(c.expiry), c.type, c.strike, c.bid, c.ask, c.bidSize, c.volume, c.oi, c.delta, c.adv, c.sessions,
  ])
  const snap = {
    ticker,
    price,
    cboeTimestamp: raw.timestamp ?? null,
    fetchedAt: now.toISOString(),
    quotesFrom,
    quotesIntraday,
    session,
    historySessions: completed,
    sessionInProgress: completed < (history?.dates?.length ?? 0),
    historyDates: history?.dates ?? [],
    expiries,
    cols: COLS,
    rows: out,
  }
  await writeFile(join(dataDir, `${ticker}.json`), JSON.stringify(snap))
  return entryOf(snap, contracts, today)
}

/**
 * Recompute a stored snapshot with the current engine, without asking the source: ADV from
 * the history, then the index figures. Run after the method changes, so the list and the tool
 * agree before the next pass.
 */
export async function resummarize(ticker, dataDir) {
  const path = join(dataDir, `${ticker}.json`)
  const snap = await readJson(path, null)
  if (!snap?.rows) return null
  const history = await readJson(join(dataDir, 'history', `${ticker}.json`), null)
  const at = new Date(snap.fetchedAt)
  // Snapshots written before chainTime() was checked: a chain older than its label.
  const ct = chainTime({ timestamp: snap.cboeTimestamp }, at)
  if (ct && snap.quotesFrom && ct < new Date(snap.quotesFrom)) {
    snap.quotesFrom = ct.toISOString()
    snap.quotesIntraday = quoteWindow(ct)
  }
  // Which sessions were complete was decided when the snapshot was taken; keep that.
  const completed = snap.historySessions ?? 0
  const ci = Object.fromEntries(snap.cols.map((c, i) => [c, i]))
  const contracts = snap.rows.map((r) => {
    const { adv, sessions } = averageVolume(history?.vol?.[r[ci.sym]]?.slice(0, completed))
    r[ci.adv] = Math.round(adv * 10) / 10
    r[ci.sessions] = sessions
    return {
      sym: r[ci.sym], expiry: snap.expiries[r[ci.exp]], type: r[ci.type], strike: r[ci.strike], bid: r[ci.bid], ask: r[ci.ask],
      bidSize: r[ci.bidSize], volume: r[ci.volume], oi: r[ci.oi], delta: r[ci.delta], adv: r[ci.adv], sessions: r[ci.sessions],
    }
  })
  await writeFile(path, JSON.stringify(snap))
  return entryOf(snap, contracts, nyDate(at))
}

export async function main() {
  const [dataDir, ...rest] = process.argv.slice(2)
  if (rest.includes('--plan')) {
    const idx = await readJson(join(dataDir ?? '.', 'index.json'), null)
    // Pace by the last attempt, or a dead source is hammered; the close counts only once a
    // pass succeeded after it.
    const at = (s) => (s ? new Date(s) : null)
    const p = plan(new Date(), at(idx?.attemptedAt ?? idx?.updatedAt), at(idx?.updatedAt))
    console.log(p.action === 'wait' ? `wait ${p.seconds}` : p.action)
    return
  }
  if (!dataDir) throw new Error('usage: node options/snapshot.js <dataDir> [--add T,..] [--remove T,..] [--only T,..] [--resummarize]')
  if (rest.includes('--resummarize')) {
    const index = await readJson(join(dataDir, 'index.json'), null)
    if (!index?.tickers) throw new Error(`no index.json in ${dataDir}`)
    let n = 0
    for (const [t, e] of Object.entries(index.tickers)) {
      const s = e.noOptions ? null : await resummarize(t, dataDir)
      if (s) { index.tickers[t] = { ...e, ...s }; n += 1 }
    }
    if (!index.staleAfter && index.updatedAt) index.staleAfter = staleAfter(new Date(index.updatedAt))
    await writeFile(join(dataDir, 'index.json'), JSON.stringify(index, null, 2))
    console.log(`resummarized ${n} tickers with the current engine`)
    return
  }
  const arg = (name) => {
    const i = rest.indexOf(name)
    return i >= 0 ? rest[i + 1] : ''
  }
  await mkdir(join(dataDir, 'history'), { recursive: true })

  // Watchlist = the seed in the repo ∪ what was added since − what was removed since.
  const seed = await readJson(new URL('./watchlist.json', import.meta.url), [])
  const stored = await readJson(join(dataDir, 'watchlist.json'), [])
  const removed = new Set(await readJson(join(dataDir, 'removed.json'), []))
  const add = cleanTickers(arg('--add'))
  for (const t of add) removed.delete(t)
  for (const t of cleanTickers(arg('--remove'))) {
    removed.add(t)
    await rm(join(dataDir, `${t}.json`), { force: true }) // the page must not find it and show it as current
  }
  const watchlist = [...new Set([...seed, ...stored, ...add])].filter((t) => !removed.has(t))
  await writeFile(join(dataDir, 'watchlist.json'), JSON.stringify(watchlist))
  await writeFile(join(dataDir, 'removed.json'), JSON.stringify([...removed]))

  // --only refreshes tickers on the list; anything else would leave a snapshot nobody updates.
  const only = cleanTickers(arg('--only'))
  const targets = only.length ? only.filter((t) => watchlist.includes(t)) : watchlist
  if (only.length > targets.length) console.log(`--only: not on the list, skipped: ${only.filter((t) => !targets.includes(t)).join(', ')}`)
  const prevIndex = await readJson(join(dataDir, 'index.json'), { tickers: {} })
  const now = new Date()
  // A partial run (--only) refreshes its tickers but is not a pass: it neither moves the
  // schedule's clock nor tells the page the whole list is fresh.
  const index = only.length
    ? { updatedAt: prevIndex.updatedAt, attemptedAt: prevIndex.attemptedAt, staleAfter: prevIndex.staleAfter, marketOpen: marketOpen(now), tickers: {} }
    : { updatedAt: now.toISOString(), attemptedAt: now.toISOString(), staleAfter: staleAfter(now), marketOpen: marketOpen(now), tickers: {} }
  for (const t of watchlist) if (prevIndex.tickers?.[t]) index.tickers[t] = prevIndex.tickers[t]

  // Ask about one ticker that always has options before touching the rest. If even SPY
  // comes back empty the source is down: fetch nothing, count nothing, remove nothing.
  const canary = await fetchChain('SPY').then(() => null, (e) => e)
  if (canary) {
    for (const t of watchlist) {
      const prev = prevIndex.tickers?.[t]
      index.tickers[t] = prev?.noOptions ? prev : { ...(prev ?? { pending: true }), error: 'source unavailable this pass' }
    }
    index.updatedAt = prevIndex.updatedAt ?? index.updatedAt
    index.staleAfter = prevIndex.staleAfter ?? index.staleAfter
    console.log(`OUTAGE: no chain for SPY (${canary.message}) — nothing fetched, counted or removed`)
    await writeFile(join(dataDir, 'index.json'), JSON.stringify(index, null, 2))
    process.exitCode = 1
    return
  }

  // A small pool first, then one slow sequential pass over whatever was throttled.
  // What a missing chain means is decided only after the whole pass (below).
  const wasListed = (t) => { const p = prevIndex.tickers?.[t]; return Boolean(p && !p.noOptions && p.price != null) }
  let noOptions = 0
  const failed = []
  const lost = []
  const unseen = []
  const run = async (t) => {
    try {
      index.tickers[t] = await snapshotTicker(t, dataDir, new Date())
      return true
    } catch (e) {
      if (!e.noOptions) return e
      if (wasListed(t)) lost.push(t)
      else unseen.push(t)
      return true
    }
  }
  // A pass that runs into a throttled source must still end, be saved and be flagged, well
  // inside the job's time limit: past this budget nothing new is fetched.
  const budget = Date.now() + 40 * 60000
  const queue = [...targets]
  const worker = async () => {
    while (queue.length && Date.now() < budget) {
      const t = queue.shift()
      if ((await run(t)) !== true) failed.push(t)
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  await Promise.all(Array.from({ length: 3 }, worker))
  failed.push(...queue.splice(0))
  let failures = 0
  for (const t of failed) {
    let r = new Error('not reached within the time budget')
    if (Date.now() < budget) {
      await new Promise((res) => setTimeout(res, 1500))
      r = await run(t)
      if (r === true) continue
    }
    failures += 1
    // A ticker never fetched yet stays pending, so the page does not grade it.
    index.tickers[t] = { ...(index.tickers[t] ?? { pending: true }), error: String(r.message ?? r) }
    console.log(`${t}: FAILED — ${r.message ?? r}`)
  }
  // A few listed tickers losing their chain is news about those tickers. Most of them
  // losing it at once is the source being down — on 20 Nov 2026 Cboe closed its feed to
  // outside callers and every ticker came back empty — and must not erase anything: keep
  // the last snapshots, flag them, count nothing, keep the last good time, fail the run.
  const listed = targets.filter(wasListed)
  const outage = listed.length >= 10 && lost.length + failures > 0.2 * listed.length
  // One miss per trading day, not per pass: hourly passes must not turn one bad day into
  // three. (Counts from before lastMiss existed were per pass, so they start over.)
  const day = missDay(now)
  const miss = (prev) => {
    const counted = prev?.lastMiss ? prev.misses ?? 0 : 0
    return prev?.lastMiss === day ? { misses: counted, lastMiss: day } : { misses: counted + 1, lastMiss: day }
  }
  for (const t of lost) {
    const prev = prevIndex.tickers[t]
    if (outage) { index.tickers[t] = { ...prev, error: 'source unavailable this pass' }; continue }
    const m = miss(prev)
    if (m.misses < 3) { index.tickers[t] = { ...prev, error: 'no chain returned', ...m }; continue }
    noOptions += 1
    index.tickers[t] = { noOptions: true }
    await rm(join(dataDir, `${t}.json`), { force: true })
  }
  // A ticker never seen with a chain (a newly added one) stays pending: during an outage the
  // answer says nothing, and otherwise it takes empty answers on three trading days — the
  // source also answers empty, now and then, for a symbol that has options.
  for (const t of unseen) {
    const prev = prevIndex.tickers?.[t]
    if (prev?.noOptions) { index.tickers[t] = prev; continue }
    if (outage) { index.tickers[t] = { ...(prev ?? { pending: true }), error: 'source unavailable this pass' }; continue }
    const m = miss(prev)
    if (m.misses < 3) { index.tickers[t] = { ...(prev ?? {}), pending: true, error: 'no chain returned', ...m }; continue }
    noOptions += 1
    index.tickers[t] = { noOptions: true }
    await rm(join(dataDir, `${t}.json`), { force: true })
  }
  if (outage) {
    index.updatedAt = prevIndex.updatedAt ?? index.updatedAt
    index.staleAfter = prevIndex.staleAfter ?? index.staleAfter
  }
  console.log(`retried ${failed.length} after throttling`)
  console.log(`${targets.length} tickers: ${targets.length - failures - noOptions - lost.length} with options, ${noOptions} without, ${lost.length} lost their chain, ${failures} failed`)
  if (outage) console.log(`OUTAGE: ${lost.length + failures} of ${listed.length} listed tickers unreachable — nothing counted or removed`)
  await writeFile(join(dataDir, 'index.json'), JSON.stringify(index, null, 2))
  if (outage || failures > targets.length / 2) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
