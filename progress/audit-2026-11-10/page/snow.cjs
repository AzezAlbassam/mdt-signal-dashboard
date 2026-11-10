// Snowflake total in the list before a stock was ever opened (no h/ doc) vs after, on the real rows of 2026-11-08; quotes carry COLS only, as in production.
const fs = require('fs')
const { open } = require('./harness.cjs')
const gen = fs.readFileSync(__dirname + '/gen.js', 'utf8')
const real = JSON.parse(fs.readFileSync('/home/user/mdt-signal-dashboard/test/fixtures/snowflake-quotes.json', 'utf8')).data
;(async () => {
  const { browser, page } = await open({ now: new Date('2026-11-08T12:00:00Z'), seed: { arg: { gen, real }, fn: ({ gen, real }) => { eval(gen); const G = window.__gen
    const C = ['total_revenue', 'net_income', 'earnings_per_share_diluted', 'free_cash_flow', 'ebitda', 'total_debt', 'gross_profit']
    const us = Object.keys(real).filter((s) => !s.startsWith('TADAWUL')); const sa = Object.keys(real).filter((s) => s.startsWith('TADAWUL'))
    window.__store['lists/us'] = { symbols: [...us, ...sa.map((s) => s.replace('TADAWUL', 'NYSE'))] }
    for (const [s0, r] of Object.entries(real)) { const s = s0.replace('TADAWUL', 'NYSE')
      const fy = new Date(r.fiscal_period_end_fy * 1000).getUTCFullYear()
      window.__mcp.quotes[s] = { ...Object.fromEntries(Object.entries(r).filter(([k]) => !k.endsWith('_h'))), fiscal_period_fy: fy }
      const h = { fiscal_period_fy: fy, fiscal_period_end_fy: r.fiscal_period_end_fy, fiscal_period_end_fq: r.fiscal_period_end_fq }
      for (const c of C) for (const p of ['fy', 'fq']) h[`${c}_${p}_h`] = r[`${c}_${p}_h`] ?? null
      for (const k of ['dps_common_stock_prim_issue_fy_h', 'total_assets_fy_h']) h[k] = r[k] ?? null
      window.__mcp.hist[s] = h; window.__mcp.px[s] = G.px(Date.now()) }
  } } })
  await page.clock.runFor(6000)
  const snap = () => page.evaluate(() => Object.fromEntries(Object.entries(window.__t.state.snow).map(([s, v]) => [s, v && { total: v.total, all: Object.values(v.axes).flatMap((a) => a.checks).map((c) => c.id + ':' + c.status[0]).join(' ') }])))
  const before = await snap()
  for (const sym of await page.$$eval('#rows tr.row', (t) => t.map((x) => x.dataset.sym))) { await page.click(`#rows tr.row[data-sym="${sym}"] td.c-stock span`); await page.clock.runFor(1500) }
  const after = await snap()
  for (const s of Object.keys(after)) { const b = before[s].all.split(' '); const a = after[s].all.split(' '); console.log(s, 'list total before open:', before[s].total, '→ after:', after[s].total, '| changed:', a.filter((x, i) => x !== b[i]).map((x, i) => `${b[a.indexOf(x)]}→${x}`).join(', ') || '-') }
  await browser.close()
})()
