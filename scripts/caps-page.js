// Study 17 page: caps.html from pages/caps.template.html + data/caps/companies.json, plus
// reports/study17.json (tests and tables) and data/caps/research.json (page 2) when they exist.
//   node scripts/caps-page.js
import fs from 'node:fs'

const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null)
const D = readJson('data/caps/companies.json')
const study = readJson('reports/study17.json')
const research = readJson('data/caps/research.json')
const POINTS = [...Array.from({ length: 11 }, (_, i) => 2015 + i), 2026]
const LABELS = POINTS.map((y) => (y === 2026 ? '23 أكتوبر 2026' : `ديسمبر ${y}`))
const GROUP = { 'Electronic Technology': 1, 'Technology Services': 1, Finance: 2, 'Health Technology': 3, 'Health Services': 3 }

// a company counts at a point when it is a US company then and has a value (PROTOCOL-study17.md §1)
const ranks = POINTS.map((y) => D.companies.filter((c) => c.us?.[y] && c.cap?.[y] > 0).sort((a, b) => b.cap[y] - a.cap[y]))
const keep = [...new Set(ranks.flatMap((r) => r.slice(0, 100)).map((c) => c.key))]
const index = new Map(keep.map((k, i) => [k, i]))
const byKey = new Map(D.companies.map((c) => [c.key, c]))
const ALIAS = {
  'NASDAQ:SPCX': 'SpaceX', 'NYSE:JPM': 'JPMorgan Chase', 'NYSE:LLY': 'Eli Lilly', 'NYSE:BRK.A': 'Berkshire Hathaway', 'NASDAQ:GOOG': 'Alphabet', 'NYSE:PG': 'Procter & Gamble', 'NYSE:JNJ': 'Johnson & Johnson', 'NYSE:AXP': 'American Express', 'NASDAQ:AMZN': 'Amazon',
  'NYSE:PM': 'Philip Morris', 'NYSE:IBM': 'IBM', 'dead:AGN': 'Allergan', 'NYSE:NKE': 'Nike', 'NASDAQ:KHC': 'Kraft Heinz', 'NYSE:KHC': 'Kraft Heinz', 'NYSE:SLB': 'Schlumberger (SLB)', 'NYSE:RTX': 'RTX (United Technologies)', 'NYSE:AIG': 'AIG', 'NASDAQ:BIIB': 'Biogen',
  'dead:DD-old': 'DuPont (old)', 'NYSE:F': 'Ford', 'NYSE:PSA': 'Public Storage', 'dead:FOXA-old': '21st Century Fox', 'dead:EMC': 'EMC', 'NYSE:DUK': 'Duke Energy', 'NYSE:BNY': 'BNY Mellon', 'NASDAQ:KMB': 'Kimberly-Clark', 'NYSE:KMB': 'Kimberly-Clark',
  'dead:DWDP': 'DowDuPont', 'NASDAQ:PYPL': 'PayPal', 'NASDAQ:CME': 'CME Group', 'dead:VMW': 'VMware', 'NYSE:CCI': 'Crown Castle', 'NASDAQ:CSX': 'CSX', 'NYSE:FIS': 'Fidelity National Info. (FIS)', 'NYSE:EL': 'Estée Lauder', 'NYSE:ZTS': 'Zoetis', 'NYSE:KKR': 'KKR',
  'NASDAQ:BKNG': 'Booking Holdings', 'NYSE:CI': 'Cigna', 'NYSE:AMT': 'American Tower', 'NYSE:HON': 'Honeywell', 'NASDAQ:HON': 'Honeywell', 'NYSE:XOM': 'ExxonMobil', 'dead:AABA': 'Yahoo / Altaba',
}
const short = (name) => String(name)
  .replace(/\s*\((The|New)\)\s*/g, ' ')
  .replace(/,?\s+(Inc\.?|Incorporated|Corporation|Corp\.?|Company|Co\.?|plc\.?|Ltd\.?|Limited|Holdings?|Group|N\.V\.|S\.A\.|L\.P\.|Class [A-C])(?=$|[\s,])/gi, '')
  .replace(/\s{2,}/g, ' ').replace(/(\s+(and|&))+$/i, '').replace(/[,.\s&]+$/, '').trim()
const cos = keep.map((k) => {
  const c = byKey.get(k)
  return {
    n: ALIAS[c.key] ?? short(c.name),
    t: c.dead != null ? (c.key.replace(/^dead:/, '')) : c.key.split(':')[1],
    g: GROUP[c.sector] ?? 0,
    cap: POINTS.map((y) => (c.cap?.[y] > 0 ? Math.round(c.cap[y] / 1e7) / 100 : 0)),
    px: POINTS.map((y) => (c.dead == null && c.close?.[y] > 0 ? c.close[y] : 0)),
    dead: c.dead ?? null,
  }
})
const data = {
  asOf: D.asOf,
  points: POINTS,
  pointLabels: LABELS,
  cos,
  ranks: ranks.map((r) => r.slice(0, 100).map((c) => index.get(c.key))),
  keyIndex: Object.fromEntries(index),
  study,
  lit: research?.lit ?? null,
  research: research?.tech ?? null,
}
const tpl = fs.readFileSync('pages/caps.template.html', 'utf8')
fs.writeFileSync('caps.html', tpl.replace('/*DATA*/null', JSON.stringify(data).replace(/</g, '\\u003c')))
console.log(`caps.html: ${cos.length} companies, ${data.ranks[0].length}–${data.ranks.at(-1).length} ranked per point; study ${study ? 'yes' : 'no'}; research ${research ? 'yes' : 'no'}`)
