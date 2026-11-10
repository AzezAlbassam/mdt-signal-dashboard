import { E, load } from './lib.mjs'
for (const f of process.argv.slice(2)) {
  const d = load(f + '.json'); const funds = E.parseFundamentals(d.fin); const ttm = d.fq ? E.ttmFromQuarters(d.fq) : null
  console.log(d.sym, d.sector, 'FY:', funds.map((x) => `${x.year} eps ${x.eps} ni ${(x.ni / 1e6).toFixed(0)}M sh ${x.shares ? (x.shares / 1e6).toFixed(0) : '-'}M rev ${(x.rev / 1e6).toFixed(0)}M`).slice(-7).join(' | '))
  if (ttm) console.log('  TTM:', ttm.map((t) => `${t.label} eps ${t.eps?.toFixed(3)} ni ${(t.ni / 1e6).toFixed(0)}M sh ${t.eps && t.ni && Math.sign(t.eps) === Math.sign(t.ni) ? (t.ni / t.eps / 1e6).toFixed(0) : '-'}M`).join(' | '))
  const live = E.liveContext(funds, ttm, d.month, null)
  const fv = E.fairValuesAt(funds, d.closes, d.sector, d.month, live)
  console.log('  ', d.month, 'close', fv.close, fv.profile, JSON.stringify(fv.values, (k, v) => (typeof v === 'number' ? +v.toFixed(2) : v)))
  const rows = []
  for (let k = 59; k >= 0; k -= 3) { const mk = E.addMonths(d.month, -k); const st = live.state(mk); const c = d.closes.get(mk); if (st && c) rows.push(`${mk}:${st.period ?? 'FY' + st.fiscalYear} sh ${(st.shares / 1e6).toFixed(0)}M P/S ${(c / st.revPS).toFixed(1)}`) }
  console.log('  ', rows.join(' | '))
}
