// Study 17: S&P ticker → company (data/caps/tickers.json) from the ticker map the research agents
// produced (data/caps/map.json), plus addendum 1's identity cases. Dead companies point at their
// id in data/caps/dead.json; ones never researched (below the threshold) are skipped on purpose.
//   node scripts/caps-tickers.js
import fs from 'node:fs'

const map = JSON.parse(fs.readFileSync('data/caps/map.json', 'utf8'))
const dead = fs.existsSync('data/caps/dead.json') ? JSON.parse(fs.readFileSync('data/caps/dead.json', 'utf8')) : {}
const out = {}
for (const x of map.items) {
  if (x.currentSymbol && ['alive_same_ticker', 'alive_renamed', 'spinoff_new'].includes(x.status)) out[x.ticker] = [{ symbol: x.currentSymbol }]
  else if (dead[x.ticker]) out[x.ticker] = [{ dead: x.ticker }]
  else out[x.ticker] = [{ skip: `${x.status}, peak ~$${x.peakYearEndCapBn ?? '?'}B, not researched (below the threshold)` }]
}
// Same company, two S&P tickers for one data row
out.DISCK = [{ skip: 'second class of DISCA' }]
out.UA = [{ symbol: 'NYSE:UA' }]
// Addendum 1 identity cases: the S&P ticker belonged to another company before these dates
Object.assign(out, {
  DD: [{ until: '2017-08-31', dead: 'DD-old' }, { from: '2019-06-03', symbol: 'NYSE:DD' }],
  DWDP: [{ dead: 'DWDP' }],
  DOW: [{ until: '2017-08-31', dead: 'DOW-old' }, { from: '2019-04-02', symbol: 'NYSE:DOW' }],
  FOXA: [{ until: '2019-03-18', dead: 'FOXA-old' }, { from: '2019-03-19', symbol: 'NASDAQ:FOXA' }],
  FOX: [{ until: '2019-03-18', dead: 'FOXA-old' }, { from: '2019-03-19', symbol: 'NASDAQ:FOX' }],
  // below the top-100 band (addendum 2): left out like any other company of that size
  SNDK: [{ until: '2016-05-12', skip: 'old SanDisk, ~$15B, below the top-100 band (addendum 2)' }, { from: '2025-01-01', symbol: 'NASDAQ:SNDK' }],
  KDP: [{ until: '2018-07-08', skip: 'Dr Pepper Snapple, ~$17B, below the top-100 band (addendum 2)' }, { from: '2018-07-09', symbol: 'NASDAQ:KDP' }],
  SE: [{ until: '2017-02-27', skip: 'Spectra Energy, ~$25B, below the top-100 band (addendum 2)' }],
  // old Ingersoll-Rand plc is today's Trane Technologies (NYSE:TT); NYSE:IR is the former Gardner Denver
  IR: [{ until: '2020-03-01', symbol: 'NYSE:TT' }, { from: '2020-03-02', symbol: 'NYSE:IR' }],
  TE: [{ until: '2016-07-01', skip: 'TECO Energy, ~$6B, acquired by Emera 2016' }],
})
fs.writeFileSync('data/caps/tickers.json', JSON.stringify(out, null, 1))
console.log(`tickers: ${Object.keys(out).length} (${Object.values(out).flat().filter((e) => e.dead).length} dead links, ${Object.values(out).flat().filter((e) => e.skip).length} skipped)`)
