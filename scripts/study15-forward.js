// Study 15 addendum 1 §4: freeze OGL and the line candidates for one session, before any vendor
// chart of it is looked at.
//
//   node scripts/study15-forward.js 2026-10-23     → forward-log/study15-2026-10-23.json
//
// Needs data/study15/SP_SPX_1m.json covering the day and its 0DTE chain in data/study15/opt/
// (scripts/study15-collect.js). Strike range: 50 points beyond the session low and high (§4).
import fs from 'node:fs'
import zlib from 'node:zlib'
import { sessionVwap } from '../engine/vwap.js'
import { exposures } from '../engine/gamma.js'

const DAY = process.argv[2]
if (!/^\d{4}-\d{2}-\d{2}$/.test(DAY)) throw new Error('usage: study15-forward.js YYYY-MM-DD')
const etDate = (t) => new Date((t - 4 * 3600) * 1000).toISOString().slice(0, 10) // EDT until 2026-11-01
const sessionT = (hm) => Date.parse(`${DAY}T${hm}:00-04:00`) / 1000
const inRth = (t) => etDate(t) === DAY && t >= sessionT('09:30') && t < sessionT('16:00')

const spot = JSON.parse(fs.readFileSync('data/study15/SP_SPX_1m.json', 'utf8')).bars.filter((b) => inRth(b.t))
if (spot.length < 380) throw new Error(`only ${spot.length} regular-session SPX minutes for ${DAY}`)
const tag = DAY.slice(2).replaceAll('-', '')
const chain = fs.readdirSync('data/study15/opt').filter((f) => f.includes(`SPXW${tag}`)).map((f) => {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(`data/study15/opt/${f}`)))
  const m = j.symbol.match(/SPXW\d{6}([CP])(\d+)\.0$/)
  return { strike: Number(m[2]), call: m[1] === 'C', bars: j.t.map((t, i) => ({ t, c: j.c[i], v: j.v[i] })).filter((b) => inRth(b.t)) }
})
const lo = Math.min(...spot.map((b) => b.l)), hi = Math.max(...spot.map((b) => b.h))
const want = []
for (let k = Math.ceil((lo - 50) / 5) * 5; k <= hi + 50; k += 5) want.push(k)
const have = new Set(chain.map((c) => `${c.call ? 'C' : 'P'}${c.strike}`))
const missing = want.flatMap((k) => ['C', 'P'].map((s) => `${s}${k}`)).filter((x) => !have.has(x))
const used = chain.filter((c) => want.includes(c.strike))

const ogl = exposures(spot, used, sessionT('16:00'))
const levels = ['10:30', '12:00', '14:00', '15:30'].map((hm) => {
  const i = ogl.times.indexOf(sessionT(hm))
  const all = ogl.strikes.map((k, j) => ({ strike: k, E: Math.round(ogl.E[i][j]) })).sort((a, b) => Math.abs(b.E) - Math.abs(a.E))
  return { et: hm, spx: spot[i].c, top: all.slice(0, 7) }
})

const flow = new Map(), prem = new Map()
for (const c of used) for (const b of c.bars) { flow.set(b.t, (flow.get(b.t) ?? 0) + b.v); prem.set(b.t, (prem.get(b.t) ?? 0) + b.v * b.c * 100) }
const lines = {
  V0: sessionVwap(spot, { weight: () => 1 }),
  V1: sessionVwap(spot),
  F1: sessionVwap(spot, { weight: (b) => flow.get(b.t) ?? 0 }),
  F2: sessionVwap(spot, { weight: (b) => prem.get(b.t) ?? 0 }),
}
const every3 = []
for (let i = 2; i < spot.length; i += 3) {
  const row = { et: new Date((spot[i - 2].t - 4 * 3600) * 1000).toISOString().slice(11, 16) }
  for (const [id, s] of Object.entries(lines)) row[id] = s[i] && [+s[i].vwap.toFixed(3), +s[i].sd.toFixed(3)]
  every3.push(row)
}

const out = {
  study: 'PROTOCOL-study15-addendum-1.md §4', session: DAY, frozen_utc: new Date().toISOString(),
  strikes: [want[0], want.at(-1)], contracts_used: used.length, missing,
  ogl_note: 'E = $ per 1% move; + yellow (calls), − purple (puts); top 7 by |E|',
  ogl_levels: levels,
  lines_note: 'per 3-minute bar from 09:30 (bar start ET): [line, sigma] after its last minute; V0 equal, V1 SPX volume, F1 0DTE contracts, F2 0DTE premium',
  lines: every3,
}
fs.mkdirSync('forward-log', { recursive: true })
fs.writeFileSync(`forward-log/study15-${DAY}.json`, JSON.stringify(out, null, 1))
console.log(`${DAY}: ${used.length} contracts, strikes ${want[0]}-${want.at(-1)}, missing ${missing.length}`)
for (const l of levels) console.log(`  ${l.et} SPX ${l.spx}  ${l.top.slice(0, 5).map((x) => `${x.strike} ${(x.E / 1e9).toFixed(1)}B`).join('  ')}`)
