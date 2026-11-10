const fs = require('fs')
const { open } = require('./harness.cjs')
const gen = fs.readFileSync(__dirname + '/gen.js', 'utf8')
const real = JSON.parse(fs.readFileSync('/home/user/mdt-signal-dashboard/test/fixtures/snowflake-quotes.json', 'utf8')).data
const HCOLS = ['total_revenue_fq_h', 'net_income_fq_h', 'earnings_per_share_diluted_fq_h', 'total_revenue_fy_h', 'net_income_fy_h', 'earnings_per_share_diluted_fy_h', 'fiscal_period_end_fq', 'dps_common_stock_prim_issue_fy_h', 'total_assets_fy_h', 'total_debt_fy_h', 'free_cash_flow_fy_h', 'ebitda_fy_h']
const T = {}

// P1: earnings card counts days in UTC, the row chip in the viewer's calendar day.
T.days = async () => {
  const now = new Date('2026-11-10T22:30:00Z') // 01:30 on 11 Nov in Riyadh
  const { browser, page, settle } = await open({ now, seed: { arg: { gen }, fn: ({ gen }) => { eval(gen); const G = window.__gen; const s = 'NASDAQ:AAA'
    window.__store['lists/us'] = { symbols: [s] }; window.__mcp.quotes[s] = G.quote(s, { earnings_release_next_date: Date.UTC(2026, 10, 12, 21, 5) / 1000 }); window.__mcp.hist[s] = G.histRow(); window.__mcp.px[s] = G.px() } } })
  await page.clock.runFor(4000); await page.click('#rows tr.row td.c-stock span'); await page.clock.runFor(1500)
  console.log('days | row chip:', await page.$eval('#rows tr.row .c-exp', (e) => e.innerText.trim()), '| card:', await page.$eval('.ecard.next h4', (e) => e.innerText.trim()), '| card date:', await page.$eval('.ecard.next p', (e) => e.innerText.trim()))
  await browser.close()
}

// P2/P3/P4 on real rows (fixture of 2026-11-08): snowflake before/after the h/ doc, P/E in row vs card, EPS chart bases.
T.real = async () => {
  const { browser, page, settle } = await open({ now: new Date('2026-11-08T12:00:00Z'), seed: { arg: { gen, real, HCOLS }, fn: ({ gen, real, HCOLS }) => { eval(gen); const G = window.__gen
    const C = { revenue: 'total_revenue', net_income: 'net_income', eps: 'earnings_per_share_diluted', fcf: 'free_cash_flow', ebitda: 'ebitda', total_debt: 'total_debt', gross_profit: 'gross_profit' }
    const us = Object.keys(real).filter((s) => !s.startsWith('TADAWUL')); const sa = Object.keys(real).filter((s) => s.startsWith('TADAWUL'))
    window.__store['lists/us'] = { symbols: us }; window.__store['lists/sa'] = { symbols: sa }
    for (const [s, r] of Object.entries(real)) { window.__mcp.quotes[s] = { ...r, fiscal_period_fy: new Date(r.fiscal_period_end_fy * 1000).getUTCFullYear() }
      // HIST row: what the fixture has (revenue, net income, EPS, fcf, debt, ebitda fy); the rest null
      const h = { fiscal_period_fy: new Date(r.fiscal_period_end_fy * 1000).getUTCFullYear(), fiscal_period_end_fy: r.fiscal_period_end_fy, fiscal_period_end_fq: r.fiscal_period_end_fq }
      for (const c of Object.values(C)) for (const p of ['fy', 'fq']) h[`${c}_${p}_h`] = r[`${c}_${p}_h`] ?? null
      window.__mcp.hist[s] = { ...h, ...Object.fromEntries(HCOLS.map((k) => [k, r[k] ?? null])) }; window.__mcp.px[s] = G.px(Date.now()) }
  } } })
  await page.clock.runFor(5000)
  const snap = () => page.evaluate(() => Object.fromEntries(Object.entries(window.__t.state.snow).map(([s, v]) => [s, v && { total: v.total, D: v.axes.dividend.checks.map((c) => c.id + ':' + c.status[0]).join(' '), P: v.axes.past.checks.map((c) => c.id + ':' + c.status[0]).join(' '), H: v.axes.health.checks.map((c) => c.id + ':' + c.status[0]).join(' ') }])))
  const before = await snap()
  for (const tab of ['us', 'sa']) { await page.click('#tab-' + tab); await page.clock.runFor(3000)
    for (const sym of await page.$$eval('#rows tr.row', (t) => t.map((x) => x.dataset.sym))) {
      await page.click(`#rows tr.row[data-sym="${sym}"] td.c-stock span`); await page.clock.runFor(1500)
      const pe = await page.$eval(`#rows tr.row[data-sym="${sym}"] td[data-label="مكرر الربح P/E"]`, (e) => e.innerText)
      const stat = await page.$$eval('#rows tr.detail .stats .st', (e) => e.map((x) => x.innerText.replace(/\s+/g, ' ')).filter((x) => /P\/E|PEG/.test(x)).join(' ; '))
      const peg = await page.$eval(`#rows tr.row[data-sym="${sym}"] td[data-label="PEG"]`, (e) => e.innerText)
      await page.click('#rows tr.detail .qhead button[data-ev$="|m|eps"]').catch(() => {}); await page.clock.runFor(300)
      const chart = await page.$$eval('#rows tr.detail svg.qchart title', (t) => t.map((x) => x.textContent).filter((x) => /المتوقع|توقع/.test(x) || true).slice(-3).join(' ; ')).catch(() => '')
      const card = await page.$eval('#rows tr.detail .ecard.last', (e) => e.innerText.replace(/\s+/g, ' ')).catch(() => '')
      const v5 = await page.evaluate((s) => { const c = window.__t.state.snow[s]?.axes.value.checks.find((x) => x.id === 'V5'); return c && `${c.status} ${c.value}` }, sym)
      console.log(`real ${sym} | row P/E ${pe} | card stats: ${stat} | row PEG ${peg} | V5 ${v5}\n     last-quarter card: ${card}\n     eps chart tail: ${chart}`)
    } }
  const after = await snap()
  for (const s of Object.keys(after)) console.log(`snow ${s}: before open total ${before[s]?.total} [D ${before[s]?.D}] [P ${before[s]?.P}] [H ${before[s]?.H}]\n            after open total ${after[s]?.total} [D ${after[s]?.D}] [P ${after[s]?.P}] [H ${after[s]?.H}]`)
  await browser.close()
}

// P5: a fundamentals answer whose quarterly arrays are all null replaces good saved quarters.
T.clobber = async () => {
  const { browser, page, settle } = await open({ seed: { arg: { gen }, fn: ({ gen }) => { eval(gen); const G = window.__gen; const s = 'NASDAQ:AAA'; const S = window.__store
    S['lists/us'] = { symbols: [s] }
    S[`cache/${s}`] = { sym: s, fin: G.fin(), fyEnd: G.fyEnd, missing: false, fundsAt: Date.now() - 5 * 864e5, px: G.px(), pxAt: Date.now() - 864e5 }
    S[`q/${s}`] = { sym: s, fq: G.fq(), fqEnd: G.fqEnd - 92 * 86400, fetchedAt: 1 }
    window.__mcp.quotes[s] = G.quote(s)
    const r = G.histRow(); for (const k of Object.keys(r)) if (k.endsWith('_fq_h')) r[k] = r[k].map(() => null)
    window.__mcp.hist[s] = r; window.__mcp.px[s] = G.px(); window.__before = JSON.stringify(S[`q/${s}`].fq.series.revenue.slice(-2)) } } })
  const before = await page.evaluate(() => window.__before)
  await settle(2500)
  console.log('clobber | saved q before:', before, '| after:', await page.evaluate(() => JSON.stringify(window.__store['q/NASDAQ:AAA'].fq.series.revenue.slice(-2))), '| writes:', await page.evaluate(() => JSON.stringify(window.__writes)), '| period used:', await page.evaluate(() => window.__t.state.scores['NASDAQ:AAA']?.period ?? null), '| fqDue now:', await page.evaluate(() => window.__t.fqDue('NASDAQ:AAA')))
  await browser.close()
}

// P6: a stock without monthly prices: fair value from fewer methods, row not marked.
T.nopx = async () => {
  const { browser, page, settle } = await open({ seed: { arg: { gen }, fn: ({ gen }) => { eval(gen); const G = window.__gen; const S = window.__store
    S['lists/us'] = { symbols: ['NASDAQ:AAA', 'NASDAQ:BBB'] }
    for (const s of ['NASDAQ:AAA', 'NASDAQ:BBB']) { window.__mcp.quotes[s] = G.quote(s, { sector: 'Retail Trade', industry: 'Food Retail' }); window.__mcp.hist[s] = G.histRow() }
    window.__mcp.px['NASDAQ:AAA'] = G.px() } } })
  await settle(2500)
  console.log('nopx |', JSON.stringify(await page.$$eval('#rows tr.row', (t) => t.map((tr) => ({ sym: tr.dataset.sym, fair: tr.children[2].innerText, fairDim: tr.children[2].classList.contains('dim'), title: tr.children[2].title, up: tr.children[3].innerText, score: tr.children[4].innerText.trim() })))), JSON.stringify(await page.evaluate(() => Object.fromEntries(['NASDAQ:AAA', 'NASDAQ:BBB'].map((s) => [s, { coverage: window.__t.state.fair[s].coverage, A: window.__t.state.scores[s].parts.A, a1: window.__t.state.scores[s].detail.a1 }])))))
  await browser.close()
}

// P7: a compute() exception in one stock makes its whole quote batch count as failed.
T.poison = async () => {
  const { browser, page, settle } = await open({ seed: { arg: { gen }, fn: ({ gen }) => { eval(gen); const G = window.__gen; const S = window.__store
    const us = Array.from({ length: 60 }, (_, i) => `NASDAQ:U${String(i).padStart(2, '0')}`)
    S['lists/us'] = { symbols: us }
    for (const s of us) { window.__mcp.quotes[s] = G.quote(s); window.__mcp.hist[s] = G.histRow(); window.__mcp.px[s] = G.px(); S[`cache/${s}`] = { sym: s, fin: G.fin(), fyEnd: G.fyEnd, fundsAt: Date.now(), px: G.px(), pxAt: Date.now() }; S[`q/${s}`] = { sym: s, fq: G.fq(), fqEnd: G.fqEnd } }
    S['cache/NASDAQ:U03'].fin = { labels: ['2024', '2025'] } // a doc with labels but no series
  } } })
  await settle(3000)
  console.log('poison | notice:', await page.$eval('#notice', (n) => (n.hidden ? '' : n.textContent)), '| status:', await page.textContent('#status'), '| rows with a score:', await page.$$eval('#rows tr.row .score', (x) => x.length), 'of 60 | refresh disabled:', await page.$eval('#refresh', (b) => b.disabled))
  await browser.close()
}

// P8: reopening a stock: calls per open (news, history, guidance, elog).
T.reopen = async () => {
  const { browser, page, settle, count } = await open({ seed: { arg: { gen }, fn: ({ gen }) => { eval(gen); const G = window.__gen; const S = window.__store; const s = 'NASDAQ:AAA'
    S['lists/us'] = { symbols: [s] }; window.__mcp.quotes[s] = G.quote(s); window.__mcp.hist[s] = { ...G.histRow(), total_assets_fy_h: null }; window.__mcp.px[s] = G.px()
    window.__mcp.docs[s] = { items: [{ title: 'Q2 2026', reported: G.quote(s).earnings_release_date - 95 * 86400, views: [{ type: 'summary', id: 'v1' }] }] } // the newest summary is still last quarter's
    window.__mcp.views.v1 = { astDescription: { children: [{ type: 'p', children: [{ type: 'b', children: ['Outlook and guidance'] }] }, { type: 'p', children: [{ type: 'list', children: [{ type: '*', children: ['FY up 5%'] }] }] }] } } } } })
  await settle(2500)
  const c0 = await count()
  for (let i = 0; i < 3; i += 1) { await page.click('#rows tr.row td.c-stock span'); await page.waitForTimeout(600); await page.click('#rows tr.row td.c-stock span'); await page.waitForTimeout(200) }
  console.log('reopen | before', JSON.stringify(c0), '| after 3 opens', JSON.stringify(await count()), '| e doc:', await page.evaluate(() => JSON.stringify(window.__store['e/NASDAQ:AAA'])))
  await browser.close()
}

;(async () => { for (const k of process.argv.slice(2)) { try { await T[k]() } catch (e) { console.log(k, 'PROBE ERROR', e.message.slice(0, 300)) } } })()
