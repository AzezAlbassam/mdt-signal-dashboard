import fs from 'node:fs'
export const R = '/home/user/mdt-signal-dashboard'
export const E = await import(`${R}/engine/fairvalue.js`)
export const SC = await import(`${R}/engine/score.js`)
const sectors = { ...JSON.parse(fs.readFileSync(`${R}/data/fv/sectors.json`)), ...JSON.parse(fs.readFileSync(`${R}/data/fv8/sectors.json`)) }
export const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null }
export function load(file) {
  const rd = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p)) : null)
  const fin = rd(`${R}/data/fv/raw/fin/${file}`) ?? rd(`${R}/data/fv8/raw/fin/${file}`)
  const px = rd(`${R}/data/fv/raw/px/${file}`) ?? rd(`${R}/data/fv8/raw/px/${file}`)
  const fq = rd(`${R}/data/fq/${file}`)
  if (!fin || !px) return null
  const sym = fin.symbol
  const closes = new Map()
  px.bars.t.forEach((t, i) => { if (Number.isFinite(px.bars.c[i])) closes.set(E.monthKey(t), px.bars.c[i]) })
  const month = E.monthKey(px.bars.t.at(-1))
  return { sym, fin, fq, closes, month, sector: sectors[sym]?.sector, industry: sectors[sym]?.industry, type: sectors[sym]?.type }
}
export const files = () => [...new Set([...fs.readdirSync(`${R}/data/fv/raw/fin`), ...fs.readdirSync(`${R}/data/fv8/raw/fin`)])]
