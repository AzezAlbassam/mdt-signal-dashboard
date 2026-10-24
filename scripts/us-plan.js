// Print the universe symbols that still have no data file — what a resumed fetch must do.
//   node scripts/us-plan.js [batchSize]
import fs from 'node:fs'
const u = JSON.parse(fs.readFileSync('data/us/universe.json', 'utf8')).symbols
const dropped = fs.existsSync('data/us/dropped.json') ? JSON.parse(fs.readFileSync('data/us/dropped.json', 'utf8')) : {}
const missing = u.filter((x) => !fs.existsSync(`data/us/bars/${x.symbol.replace(':', '_')}.json.gz`) && !dropped[x.symbol])
console.log(`${u.length - missing.length} of ${u.length} done (${Object.keys(dropped).length} dropped), ${missing.length} missing`)
const n = Number(process.argv[2] || 0)
if (n) console.log(JSON.stringify(missing.slice(0, n).map((x) => x.symbol)))
