// Loads a study 7-style universe folder (symbols.json, sectors.json, raw/fin, raw/px) with
// study 7 §A1's rules: type stock, ≥ 6 fiscal years with revenue and EPS, ≥ 60 months.
import fs from 'node:fs'
import path from 'node:path'
import { parseFundamentals, monthKey } from '../../engine/fairvalue.js'

export function loadUniverse(dir, lastComplete) {
  const symbols = JSON.parse(fs.readFileSync(path.join(dir, 'symbols.json'), 'utf8'))
  const sectors = JSON.parse(fs.readFileSync(path.join(dir, 'sectors.json'), 'utf8'))
  const file = (d, s) => path.join(dir, 'raw', d, `${s.replace(':', '_')}.json`)
  const stocks = []
  const excluded = {}
  const out = (why, s) => (excluded[why] ??= []).push(s)
  for (const sym of symbols) {
    if (!sectors[sym]) { out('no screener row', sym); continue }
    if (sectors[sym].type !== 'stock') { out(`type ${sectors[sym].type}`, sym); continue }
    if (!fs.existsSync(file('fin', sym))) { out('no annual fundamentals', sym); continue }
    const funds = parseFundamentals(JSON.parse(fs.readFileSync(file('fin', sym), 'utf8')))
    if (funds.filter((f) => f.rev != null && f.eps != null).length < 6) { out('under 6 fiscal years', sym); continue }
    if (!fs.existsSync(file('px', sym))) { out('no monthly prices', sym); continue }
    const b = JSON.parse(fs.readFileSync(file('px', sym), 'utf8')).bars
    const closes = new Map()
    b.t.forEach((t, i) => {
      const m = monthKey(t)
      if (m <= lastComplete && Number.isFinite(b.c[i])) closes.set(m, b.c[i])
    })
    if (closes.size < 60) { out('under 60 months of prices', sym); continue }
    stocks.push({ sym, sector: sectors[sym].sector ?? null, funds, closes })
  }
  return { stocks, excluded, total: symbols.length }
}
