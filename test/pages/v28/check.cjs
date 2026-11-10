// Browser checks for the v28 fixes (progress/AUDIT-PLAN.md Phase 1), manual like the other page checks:
//   NODE_PATH=$(npm root -g) node test/pages/v28/check.cjs [name …]
// Builds the page with its internals exposed (build-probe.mjs), loads it in headless Chromium with a
// fake window.claude (harness.cjs) seeded per case from gen.js, and asserts what the page computes.
// Prints one line per case and exits 1 if any fails.
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { open } = require('./harness.cjs')

const b = spawnSync(process.execPath, [path.join(__dirname, 'build-probe.mjs')], { encoding: 'utf8' })
if (b.status !== 0) { console.error(b.stderr); process.exit(1) }
const gen = fs.readFileSync(path.join(__dirname, 'gen.js'), 'utf8')
const S = 'NASDAQ:AAA'

// Seeds one stock (lists, favourites, saved fundamentals and prices, TradingView's answers); `edit`
// is a function source run in the page after the defaults, with G (gen), S (store), M (connector), s.
const seedFn = ({ gen, edit, s }) => {
  eval(gen)
  const G = window.__gen; const St = window.__store; const M = window.__mcp
  St['lists/us'] = { symbols: [s] }; St['meta/favorites'] = { symbols: [s] }
  St['cache/' + s] = { sym: s, fin: G.fin(), fyEnd: G.fyEnd, missing: false, fundsAt: Date.now() - 9 * 864e5, px: G.px(), pxTried: true, pxAt: Date.now() - 8 * 864e5, extra: {} }
  St['q/' + s] = { sym: s, fq: G.fq(), fqEnd: G.fqEnd }
  M.quotes[s] = G.quote(s, { sector: 'Retail Trade', industry: 'Food Retail' })
  M.px[s] = G.px(); M.hist[s] = G.histRow()
  if (edit) (0, eval)(`(${edit})`)(G, St, M, s)
}
const read = (page, s = S) => page.evaluate((s) => {
  const t = window.__t; const f = t.state.fair[s]
  return { close: t.state.quotes[s]?.close, fair: f?.fair, upside: t.upside(s), values: f?.values, dropped: f?.dropped, coverage: f?.coverage,
    score: t.state.scores[s]?.total, weak: t.weakFair(s), err: t.state.errors[s], dcf: f?.dcf, rebase: t.state.cache[s]?.rebase }
}, s)
async function run(edit, after) {
  const o = await open({ seed: { fn: seedFn, arg: { gen, edit: edit && edit.toString(), s: S } } })
  try {
    await o.settle(3000); await o.page.waitForTimeout(800)
    return await after(o)
  } finally { await o.browser.close() }
}
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a / b - 1) <= tol

const CASES = {
  // 1.1: a 10-for-1 split after the docs were saved: prices come back restated, so the fundamentals are
  // asked again at once and fair ÷ price is the same as without the split.
  async split() {
    const base = await run(null, ({ page }) => read(page))
    const r = await run((G, St, M, s) => {
      const k = 10
      Object.assign(M.quotes[s], { close: 100 / k, price_52_week_high: 130 / k, price_52_week_low: 70 / k, total_shares_outstanding: 1e9 * k, earnings_per_share_diluted_ttm: 4 / k, earnings_per_share_fy: 4.2 / k, earnings_per_share_forecast_next_fy: 5 / k, price_target_1y: 120 / k })
      const px = G.px(); M.px[s] = { t: px.t, c: px.c.map((c) => c / k) }
      const h = G.histRow(); for (const key of Object.keys(h)) if (key.startsWith('earnings_per_share')) h[key] = h[key].map((v) => v / k); M.hist[s] = h
    }, async ({ page, count }) => ({ ...(await read(page)), calls: await count() }))
    const ok = near(r.upside + 1, base.upside + 1, 0.01) && r.calls.funds === 1 && r.rebase === false
    return [ok, `upside ${(100 * base.upside).toFixed(1)}% → after split ${(100 * r.upside).toFixed(1)}%, fundamentals calls ${r.calls.funds}, rebase ${r.rebase}`]
  },
  // 1.5: the daily quota already spent (the batch tool's success:false path): the saved quotes are shown,
  // dated, and the notice names the quota.
  async quota() {
    const r = await run((G, St, M, s) => {
      St['qsnap/b00'] = { rows: { x: { sym: s, at: Date.now() - 2 * 864e5, row: M.quotes[s] } } }
      M.hook = () => ({ success: false, error: 'HTTP 429 daily quota exceeded' })
    }, async ({ page }) => ({ ...(await read(page)), notice: await page.$eval('#notice', (n) => (n.hidden ? '' : n.textContent)),
      price: await page.$eval('#rows tr.row', (tr) => tr.children[1].innerText) }))
    const ok = r.close === 100 && r.fair > 0 && /حد TradingView/.test(r.notice) && /محفوظة من/.test(r.notice) && /محفوظ/.test(r.price)
    return [ok, `price cell "${r.price.replace(/\s+/g, ' ')}", fair ${r.fair?.toFixed(2)}, notice "${r.notice.slice(0, 90)}…"`]
  },
  // 1.5: a batch that answered for one market only: the other market's stock is reported and filled from
  // its saved quote, not left a skeleton.
  async partial() {
    const r = await run((G, St, M, s) => {
      const t = 'TADAWUL:2222'
      St['meta/favorites'] = { symbols: [s, t] }
      M.quotes[t] = G.quote(t, { sector: 'Energy Minerals', industry: 'Integrated Oil' })
      St['cache/' + t] = { sym: t, fin: G.fin(), fyEnd: G.fyEnd, fundsAt: Date.now(), px: G.px(), pxAt: Date.now() }; St['q/' + t] = { sym: t, fq: G.fq(), fqEnd: G.fqEnd }
      St['qsnap/b01'] = { rows: { y: { sym: t, at: Date.now() - 864e5, row: M.quotes[t] } } }
      M.hook = (kind, input) => (kind === 'quotes' && input.symbols.includes(t) ? { success: true, partial: true, warnings: ['saudi_arabia: 429'], data: { [s]: M.quotes[s] }, missing: [] } : undefined)
    }, async ({ page }) => {
      await page.click('#tab-fav'); await page.waitForTimeout(1500)
      return { notice: await page.$eval('#notice', (n) => (n.hidden ? '' : n.textContent)), rows: await page.$$eval('#rows tr.row', (t) => t.map((tr) => [tr.dataset.sym, tr.children[1].innerHTML.includes('skel') ? 'SKELETON' : tr.children[1].innerText.replace(/\s+/g, ' ')])) }
    })
    const sa = r.rows.find(([sym]) => sym === 'TADAWUL:2222')
    const ok = !!sa && !/SKELETON/.test(sa[1]) && /محفوظ/.test(sa[1]) && /1 سهم/.test(r.notice)
    return [ok, `rows ${JSON.stringify(r.rows)}, notice "${r.notice.slice(0, 80)}…"`]
  },
  // 1.5: one malformed saved doc fails only its own stock.
  async poison() {
    const r = await run((G, St, M, s) => {
      const us = Array.from({ length: 12 }, (_, i) => `NASDAQ:U${String(i).padStart(2, '0')}`)
      St['lists/us'] = { symbols: us }; St['meta/favorites'] = { symbols: [] }
      for (const u of us) { M.quotes[u] = G.quote(u); M.hist[u] = G.histRow(); M.px[u] = G.px(); St['cache/' + u] = { sym: u, fin: G.fin(), fyEnd: G.fyEnd, fundsAt: Date.now(), px: G.px(), pxAt: Date.now() }; St['q/' + u] = { sym: u, fq: G.fq(), fqEnd: G.fqEnd } }
      St['cache/NASDAQ:U03'].fin = { labels: ['2024', '2025'] }
    }, async ({ page }) => ({ scored: await page.$$eval('#rows tr.row .score', (x) => x.length), notice: await page.$eval('#notice', (n) => (n.hidden ? '' : n.textContent)), err: await page.evaluate(() => window.__t.state.errors['NASDAQ:U03']) }))
    const ok = r.scored === 11 && !/TradingView/.test(r.notice) && /ما قدرت أحسب/.test(r.err ?? '')
    return [ok, `${r.scored} of 12 scored, U03: "${r.err}", notice "${r.notice}"`]
  },
  // 1.5: an empty first fundamentals answer is asked again after 3 days.
  async missing() {
    const r = await run((G, St, M, s) => {
      St['cache/' + s] = { sym: s, missing: true, fyEnd: G.fyEnd, fundsAt: Date.now() - 4 * 864e5, px: G.px(), pxTried: true, pxAt: Date.now() }
    }, async ({ page, count }) => ({ ...(await read(page)), calls: await count() }))
    const ok = r.calls.funds === 1 && r.fair > 0
    return [ok, `fundamentals calls ${r.calls.funds}, fair ${r.fair?.toFixed(2)}`]
  },
  // 1.5: quarterly arrays that come back all null do not overwrite the saved quarters.
  async clobber() {
    const r = await run((G, St, M, s) => {
      St['q/' + s] = { sym: s, fq: G.fq(), fqEnd: G.fqEnd - 92 * 86400, fetchedAt: 1 }
      const h = G.histRow(); for (const k of Object.keys(h)) if (k.endsWith('_fq_h')) h[k] = h[k].map(() => null)
      M.hist[s] = h
    }, async ({ page, count }) => ({ rev: await page.evaluate((s) => window.__store['q/' + s].fq?.series?.revenue?.at(-1)?.value ?? null, S), calls: await count() }))
    const ok = r.rev > 0 && r.calls.funds === 1
    return [ok, `fundamentals calls ${r.calls.funds}, saved last quarter's revenue ${r.rev}`]
  },
  // 1.8: the snowflake total is the same before and after the stock is first opened (its dividend and asset
  // histories now come with the fundamentals, asked once for docs saved without them).
  async snow() {
    const r = await run((G, St, M, s) => {
      Object.assign(M.quotes[s], { dividends_yield: 3.5, dividend_payout_ratio_ttm: 50 })
      delete St['cache/' + s].extra // saved before v28
      const h = G.histRow({ dps_common_stock_prim_issue_fy_h: Array.from({ length: 16 }, (_, i) => 2 * 0.95 ** i), total_assets_fy_h: Array.from({ length: 16 }, () => 5e10) })
      M.hist[s] = h
    }, async ({ page, count }) => {
      const before = await page.evaluate((s) => window.__t.state.snow[s]?.total, S)
      const calls = await count()
      await page.click('#rows tr.row'); await page.waitForTimeout(1500)
      const after = await page.evaluate((s) => window.__t.state.snow[s]?.total, S)
      return { before, after, calls }
    })
    const ok = r.before != null && r.before === r.after && r.calls.funds === 1
    return [ok, `snowflake total before opening ${r.before}, after ${r.after}; fundamentals calls ${r.calls.funds}`]
  },
  // Monthly fair-value log: this month's first fair value and price are written once to the stock's bucket;
  // other months and other stocks' entries in the bucket stay.
  async fvlog() {
    const r = await run((G, St, M, s) => {
      const b = 'b' + String([...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 32).padStart(2, '0')
      const mk = 'm' + new Date().toISOString().slice(0, 7).replace('-', '_')
      St['fvlog/' + b] = { m2026_10: { NASDAQ_AAA: { sym: s, fair: 1, close: 1 } }, [mk]: { NYSE_ZZZ: { sym: 'NYSE:ZZZ', fair: 2, close: 2 } } }
      window.__fv = { b, mk }
    }, async ({ page }) => {
      await page.waitForTimeout(5000)
      return page.evaluate(() => {
        const { b, mk } = window.__fv; const d = window.__store['fvlog/' + b]
        return { doc: d, mk, writes: window.__writes.filter((w) => w[1].startsWith('fvlog/')).length, fair: window.__t.state.fair['NASDAQ:AAA']?.fair }
      })
    })
    const e = r.doc?.[r.mk]?.NASDAQ_AAA
    const ok = r.writes === 1 && e && near(e.fair, r.fair, 1e-5) && e.close === 100 && r.doc.m2026_10?.NASDAQ_AAA?.fair === 1 && r.doc[r.mk].NYSE_ZZZ?.fair === 2
    return [ok, `writes ${r.writes}, this month ${JSON.stringify(e)}, kept ${JSON.stringify(Object.keys(r.doc?.[r.mk] ?? {}))} and ${Object.keys(r.doc ?? {}).join(', ')}`]
  },
  // v30 (audit 3.1, 3.2): a long list draws 60 rows and more on request; a star patches its row only; an open
  // panel is not rebuilt by its loaders (news, history, earnings log, guidance).
  async list() {
    const r = await run((G, St, M, s) => {
      const us = Array.from({ length: 130 }, (_, i) => `NASDAQ:L${String(i).padStart(3, '0')}`)
      St['lists/us'] = { symbols: us }; St['meta/favorites'] = { symbols: [] }
      for (const u of us) { M.quotes[u] = G.quote(u); M.hist[u] = G.histRow(); M.px[u] = G.px(); St['cache/' + u] = { sym: u, fin: G.fin(), fyEnd: G.fyEnd, fundsAt: Date.now(), px: G.px(), pxAt: Date.now(), extra: {} }; St['q/' + u] = { sym: u, fq: G.fq(), fqEnd: G.fqEnd } }
    }, async ({ page }) => {
      const out = {}
      out.first = await page.$$eval('#rows tr.row', (x) => x.length)
      await page.click('#rows button[data-more]'); await page.waitForTimeout(300)
      out.more = await page.$$eval('#rows tr.row', (x) => x.length)
      await page.evaluate(() => { window.__rebuilds = 0; new MutationObserver((ms) => { for (const m of ms) if (m.removedNodes.length > 1) window.__rebuilds += 1 }).observe(document.getElementById('rows'), { childList: true }) })
      await page.click('#rows tr.row[data-sym="NASDAQ:L005"] button[data-star]'); await page.waitForTimeout(400)
      out.starRebuilds = await page.evaluate(() => window.__rebuilds)
      await page.click('#rows tr.row[data-sym="NASDAQ:L001"]'); await page.waitForTimeout(150)
      await page.evaluate(() => { window.__panel = 0; const d = document.querySelector('#rows tr.detail'); new MutationObserver((ms) => { for (const m of ms) if ([...m.removedNodes].some((n) => n.nodeType === 1 && (n.matches?.('.dgrid') || n.parentElement === null && n.tagName === 'TD'))) window.__panel += 1 }).observe(d, { childList: true }) })
      await page.waitForTimeout(2500)
      out.panelRebuilds = await page.evaluate(() => window.__panel)
      out.bar = await page.$$eval('#rows tr.detail .pbar button[data-close]', (x) => x.length)
      await page.click('#rows button[data-all]'); await page.waitForTimeout(400)
      out.all = await page.$$eval('#rows tr.row', (x) => x.length)
      return out
    })
    const ok = r.first === 60 && r.more === 120 && r.starRebuilds === 0 && r.panelRebuilds === 0 && r.bar === 1 && r.all === 130
    return [ok, JSON.stringify(r)]
  },
  // v31 (additions 2–5): a report in 3 days is in the strip; the panel shows the 52-week and target bars; a log
  // entry from 12 months ago gives "قبل سنة قلنا …" with its verdict.
  async v31() {
    const r = await run((G, St, M, s) => {
      Object.assign(M.quotes[s], { earnings_release_next_date: Math.floor(Date.now() / 1000) + 3 * 86400, earnings_per_share_forecast_next_fq: 1.1, revenue_forecast_next_fq: 2.6e10,
        price_52_week_low: 70, price_52_week_high: 130, price_target_low: 90, price_target_1y: 115, price_target_high: 140, recommendation_total: 12 })
      const b = 'b' + String([...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 32).padStart(2, '0')
      const d = new Date(); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() - 12)
      St['fvlog/' + b] = { ['m' + d.toISOString().slice(0, 7).replace('-', '_')]: { NASDAQ_AAA: { sym: s, fair: 120, close: 80, day: d.toISOString().slice(0, 10), weak: false } } }
    }, async ({ page }) => {
      const soon = await page.evaluate(() => ({ hidden: document.getElementById('soon').hidden, items: document.querySelectorAll('#soonList li').length, text: document.getElementById('soonList').textContent.replace(/\s+/g, ' ') }))
      await page.click('#rows tr.row'); await page.waitForTimeout(1200)
      const panel = await page.evaluate(() => { const d = document.querySelector('#rows tr.detail'); return { bars: d.querySelectorAll('.part.range .rbar').length, analysts: /12 محلل/.test(d.innerText), track: d.querySelector('.part.track')?.innerText.replace(/\s+/g, ' ') ?? '' } })
      return { soon, panel }
    })
    const ok = !r.soon.hidden && r.soon.items === 1 && /بعد 3 أيام/.test(r.soon.text) && r.panel.bars === 2 && r.panel.analysts && /قبل سنة/.test(r.panel.track) && /مشى صوب القيمة/.test(r.panel.track)
    return [ok, JSON.stringify(r).slice(0, 600)]
  },
}

;(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CASES)
  let failed = 0
  for (const n of names) {
    try {
      const [ok, msg] = await CASES[n]()
      if (!ok) failed += 1
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}: ${msg}`)
    } catch (e) { failed += 1; console.log(`FAIL ${n}: ${e.stack || e}`) }
  }
  console.log(failed ? `${failed} failed` : 'all ok')
  process.exit(failed ? 1 : 0)
})()
