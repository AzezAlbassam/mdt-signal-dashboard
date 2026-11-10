// Measurement harness for the stock page (manual, not part of npm test):
//   node test/pages/measure.cjs <stocks.html> <snapshotDir> <outJson>
// Loads the page in headless Chromium with a fake db seeded from a saved db snapshot (every
// <dir>/<doc>.json under snapshotDir, optionally wrapped in {data: …}) and a fake TradingView
// connector: quote batches from <snapshotDir>/quotes.json (only the requested columns), history
// batches (*_h columns) answered as missing so saved figures are used, monthly prices from the
// saved px, financial-history as tool_error, news empty. Measures every tab at 1280/768/390, opens
// every stock in the US, SA and favourites tabs, runs the existing checks, and writes
// { scorecard, perStock, issues, tabs, meta } to outJson.
const { chromium } = require('playwright')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const [htmlPath, snapDir, outPath] = process.argv.slice(2)
if (!outPath) { console.error('usage: node test/pages/measure.cjs <stocks.html> <snapshotDir> <outJson>'); process.exit(2) }
const REPO = path.join(__dirname, '../..')
const ORIGIN = 'http://measure.local'
const WIDTHS = [1280, 768, 390]
const TABS = [['us', 'السوق الأمريكي'], ['sa', 'السوق السعودي'], ['big', 'أكبر 25 شركة'], ['fav', 'المفضلة'], ['sectors', 'القطاعات']]
const TARGET = { usRowsMs: 1500, openMs: 150 }
const started = Date.now()

// ---------------------------------------------------------------- snapshot
const unwrap = (j) => (j && typeof j.data === 'object' && j.data && !Array.isArray(j.data) && !j.sym && !j.symbols ? j.data : j)
const store = {}
for (const dir of fs.readdirSync(snapDir)) {
  const d = path.join(snapDir, dir)
  if (!fs.statSync(d).isDirectory()) continue
  for (const f of fs.readdirSync(d)) if (f.endsWith('.json')) store[`${dir}/${f.slice(0, -5)}`] = unwrap(JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')))
}
const quotes = JSON.parse(fs.readFileSync(path.join(snapDir, 'quotes.json'), 'utf8'))
const html = fs.readFileSync(htmlPath, 'utf8')
const lists = { us: store['lists/us']?.symbols ?? [], sa: store['lists/sa']?.symbols ?? [], fav: store['meta/favorites']?.symbols ?? [] }
const bigSrc = /const BIG = (\[[\s\S]*?\])/.exec(html)?.[1]
const BIG = bigSrc ? JSON.parse(bigSrc.replace(/'/g, '"')) : []
const expectRows = { us: lists.us.length, sa: lists.sa.length, fav: lists.fav.length, big: Math.min(25, BIG.length || 25) }
const listStocks = [...new Set([...lists.us, ...lists.sa])]
const missingQuotes = [...new Set([...listStocks, ...BIG, ...lists.fav])].filter((s) => !quotes[s])
const page0 = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`
const storeJson = JSON.stringify(store)
const quotesJson = JSON.stringify(quotes)

// The page's web fonts, fetched once with curl into a cache and served locally, so the layout is
// measured with the fonts users get (fallback fonts when they cannot be fetched; meta.fonts says which).
function webFonts() {
  const href = /href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, '&')
  if (!href) return null
  const dir = path.join(os.tmpdir(), 'measure-fonts', require('crypto').createHash('md5').update(href).digest('hex').slice(0, 12))
  const cssFile = path.join(dir, 'fonts.css')
  if (fs.existsSync(cssFile)) return { css: fs.readFileSync(cssFile, 'utf8'), dir }
  fs.mkdirSync(dir, { recursive: true })
  const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
  const get = (u, f) => spawnSync('curl', ['-sSf', '-m', '30', '-A', UA, '-o', f, u]).status === 0
  if (!get(href, path.join(dir, 'raw.css'))) return null
  const css = fs.readFileSync(path.join(dir, 'raw.css'), 'utf8')
  const RX = /https:\/\/fonts\.gstatic\.com\/[^)\s]+/g
  const local = (u) => u.slice('https://fonts.gstatic.com/'.length).replace(/[^\w.-]/g, '_')
  if (![...new Set(css.match(RX) ?? [])].every((u) => get(u, path.join(dir, local(u))))) return null
  const out = css.replace(RX, (u) => `${ORIGIN}/__fonts/${local(u)}`)
  fs.writeFileSync(cssFile, out)
  return { css: out, dir }
}
const fonts = webFonts()

// ---------------------------------------------------------------- in-page fakes and probes
// ponytail: db and connector answer at once (no simulated latency), so speed is the page's own
// compute and render time; collection listeners fire once (the page never writes a listened collection).
function fake(ORIGIN) {
  const ready = Promise.all([fetch(`${ORIGIN}/__store.json`).then((r) => r.json()), fetch(`${ORIGIN}/__quotes.json`).then((r) => r.json())])
  let store = {}
  let quotes = {}
  const loaded = ready.then(([s, q]) => { store = s; quotes = q })
  window.__calls = []
  const listeners = {}
  const snapOf = (p) => ({ id: p.split('/').pop(), exists: p in store, data: () => store[p], metadata: { fromCache: false, hasPendingWrites: false } })
  const cmp = (a, op, b) => (op === '>' ? a > b : op === '>=' ? a >= b : op === '<' ? a < b : op === '<=' ? a <= b : op === '==' ? a === b : true)
  const query = (coll, o = {}) => ({
    orderBy: (f) => query(coll, { ...o, order: f }),
    limit: (n) => query(coll, { ...o, lim: n }),
    where: (f, op, v) => query(coll, { ...o, where: [f, op, v] }),
    get: async () => {
      await loaded
      let docs = Object.keys(store).filter((k) => k.startsWith(coll + '/') && !k.slice(coll.length + 1).includes('/')).map(snapOf)
      if (o.where) docs = docs.filter((d) => cmp(d.data()?.[o.where[0]], o.where[1], o.where[2]))
      if (o.order) docs = docs.filter((d) => d.data()?.[o.order] != null).sort((a, b) => (a.data()[o.order] < b.data()[o.order] ? -1 : a.data()[o.order] > b.data()[o.order] ? 1 : 0))
      if (o.lim != null) docs = docs.slice(0, o.lim)
      return { docs, size: docs.length, empty: !docs.length }
    },
    onSnapshot: (next, err) => { let live = true; query(coll, o).get().then((s) => live && next(s), (e) => err?.(e)); return () => { live = false } },
  })
  const notify = (p) => (listeners[p] ?? []).forEach((f) => setTimeout(() => f(snapOf(p)), 0))
  const db = {
    doc: (p) => ({
      get: async () => { await loaded; return snapOf(p) },
      set: async (d) => { await loaded; store[p] = d; notify(p) },
      update: async (d) => { await loaded; if (!(p in store)) throw { code: 'invalid_argument', message: 'no such doc' }; store[p] = { ...store[p], ...d }; notify(p) },
      onSnapshot: (next) => { (listeners[p] ??= []).push(next); loaded.then(() => next(snapOf(p))); return () => { listeners[p] = listeners[p].filter((f) => f !== next) } },
    }),
    collection: (c) => query(c),
  }
  const pick = (row, cols) => Object.fromEntries(cols.map((c) => [c, c in row ? row[c] : null]))
  const mcp = {
    callTool: async (server, tool, input) => {
      await loaded
      window.__calls.push({ tool, n: input.symbols?.length ?? 1, h: (input.columns ?? []).some((c) => c.endsWith('_h')), at: performance.now() })
      if (tool.endsWith('symbol-data-batch')) {
        const cols = input.columns ?? []
        if (cols.some((c) => c.endsWith('_h'))) return { payload: { count: 0, data: {}, missing: input.symbols.map((symbol) => ({ symbol, reason: 'history not served by the measurement harness' })), missing_count: input.symbols.length, success: true } }
        const data = {}
        const missing = []
        for (const s of input.symbols) quotes[s] ? (data[s] = pick(quotes[s], cols)) : missing.push({ symbol: s, reason: 'not in quotes.json' })
        return { payload: { count: Object.keys(data).length, data, missing, missing_count: missing.length, success: true } }
      }
      if (tool.endsWith('get-ohlcv')) {
        const px = store[`cache/${input.symbol}`]?.px
        const n = input.count ?? 252
        return { payload: { bars: px?.t ? { t: px.t.slice(-n), c: px.c.slice(-n) } : { t: [], c: [] } } }
      }
      if (tool.endsWith('financial-history')) throw { code: 'tool_error', message: 'financial history not served by the measurement harness' }
      if (tool.endsWith('get-news')) return { payload: { data: { headlines: [] } } }
      throw { code: 'tool_error', message: `not served by the measurement harness: ${tool}` }
    },
  }
  window.claude = { use: async (n) => (n === 'db' ? db : n === 'mcp' ? mcp : null) }

  // Every change of the status line, timed (a refresh ends with "آخر تحديث").
  window.__status = []
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.getElementById('status')
    if (s) new MutationObserver(() => window.__status.push({ t: performance.now(), text: s.textContent })).observe(s, { childList: true, characterData: true, subtree: true })
  })

  const t = (el) => (el?.innerText ?? '').replace(/\s+/g, ' ').trim()
  const titles = (el) => (el ? [el, ...el.querySelectorAll('[title]')].map((e) => e.getAttribute?.('title') ?? '').filter(Boolean).join(' | ') : '')
  // Tokens that should never reach the screen.
  const RX = [['NaN', /NaN/g], ['undefined', /undefined/g], ['Infinity', /Infinity/g], ['null', /\bnull\b/g], ['[object', /\[object/g],
    ['+-', /\+\s*[-−]|[-−]\s*\+/g], ['doubled sign', /\+\+|--|−−/g], ['negative zero', /(?<![\d.])[-−]0(?:\.0+)?(?![.\d])/g], ['—×', /—\s*×/g]]
  function garbage(text, where) {
    const out = []
    const ctx = (i) => text.slice(Math.max(0, i - 18), i + 18)
    for (const [token, rx] of RX) for (const m of text.matchAll(rx)) out.push({ token, where, ctx: ctx(m.index) })
    for (let i = text.indexOf('%'); i >= 0; i = text.indexOf('%', i + 1)) { // % with no number before it
      let j = i - 1
      while (j >= 0 && /\s/.test(text[j])) j -= 1
      if (!/[\d]/.test(text[j] ?? '')) out.push({ token: text[j] === '—' ? '—%' : '% without number', where, ctx: ctx(i) })
    }
    return out
  }
  // Elements wider than their parent or the viewport, or clipping their own content. Inside a
  // horizontal scroller only the parent and clip tests apply; a scroller that scrolls is listed
  // (and counts as overflow when strict, i.e. on a desktop width). Descendants of a flagged element are not listed again.
  function overflow(roots, strict) {
    const vw = document.documentElement.clientWidth
    const out = []
    const scrollers = []
    const name = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.classList.length ? '.' + [...el.classList].join('.') : ''}`
    const symOf = (el) => { const r = el.closest('tr.row') ?? el.closest('tr.detail')?.previousElementSibling; return r?.dataset?.sym ?? null }
    const walk = (el, inScroll, flagged, inScroller) => {
      const cs = getComputedStyle(el)
      if (cs.display === 'none') return
      const ox = cs.overflowX
      const scroller = ox === 'auto' || ox === 'scroll'
      let bad = false
      if (!flagged && el.getClientRects().length && cs.position !== 'absolute' && cs.position !== 'fixed') {
        const r = el.getBoundingClientRect()
        // a scroller's own children may run past it (that is what it scrolls)
        const p = el.parentElement && !inScroller && getComputedStyle(el.parentElement).display !== 'contents' ? el.parentElement.getBoundingClientRect() : null
        const why = []
        if (!inScroll && r.width > 0 && (r.right > vw + 1 || r.left < -1)) why.push('viewport')
        if (p && r.width > 0 && (r.right > p.right + 1 || r.left < p.left - 1)) why.push('parent')
        if ((ox === 'hidden' || ox === 'clip') && el.tagName !== 'svg' && el.scrollWidth > el.clientWidth + 1) why.push('clipped')
        if (scroller && el.scrollWidth > el.clientWidth + 1) { scrollers.push({ el: name(el), scroll: el.scrollWidth, client: el.clientWidth }); if (strict) why.push('scrolls') }
        if (why.length) { bad = true; out.push({ el: name(el), why, sym: symOf(el), w: Math.round(r.width), pw: p ? Math.round(p.width) : null, vw, text: t(el).slice(0, 60) }) }
      }
      if (el.tagName === 'svg') return
      for (const c of el.children) walk(c, inScroll || scroller, flagged || bad, scroller)
    }
    roots.filter(Boolean).forEach((r) => walk(r, false, false, false))
    return { doc: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 ? document.documentElement.scrollWidth : null, offenders: out, scrollers }
  }
  function read(sym) {
    const row = document.querySelector(`#rows tr.row[data-sym="${CSS.escape(sym)}"]`)
    if (!row) return null
    const td = row.children
    const cells = { price: t(td[1]), fair: t(td[2]), fairLabel: td[2]?.dataset.label ?? null, fairWeak: !!td[2]?.classList.contains('dim'), upside: t(td[3]), score: t(td[4]),
      scored: !!td[4]?.querySelector('.score .big'), exp: t(td[5]), pe: t(td[8]), fpe: t(td[9]), peg: t(td[10]), svr: t(td[11]), altman: t(td[12]) }
    const det = row.nextElementSibling?.matches('tr.detail') ? row.nextElementSibling : null
    let fair = null
    let parts = []
    let ctx = []
    let blocks = []
    let note = null
    if (det) {
      const fb = [...det.querySelectorAll('.dgrid > .part')].find((p) => /^(القيمة العادلة|أرضية الكاش)/.test(t(p.querySelector(':scope > h3 > span'))))
      if (fb) {
        const h = fb.querySelectorAll(':scope > h3 > span')
        const title = t(h[0])
        const txt = t(fb)
        fair = { title, profile: title.split(' · ')[1] ?? null, head: t(h[1]), coverage: /تغطية البيانات\s*(\d+)%/.exec(txt)?.[1] ?? null,
          range: /أقل وأعلى تقييم:\s*([^،]+?)،/.exec(txt)?.[1] ?? null,
          methods: [...fb.querySelectorAll('.fair-list > div')].map((d) => { const n = t(d.children[0]); const m = /^(.*) · (\d+)%$/.exec(n); return { name: m ? m[1] : n, weight: m ? Number(m[2]) / 100 : 0, value: t(d.children[1]), used: !d.classList.contains('off') } }),
          rdcf: fb.querySelector('.rdcf') ? t(fb.querySelector('.rdcf p')) : null }
      }
      parts = [...det.querySelectorAll('.part')].filter((p) => p.querySelector(':scope > h3 .sw')).map((p) => { const s = p.querySelectorAll(':scope > h3 > span'); return { name: t(s[0]), value: t(s[1]) } })
      ctx = [...det.querySelectorAll('.ctx > details')].map((d) => ({ name: t(d.querySelector('summary > span')), value: t(d.querySelector('summary > b')) }))
      blocks = [...det.querySelectorAll('.dgrid > .part')].map((p) => t(p.querySelector(':scope > h3 > span, :scope > summary > span')))
      note = t(det.querySelector(':scope > td > p.dim')) || null
    }
    const cellsText = [...td].filter((x) => !x.classList.contains('c-del')).map(t).join(' ') // not the delete button's ×
    const g = [...garbage(cellsText, 'row'), ...garbage(titles(row), 'row title'), ...(det ? [...garbage(t(det), 'detail'), ...garbage(titles(det), 'detail title')] : [])]
    return { cells, fair, parts, ctx, blocks, note, garbage: g, detailChars: det ? t(det).length : 0 }
  }
  // Open one stock (the click renders synchronously), time it, wait until nothing in the panel is
  // still loading, read it, and close it again.
  async function openRead(sym, check390) {
    const sel = `#rows tr.row[data-sym="${CSS.escape(sym)}"]`
    const row = document.querySelector(sel)
    if (!row) return { absent: true }
    const t0 = performance.now()
    row.click()
    const syncMs = performance.now() - t0
    void document.body.offsetHeight
    const layoutMs = performance.now() - t0
    await new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 0)))
    const openMs = performance.now() - t0
    let settleMs = null
    while (performance.now() - t0 < 3000) {
      const d = document.querySelector(sel)?.nextElementSibling
      // the page's loading lines ("جاري جلب الأخبار…"); a bare جاري also matches تجارية
      if (d?.matches('tr.detail') && !/(^|\s)جاري (جلب|تحميل|قراءة|تحديث)/.test(d.innerText)) { settleMs = performance.now() - t0; break }
      await new Promise((ok) => setTimeout(ok, 20))
    }
    await new Promise((ok) => setTimeout(ok, 30)) // late renders (prices, histories) land
    const r = read(sym)
    const ov = check390 ? overflow([document.querySelector(sel), document.querySelector(sel)?.nextElementSibling], false) : null
    const open = document.querySelector(sel)
    if (open?.getAttribute('aria-expanded') === 'true') open.click()
    return { syncMs, layoutMs, openMs, settleMs, ...r, overflow: ov }
  }
  window.__measure = { overflow, garbage, read, openRead, text: t }
}

// ---------------------------------------------------------------- browser
const logs = []
let phase = 'start'
const blocked = new Set()
async function open(browser, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
  await ctx.route('**/*', (route) => {
    const u = route.request().url()
    if (u === `${ORIGIN}/stocks.html`) return route.fulfill({ body: page0, contentType: 'text/html; charset=utf-8' })
    if (u === `${ORIGIN}/__store.json`) return route.fulfill({ body: storeJson, contentType: 'application/json' })
    if (u === `${ORIGIN}/__quotes.json`) return route.fulfill({ body: quotesJson, contentType: 'application/json' })
    if (u.startsWith(`${ORIGIN}/__fonts/`) && fonts) return route.fulfill({ path: path.join(fonts.dir, u.slice(`${ORIGIN}/__fonts/`.length)), contentType: 'font/woff2' })
    if (u.startsWith('https://fonts.googleapis.com/')) return route.fulfill({ body: fonts?.css ?? '', contentType: 'text/css' })
    blocked.add(u.split('?')[0])
    return route.abort()
  })
  await ctx.addInitScript(fake, ORIGIN)
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push({ phase, type: m.type(), text: m.text().slice(0, 300) }) })
  page.on('pageerror', (e) => logs.push({ phase, type: 'pageerror', text: String(e.message).slice(0, 300) }))
  return { ctx, page }
}

// Rows of a tab are ready when every visible row is drawn and none still shows a loading skeleton.
async function waitTab(page, tab, t0) {
  const r = { tab }
  const pred = (tab) => {
    if (tab === 'sectors') return document.querySelectorAll('#sectorsView .sec').length > 0 && performance.now()
    const n = document.querySelectorAll('#rows tr.row').length
    const want = Number(/يظهر (\d+)/.exec(document.getElementById('shown')?.textContent ?? '')?.[1] ?? -1)
    return n > 0 && n === want && !document.querySelector('#rows .skel') && performance.now()
  }
  try { r.rowsMs = Math.round((await (await page.waitForFunction(pred, tab, { polling: 'raf', timeout: 30000 })).jsonValue()) - t0) } catch { r.rowsMs = null }
  if (tab !== 'sectors') {
    try {
      r.settledMs = Math.round((await (await page.waitForFunction((t0) => window.__status.find((s) => s.t > t0 && /آخر تحديث/.test(s.text))?.t, t0, { polling: 100, timeout: 30000 })).jsonValue()) - t0)
    } catch { r.settledMs = null }
  }
  Object.assign(r, await page.evaluate(() => ({ rows: document.querySelectorAll('#rows tr.row').length, skeletons: [...document.querySelectorAll('#rows tr.row')].filter((x) => x.querySelector('.skel')).map((x) => x.dataset.sym),
    sectors: document.querySelectorAll('#sectorsView .sec').length, status: document.getElementById('status').textContent, notice: document.getElementById('notice').hidden ? null : document.getElementById('notice').textContent })))
  return r
}
const clickTab = (page, tab) => page.evaluate((id) => { const t = performance.now(); document.getElementById(id).click(); return t }, `tab-${tab}`)
const visibleSyms = (page) => page.$$eval('#rows tr.row', (rs) => rs.map((r) => r.dataset.sym))
const spread = (xs, n) => (xs.length <= n ? xs : Array.from({ length: n }, (_, i) => xs[Math.floor((i * xs.length) / n)]))

;(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch())
  const tabs = []
  const perStock = {}
  const pageGarbage = []
  for (const s of listStocks) perStock[s] = { market: s.startsWith('TADAWUL:') ? 'sa' : 'us', fav: lists.fav.includes(s), quote: !!quotes[s] }
  for (const width of WIDTHS) {
    const { ctx, page } = await open(browser, width)
    phase = `load@${width}`
    await page.goto(`${ORIGIN}/stocks.html`, { waitUntil: 'commit' }) // poll from the start, not after the load event
    for (const [tab, label] of TABS) {
      phase = `tab:${tab}@${width}`
      const t0 = tab === 'us' ? 0 : await clickTab(page, tab)
      const r = await waitTab(page, tab, t0)
      r.label = label
      r.width = width
      r.expected = expectRows[tab] ?? null
      r.overflow = await page.evaluate(async (strict) => { await document.fonts.ready; return window.__measure.overflow([document.body], strict) }, width >= 1024)
      if (tab === 'us' && width === 1280) r.calls = await page.evaluate(() => window.__calls.reduce((a, c) => { const k = c.tool.replace('mcp-tv-', '') + (c.h ? ' (history)' : ''); a[k] = (a[k] ?? 0) + 1; return a }, {}))
      if (width === 1280) pageGarbage.push(...await page.evaluate((tab) => ['#status', '#notice', '#shown', '#latestIdeas', '#sectorsView', '.about', '.tabs']
        .flatMap((s) => [...document.querySelectorAll(s)].filter((e) => !e.hidden).flatMap((e) => window.__measure.garbage(window.__measure.text(e), `${tab} ${s}`))), tab))
      tabs.push(r)
      console.log(`tab ${tab}@${width}: rows ${r.rows ?? r.sectors}/${r.expected ?? '-'} in ${r.rowsMs} ms, settled ${r.settledMs ?? '-'} ms, overflow ${r.overflow.doc ? 'doc ' + r.overflow.doc : 'none'} + ${r.overflow.offenders.length} el`)
    }
    if (width === 1280) {
      // Every stock's detail, tab by tab; the favourites tab is compared with the market tab.
      for (const tab of ['us', 'sa', 'fav']) {
        phase = `tab:${tab}@1280-details`
        await waitTab(page, tab, await clickTab(page, tab))
        const syms = await visibleSyms(page)
        let i = 0
        for (const sym of syms) {
          phase = `detail:${tab}:${sym}`
          const before = logs.length
          let r
          try { r = await page.evaluate(([sym]) => window.__measure.openRead(sym, false), [sym]) } catch (e) { r = { failed: String(e.message).slice(0, 200) } }
          const errs = logs.slice(before).filter((l) => l.type !== 'warning')
          const ps = (perStock[sym] ??= { market: sym.startsWith('TADAWUL:') ? 'sa' : 'us', fav: lists.fav.includes(sym), quote: !!quotes[sym] })
          if (tab === 'fav') {
            const base = ps.row
            const diff = base && r.cells ? Object.keys(base).filter((k) => base[k] !== r.cells[k]).map((k) => ({ field: k, market: base[k], fav: r.cells[k] })) : null
            if (r.fair?.head !== ps.fair?.head) (diff ?? []).push({ field: 'fair box', market: ps.fair?.head ?? null, fav: r.fair?.head ?? null })
            ps.favTab = { openMs: r.openMs, diff, garbage: r.garbage ?? [], errors: errs }
          } else {
            Object.assign(ps, { tab, row: r.cells ?? null, fair: r.fair ?? null, parts: r.parts ?? [], ctx: r.ctx ?? [], blocks: r.blocks ?? [], note: r.note ?? null, garbage: r.garbage ?? [],
              errors: errs, syncMs: r.syncMs, layoutMs: r.layoutMs, openMs: r.openMs, settleMs: r.settleMs, stuck: r.settleMs == null && !r.absent, absent: !!r.absent, failed: r.failed ?? null })
          }
          if (++i % 100 === 0) console.log(`  details ${tab}: ${i}/${syms.length}`)
        }
        console.log(`details ${tab}: ${syms.length} opened`)
      }
    }
    if (width === 390) {
      // A sample of 60 details on a phone: 30 favourites and 30 Saudi stocks, evenly spread.
      for (const tab of ['fav', 'sa']) {
        phase = `tab:${tab}@390-details`
        await waitTab(page, tab, await clickTab(page, tab))
        for (const sym of spread(await visibleSyms(page), 30)) {
          phase = `detail390:${tab}:${sym}`
          let r
          try { r = await page.evaluate(([sym]) => window.__measure.openRead(sym, true), [sym]) } catch (e) { r = { failed: String(e.message).slice(0, 200), overflow: null } }
          const ps = (perStock[sym] ??= { market: sym.startsWith('TADAWUL:') ? 'sa' : 'us', fav: lists.fav.includes(sym), quote: !!quotes[sym] })
          ps.at390 = { tab, openMs: r.openMs, docOverflow: r.overflow?.doc ?? null, offenders: r.overflow?.offenders ?? null, scrollers: r.overflow?.scrollers ?? [], failed: r.failed ?? null }
        }
        console.log(`details ${tab}@390: sampled`)
      }
    }
    await ctx.close()
  }
  await browser.close()
  const browserSeconds = (Date.now() - started) / 1000

  // ---------------------------------------------------------------- safety: npm test and the existing checks, on this html
  phase = 'safety'
  const safety = {}
  const run = (cmd, args, cwd) => { const t = Date.now(); const p = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 300000, env: process.env }); return { status: p.status, out: `${p.stdout ?? ''}${p.stderr ?? ''}`, s: (Date.now() - t) / 1000 } }
  const npm = run('npm', ['test'], REPO)
  safety.npmTest = { pass: npm.status === 0, seconds: npm.s, tail: npm.status === 0 ? undefined : npm.out.slice(-800) }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'measure-safety-'))
  fs.mkdirSync(path.join(tmp, 'pages'))
  fs.copyFileSync(htmlPath, path.join(tmp, 'pages/stocks.html'))
  fs.cpSync(__dirname, path.join(tmp, 'test/pages'), { recursive: true })
  fs.symlinkSync(path.join(REPO, 'data'), path.join(tmp, 'data'))
  const browserCheck = run(process.execPath, [path.join(tmp, 'test/pages/stocks-browser-check.cjs')], tmp)
  for (const k of ['WIPE', 'FETCH', 'NODB']) { const m = new RegExp(`^${k} CHECK: (\\S+)(.*)$`, 'm').exec(browserCheck.out); safety[k] = { pass: m?.[1] === 'ok', seconds: browserCheck.s, line: m ? m[0].slice(0, 300) : 'no result line' } }
  const mu = run(process.execPath, [path.join(tmp, 'test/pages/mu-fair-check.cjs')], tmp)
  const mm = /^MU CHECK: (\S+)(.*)$/m.exec(mu.out)
  safety.MU = { pass: mm?.[1] === 'ok', seconds: mu.s, line: mm ? mm[0].slice(0, 300) : 'no result line' }
  fs.rmSync(tmp, { recursive: true, force: true })

  // ---------------------------------------------------------------- data coverage (from the snapshot)
  const finite = (xs) => (xs ?? []).filter((x) => Number.isFinite(typeof x === 'object' && x ? x.value : x)).length
  for (const s of listStocks) {
    const ps = perStock[s]
    ps.savedQuarters = finite(store[`q/${s}`]?.fq?.series?.revenue)
    ps.savedMonths = finite(store[`cache/${s}`]?.px?.c)
  }

  // ---------------------------------------------------------------- scorecard
  const num = (x) => { const m = /[-+−]?\d+(?:\.\d+)?/.exec(String(x ?? '').replace(/,/g, '').replace('−', '-')); return m ? Number(m[0]) : null }
  const share = (xs, f) => ({ have: xs.filter(f).length, of: xs.length })
  const pctOf = (p) => (p.of ? (100 * p.have) / p.of : 100)
  const L = listStocks.map((s) => perStock[s])
  const fairApplicable = L.filter((p) => p.row && p.row.fairLabel !== 'أرضية الكاش')
  const cov = { score: share(L, (p) => p.row?.scored), fair: share(fairApplicable, (p) => num(p.row.fair) != null), quarters4: share(L, (p) => p.savedQuarters >= 4), months60: share(L, (p) => p.savedMonths >= 60) }
  const coverage = Object.values(cov).reduce((a, p) => a + pctOf(p), 0) / 4

  const stockErr = (p) => (p.errors ?? []).length + (p.favTab?.errors ?? []).length
  const hits = (p) => new Set([...(p.garbage ?? []), ...(p.favTab?.garbage ?? [])].map((g) => `${g.token}|${g.where}`)).size
  const globalErrs = logs.filter((l) => l.type !== 'warning' && !/^detail/.test(l.phase)).length
  const robustness = Math.max(0, L.reduce((a, p) => a + Math.max(0, 100 - 20 * hits(p) - 50 * stockErr(p)), 0) / (L.length || 1) - Math.min(20, 5 * globalErrs) - Math.min(10, 2 * pageGarbage.length))

  const tabPass = tabs.filter((r) => !r.overflow.doc && !r.overflow.offenders.length).length
  const sampled = Object.values(perStock).filter((p) => p.at390)
  const detailPass = sampled.filter((p) => !p.at390.failed && !p.at390.docOverflow && !(p.at390.offenders ?? [1]).length).length
  const layout = 100 * (0.5 * (tabPass / tabs.length) + 0.5 * (sampled.length ? detailPass / sampled.length : 0))

  const q = (xs, f) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : null }
  const opens = L.map((p) => p.openMs)
  const usRowsMs = tabs.find((r) => r.tab === 'us' && r.width === 1280)?.rowsMs
  const openMedian = q(opens, 0.5)
  const speed = 50 * (usRowsMs ? Math.min(1, TARGET.usRowsMs / usRowsMs) : 0) + 50 * (openMedian ? Math.min(1, TARGET.openMs / openMedian) : 0)

  const checks = ['npmTest', 'WIPE', 'FETCH', 'NODB', 'MU']
  const safetyScore = (100 * checks.filter((k) => safety[k]?.pass).length) / checks.length
  const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10)

  const scorecard = {
    coverage: { score: r1(coverage), formula: 'mean of 4 shares ×100 over list stocks (lists/us ∪ lists/sa): row shows a score; row shows a fair value (stocks whose cell is a cash floor, "أرضية الكاش", excluded); ≥4 saved quarters of revenue (q/<sym>.fq); ≥60 saved monthly closes (cache/<sym>.px)', parts: cov },
    robustness: { score: r1(robustness), formula: 'mean over list stocks of max(0, 100 − 20 × distinct (garbage token, place) pairs in its row/panel/titles in either tab − 50 × console errors or page errors while it was open), minus min(20, 5 × console/page errors outside detail opens), minus min(10, 2 × garbage tokens in page-level text). Garbage: NaN, undefined, Infinity, null, [object, —%, —×, % with no number, +-, doubled signs, negative zero.',
      stocksWithGarbage: L.filter((p) => hits(p)).length, stocksWithErrors: L.filter((p) => stockErr(p)).length, globalErrors: globalErrs, pageGarbage: pageGarbage.length },
    layout: { score: r1(layout), formula: '100 × (½ × share of tab×width checks with no overflow + ½ × share of sampled 390px details with no overflow). Overflow: document wider than viewport, or an element wider than its parent or the viewport, or clipping its content; at widths ≥1024 a horizontal scroller that scrolls also counts.',
      tabWidthPass: `${tabPass}/${tabs.length}`, detailPass: `${detailPass}/${sampled.length}` },
    speed: { score: r1(speed), formula: `50 × min(1, ${TARGET.usRowsMs} ms ÷ US tab load-to-rows at 1280) + 50 × min(1, ${TARGET.openMs} ms ÷ median detail open, click to next frame). Fake db and connector answer at once, so this is the page's own work.`,
      usRowsMs, detailOpenMedianMs: r1(openMedian), detailOpenP90Ms: r1(q(opens, 0.9)), detailSettleMedianMs: r1(q(L.map((p) => p.settleMs), 0.5)), targets: TARGET },
    safety: { score: r1(safetyScore), formula: '100 × share passing of: npm test; WIPE, FETCH, NODB CHECK (stocks-browser-check.cjs); MU CHECK (mu-fair-check.cjs) — the checks run on this html', checks: safety },
    accuracy: null,
  }

  // ---------------------------------------------------------------- issues
  const issues = []
  const add = (kind, severity, summary, extra = {}) => issues.push({ kind, severity, summary, ...extra })
  for (const r of tabs) {
    if (r.expected != null && r.rows !== r.expected) add('rows', 'high', `${r.tab}@${r.width}: ${r.rows} rows, expected ${r.expected}`)
    if (r.rowsMs == null) add('rows', 'high', `${r.tab}@${r.width}: rows never ready (${r.skeletons?.length ?? 0} rows stuck on a skeleton)`, { syms: r.skeletons?.slice(0, 50) })
    if (r.overflow.doc) add('layout', 'medium', `${r.tab}@${r.width}: page ${r.overflow.doc}px wide in a ${r.width}px window`)
    if (r.overflow.offenders.length) add('layout', 'medium', `${r.tab}@${r.width}: ${r.overflow.offenders.length} elements overflow`, { examples: r.overflow.offenders.slice(0, 8) })
    if (r.notice) add('notice', 'low', `${r.tab}@${r.width}: notice shown: ${r.notice.slice(0, 160)}`)
  }
  const byMsg = {}
  for (const l of logs) { const k = `${l.type}: ${l.text}`; (byMsg[k] ??= []).push(l.phase) }
  for (const [k, ph] of Object.entries(byMsg)) add('console', /^(error|pageerror)/.test(k) ? 'high' : 'low', `${k} (×${ph.length})`, { phases: [...new Set(ph)].slice(0, 20) })
  const byToken = {}
  for (const s of listStocks) for (const g of [...(perStock[s].garbage ?? []), ...(perStock[s].favTab?.garbage ?? [])]) (byToken[`${g.token} in ${g.where}`] ??= []).push({ sym: s, ctx: g.ctx })
  for (const [k, xs] of Object.entries(byToken)) add('garbage', 'medium', `${k}: ${new Set(xs.map((x) => x.sym)).size} stocks`, { examples: xs.slice(0, 8) })
  for (const g of pageGarbage) add('garbage', 'low', `${g.token} in ${g.where}`, { ctx: g.ctx })
  const stuck = L.filter((p) => p.stuck)
  if (stuck.length) add('detail', 'medium', `${stuck.length} details still loading after 3 s`, { syms: listStocks.filter((s) => perStock[s].stuck).slice(0, 30) })
  const absent = listStocks.filter((s) => perStock[s].absent || !perStock[s].row)
  if (absent.length) add('detail', 'high', `${absent.length} list stocks had no row to open`, { syms: absent.slice(0, 30) })
  const favDiff = listStocks.filter((s) => perStock[s].favTab?.diff?.length)
  if (favDiff.length) add('consistency', 'medium', `${favDiff.length} stocks show different numbers in the favourites tab than in their market tab`, { examples: favDiff.slice(0, 10).map((s) => ({ sym: s, diff: perStock[s].favTab.diff })) })
  const noScore = {}
  for (const s of listStocks) { const p = perStock[s]; if (p.row && !p.row.scored) (noScore[p.row.score || '(empty)'] ??= []).push(s) }
  for (const [why, ss] of Object.entries(noScore)) add('coverage', 'low', `no score (${ss.length}): ${why.slice(0, 120)}`, { syms: ss.slice(0, 30) })
  const noFair = fairApplicable.filter((p) => num(p.row.fair) == null)
  if (noFair.length) add('coverage', 'low', `${noFair.length} stocks show no fair value`, { syms: listStocks.filter((s) => fairApplicable.includes(perStock[s]) && num(perStock[s].row.fair) == null).slice(0, 40) })
  for (const [k, p] of [['quarters4', 'fewer than 4 saved quarters'], ['months60', 'fewer than 60 saved months of prices']]) if (cov[k].have < cov[k].of) add('coverage', 'low', `${cov[k].of - cov[k].have} stocks with ${p}`)
  const lay390 = sampled.filter((p) => p.at390.docOverflow || p.at390.offenders?.length)
  if (lay390.length) add('layout', 'medium', `${lay390.length}/${sampled.length} sampled details overflow at 390px`, { examples: Object.entries(perStock).filter(([, p]) => p.at390 && (p.at390.docOverflow || p.at390.offenders?.length)).slice(0, 8).map(([s, p]) => ({ sym: s, doc: p.at390.docOverflow, offenders: p.at390.offenders?.slice(0, 4) })) })
  const slow = listStocks.filter((s) => perStock[s].openMs > TARGET.openMs).sort((a, b) => perStock[b].openMs - perStock[a].openMs)
  if (slow.length) add('speed', 'medium', `${slow.length} detail opens slower than ${TARGET.openMs} ms`, { slowest: slow.slice(0, 10).map((s) => ({ sym: s, ms: Math.round(perStock[s].openMs) })) })
  if (usRowsMs > TARGET.usRowsMs) add('speed', 'medium', `US tab rows after ${usRowsMs} ms (target ${TARGET.usRowsMs})`)
  for (const k of checks) if (!safety[k]?.pass) add('safety', 'high', `${k} failed: ${safety[k]?.line ?? safety[k]?.tail ?? ''}`.slice(0, 300))
  if (missingQuotes.length) add('quotes', 'medium', `${missingQuotes.length} symbols without a quote row`, { syms: missingQuotes })
  const rank = { high: 0, medium: 1, low: 2 }
  issues.sort((a, b) => rank[a.severity] - rank[b.severity])

  const runSeconds = Math.round((Date.now() - started) / 100) / 10
  const out = { scorecard, perStock, issues, tabs, meta: { html: path.resolve(htmlPath), snapshot: path.resolve(snapDir), at: new Date().toISOString(), runSeconds, browserSeconds, stocks: listStocks.length, quotes: Object.keys(quotes).length, missingQuotes, fonts: fonts ? `page fonts, cached in ${fonts.dir}` : 'fallback (web fonts could not be fetched)', blockedRequests: [...blocked], logs: logs.length } }
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(out, null, 1))
  console.log('\nSCORECARD')
  for (const [k, v] of Object.entries(scorecard)) console.log(`  ${k.padEnd(11)} ${v == null ? 'null (auditor)' : String(v.score).padStart(5)}`)
  console.log(`\nTOP ISSUES`)
  for (const i of issues.slice(0, 15)) console.log(`  [${i.severity}] ${i.kind}: ${i.summary}`)
  console.log(`\n${outPath} · ${runSeconds} s`)
})().catch((e) => { console.error(e); process.exit(1) })
