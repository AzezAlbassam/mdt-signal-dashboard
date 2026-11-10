import fs from 'node:fs'
import { R, E } from './lib.mjs'
const rd = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p)) : null)
for (const s of ['TADAWUL_1120', 'TADAWUL_2222', 'TADAWUL_1180', 'TADAWUL_2380', 'TADAWUL_1820', 'TADAWUL_4190']) {
  const fin = rd(`${R}/data/fv-sa/raw/fin/${s}.json`) ?? rd(`${R}/data/sa-all/raw/fin/${s}.json`); const px = rd(`${R}/data/fv-sa/raw/px/${s}.json`) ?? rd(`${R}/data/sa-all/raw/px/${s}.json`)
  if (!fin || !px) { console.log(s, 'missing', !!fin, !!px); continue }
  const funds = E.parseFundamentals(fin); const closes = new Map(); px.bars.t.forEach((t, i) => closes.set(E.monthKey(t), px.bars.c[i]))
  console.log(s, funds.slice(-8).map((f) => `${f.year}: eps ${f.eps} sh ${(f.shares / 1e9).toFixed(2)}B Dec close ${closes.get(f.year + '-12') ?? '-'} → cap ${f.shares && closes.get(f.year + '-12') ? (f.shares * closes.get(f.year + '-12') / 1e9).toFixed(0) + 'B' : '-'}`).join(' | '))
}
