// Study 17 data file (PROTOCOL-study17.md §1 + addendum 1): one row per company with its market
// value at every December close 2015–2025 and the 2026-10-23 snapshot, US membership per date,
// fiscal-year revenue, and the addendum's screens.
//   node scripts/caps-build.js  → data/caps/companies.json, data/caps/screens.json
import fs from 'node:fs'
import path from 'node:path'
import { parseFundamentals } from '../engine/fairvalue.js'
import { decCloses, sharesFor } from '../engine/caps.js'

const YEARS = Array.from({ length: 11 }, (_, i) => 2015 + i)
const DIRS = ['data/fv', 'data/fv8', 'data/caps']
const readJson = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d)
const fileSym = (f) => path.basename(f, '.json').replace('_', ':')
const tickerOf = (sym) => sym.split(':')[1]

// ---------------------------------------------------------------- inputs
const spRows = fs.readFileSync('data/caps/sp500-history.csv', 'utf8').trim().split('\n').slice(1).map((l) => {
  const i = l.indexOf(',')
  return [l.slice(0, i), l.slice(i + 1).replace(/"/g, '').split(',')]
})
const spAt = (date) => {
  let set = null
  for (const [d, t] of spRows) if (d <= date) set = t
  return new Set(set)
}
const spDates = Object.fromEntries([...YEARS.map((y) => [y, `${y}-12-31`]), [2026, '2026-12-31']])
const SP = Object.fromEntries(Object.entries(spDates).map(([y, d]) => [y, spAt(d)]))

const tickers = readJson('data/caps/tickers.json', {}) // S&P ticker → [{ from?, until?, symbol? | dead? }]
const dead = readJson('data/caps/dead.json', {}) // id → { name, sector, lastYear, yearEnds: { Y: { close, shares, cap, src } } }
const overrides = readJson('data/caps/overrides.json', {}) // symbol → { Y: { shares?, close?, src } }
const snap = readJson('data/caps/screener-2026-10-23.json').data.rows
const quotes = { ...readJson('data/caps/quotes.json', {}) }
for (const r of snap) quotes[r.symbol] = { ...(quotes[r.symbol] ?? {}), ...r }
const sectors = Object.assign({}, ...['data/fv', 'data/fv8'].map((d) => readJson(`${d}/sectors.json`, {})))

// ---------------------------------------------------------------- symbols with data
const px = new Map()
const fin = new Map()
for (const d of DIRS) {
  for (const f of fs.existsSync(`${d}/raw/px`) ? fs.readdirSync(`${d}/raw/px`) : fs.existsSync(`${d}/px`) ? fs.readdirSync(`${d}/px`) : []) {
    const p = fs.existsSync(`${d}/raw/px/${f}`) ? `${d}/raw/px/${f}` : `${d}/px/${f}`
    const b = readJson(p).bars // several folders may hold a symbol: the longest history wins
    if (!px.has(fileSym(f)) || b.t.length > px.get(fileSym(f)).t.length) px.set(fileSym(f), b)
  }
  for (const f of fs.existsSync(`${d}/raw/fin`) ? fs.readdirSync(`${d}/raw/fin`) : fs.existsSync(`${d}/fin`) ? fs.readdirSync(`${d}/fin`) : []) {
    const p = fs.existsSync(`${d}/raw/fin/${f}`) ? `${d}/raw/fin/${f}` : `${d}/fin/${f}`
    fin.set(fileSym(f), parseFundamentals(readJson(p)))
  }
}
const typeOf = (s) => sectors[s]?.type ?? (quotes[s] ? 'stock' : null)
const syms = [...px.keys()].filter((s) => fin.has(s) && typeOf(s) !== 'fund')

// one company per identical net-income series (share classes)
const niKey = (s) => {
  const v = fin.get(s).filter((f) => f.ni != null).map((f) => `${f.year}:${f.ni}`)
  return v.length >= 3 ? v.join('|') : `solo:${s}`
}
const groups = new Map()
for (const s of syms.sort()) (groups.get(niKey(s)) ?? groups.set(niKey(s), []).get(niKey(s))).push(s)
const keyOf = new Map()
for (const g of groups.values()) for (const s of g) keyOf.set(s, g[0])

// ---------------------------------------------------------------- S&P ticker → company key
const EX = ['NYSE', 'NASDAQ', 'AMEX', 'CBOE']
const unresolved = {}
const noData = {} // mapped, but no price/fundamental file or no researched values yet
function resolve(t, date) {
  for (const e of tickers[t] ?? []) {
    if ((e.from && date < e.from) || (e.until && date > e.until)) continue
    if (e.dead) return `dead:${e.dead}`
    if (e.symbol) return keyOf.get(e.symbol) ?? `nodata:${e.symbol}`
    if (e.skip) return null
  }
  for (const ex of EX) if (keyOf.has(`${ex}:${t}`)) return keyOf.get(`${ex}:${t}`)
  return undefined
}
const member = {} // key → { Y: true }
for (const [y, set] of Object.entries(SP)) {
  for (const t of set) {
    const k = resolve(t, spDates[y])
    if (k === undefined) { (unresolved[y] ??= []).push(t); continue }
    if (k?.startsWith('nodata:') || (k?.startsWith('dead:') && !dead[k.slice(5)])) { (noData[y] ??= []).push(`${t}→${k}`); continue }
    if (k) (member[k] ??= {})[y] = true
  }
}

// ---------------------------------------------------------------- companies
const companies = []
const screens = []
const shareOf = (k, funds, y) => {
  const o = overrides[k]?.[y]
  if (o?.shares) return { shares: o.shares, year: y, flagged: false, override: o.src }
  return sharesFor(funds, y)
}
for (const [, g] of groups) {
  const k = g[0]
  const funds = fin.get(k)
  const dec = decCloses(px.get(k))
  const cap = {}
  const close = {}
  const flags = {}
  for (const y of YEARS) {
    const o = overrides[k]?.[y]
    if (o?.cap > 0) { // addendum 1: actual close × cover-page shares, both unadjusted
      cap[y] = o.cap
      if (dec[y] > 0) close[y] = dec[y]
      flags[y] = `override: ${o.src}`
      continue
    }
    const c = dec[y]
    const s = shareOf(k, funds, y)
    if (c > 0 && s) {
      cap[y] = c * s.shares
      close[y] = c
      if (s.flagged || s.override) flags[y] = s.override ? `override: ${s.override}` : `shares from FY${s.year}`
    }
  }
  const q = g.map((s) => quotes[s]).find((x) => x?.market_cap_basic > 0)
  if (q) cap[2026] = q.market_cap_basic
  if (q?.close) close[2026] = q.close
  const country = g.map((s) => quotes[s]?.country).find(Boolean) ?? null
  const exchangeOk = /^(NYSE|NASDAQ|AMEX):/.test(k)
  const us = {}
  for (const y of [...YEARS, 2026]) {
    if (!(cap[y] > 0)) continue
    if (member[k]?.[y] || (country === 'United States' && exchangeOk)) us[y] = true
  }
  const rev = Object.fromEntries(funds.filter((f) => f.rev > 0).map((f) => [f.year, f.rev]))
  const bars = px.get(k)
  // V1/S4 on the same day as TradingView's value: the snapshot's close, not the last stored monthly bar
  const lastShares = sharesFor(funds, Math.max(...funds.map((f) => f.year)))
  const v1 = q?.close > 0 && lastShares ? { model: q.close * lastShares.shares, tv: q.market_cap_basic } : null
  companies.push({ key: k, aliases: g.slice(1), name: q?.description ?? quotes[k]?.description ?? tickerOf(k), symbol: k, sector: sectors[k]?.sector ?? q?.sector ?? null, country, dead: null, cap, close, rev, us, flags, v1 })

  // addendum 1 screens (company-years of members, and of anybody in the top 250 — applied after ranking below)
  const sh = Object.fromEntries(funds.filter((f) => f.shares > 0).map((f) => [f.year, f.shares]))
  const firstBar = new Date(bars.t[0] * 1000).toISOString().slice(0, 10)
  for (const y of YEARS) {
    const why = []
    if (sh[y] && ((sh[y - 1] && Math.abs(Math.log(sh[y] / sh[y - 1])) > Math.log(1.25)) || (sh[y + 1] && Math.abs(Math.log(sh[y] / sh[y + 1])) > Math.log(1.25)))) why.push('S1 jump')
    const eps = funds.find((f) => f.year === y)?.eps
    if (close[y] && eps > 0 && close[y] / eps < 4) why.push('S2 P/E<4')
    if (cap[y] && rev[y] && (cap[y] / rev[y] < 0.1 || cap[y] / rev[y] > 100)) why.push('S2 P/S')
    if (member[k]?.[y] && !(cap[y] > 0)) why.push(firstBar > `${y}-12-31` ? 'S3 history starts later' : 'S3 no value')
    if (why.length) screens.push({ key: k, year: y, why, cap: cap[y] ?? null, close: close[y] ?? null, shares: sh[y] ?? null, member: !!member[k]?.[y] })
  }
  if (v1 && Math.abs(v1.model / v1.tv - 1) > 0.15) screens.push({ key: k, year: 2026, why: ['S4 today'], model: v1.model, tv: v1.tv, member: !!member[k]?.[2026] })
}
for (const [id, d] of Object.entries(dead)) {
  const cap = {}
  const close = {}
  for (const [y, v] of Object.entries(d.yearEnds ?? {})) {
    const c = v.cap ?? (v.close > 0 && v.shares > 0 ? v.close * v.shares : null)
    if (c > 0) { cap[y] = c; close[y] = v.close ?? null }
  }
  const key = `dead:${id}`
  const us = {}
  for (const y of Object.keys(cap)) if (member[key]?.[y] || d.us) us[y] = true
  companies.push({ key, aliases: [], name: d.name, symbol: d.tvSymbol ?? null, sector: d.sector ?? null, country: d.country ?? null, dead: d.lastYear, cap, close, rev: {}, us, flags: {}, v1: null })
}

// members with no data at all and screens restricted per addendum (members, or top 250 at that date)
const top250 = {}
for (const y of [...YEARS, 2026]) {
  const r = companies.filter((c) => c.us[y]).sort((a, b) => b.cap[y] - a.cap[y]).slice(0, 250)
  top250[y] = new Set(r.map((c) => c.key))
}
const kept = screens.filter((s) => s.member || top250[s.year]?.has(s.key))
const missingCountry = companies.filter((c) => !c.country && !c.dead && Object.keys(c.cap).some((y) => !member[c.key]?.[y]) && YEARS.some((y) => c.cap[y] >= 15e9)).map((c) => c.key)

const asOf = new Date().toISOString().slice(0, 10)
fs.writeFileSync('data/caps/companies.json', JSON.stringify({ asOf, companies }))
fs.writeFileSync('data/caps/screens.json', JSON.stringify({ asOf, screens: kept, unresolved, noData, missingCountry }, null, 1))
console.log(`companies ${companies.length} (${Object.keys(dead).length} dead); share-class groups merged: ${[...groups.values()].filter((g) => g.length > 1).map((g) => g.join('+')).join(', ')}`)
console.log(`unresolved S&P tickers per date: ${Object.entries(unresolved).map(([y, t]) => `${y}: ${t.length}`).join(', ') || 'none'}; mapped without data: ${Object.entries(noData).map(([y, t]) => `${y}: ${t.length}`).join(', ') || 'none'}`)
console.log(`screens kept: ${kept.length} (${['S1', 'S2', 'S3', 'S4'].map((s) => `${s} ${kept.filter((x) => x.why.some((w) => w.startsWith(s))).length}`).join(', ')}); non-members ≥$15B with no country: ${missingCountry.length}`)
