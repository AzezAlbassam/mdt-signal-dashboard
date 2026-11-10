// Audit-v28 browser-check harness (from progress/audit-2026-11-10/page): fake window.claude per db.d.ts (update needs an existing doc, merges nested objects) and a scriptable connector.
const { chromium } = require('playwright')
const path = require('path')
const os = require('os')
exports.PROBE = path.join(os.tmpdir(), 'stocks-v28-probe.html')
exports.open = async function open({ seed, tz = 'Asia/Riyadh', now = null, query = '' }) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: tz })
  const page = await ctx.newPage()
  const logs = []
  page.on('console', (m) => { if (m.type() === 'error') logs.push('console.error: ' + m.text()) })
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')))
  if (now) await page.clock.install({ time: now })
  await page.addInitScript(() => {
    const store = (window.__store = {})
    window.__calls = []
    window.__writes = []
    const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x)
    const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = isObj(v) && isObj(o[k]) ? merge(o[k], v) : v; return o }
    const listeners = {}
    const snapOf = (p) => ({ id: p.split('/').pop(), exists: p in store, data: () => store[p], metadata: { fromCache: false, hasPendingWrites: false } })
    const notify = (p) => (listeners[p] ?? []).forEach((f) => setTimeout(() => f(snapOf(p)), 0))
    const cmp = (a, op, b) => (op === '>' ? a > b : true)
    const query = (coll, o = {}) => ({
      orderBy: (f) => query(coll, { ...o, order: f }), limit: (n) => query(coll, { ...o, lim: n }), where: (f, op, v) => query(coll, { ...o, where: [f, op, v] }),
      get: async () => {
        if (window.__dbFail?.(coll)) throw { code: 'unavailable' }
        let docs = Object.keys(store).filter((k) => k.startsWith(coll + '/')).map(snapOf)
        if (o.where) docs = docs.filter((d) => cmp(d.data()?.[o.where[0]], o.where[1], o.where[2]))
        if (o.order) docs = docs.sort((a, b) => (a.data()[o.order] < b.data()[o.order] ? -1 : 1))
        if (o.lim != null) docs = docs.slice(0, o.lim)
        return { docs, size: docs.length, empty: !docs.length }
      },
      onSnapshot: (next) => { query(coll, o).get().then(next); return () => {} },
    })
    const db = {
      doc: (p) => ({
        get: async () => snapOf(p),
        set: async (d) => { window.__writes.push(['set', p, Object.keys(d)]); store[p] = JSON.parse(JSON.stringify(d)); notify(p) },
        update: async (d) => { if (!(p in store)) throw { code: 'invalid_argument', message: 'no such doc' }; window.__writes.push(['update', p, Object.keys(d)]); store[p] = merge(store[p], JSON.parse(JSON.stringify(d))); notify(p) },
        onSnapshot: (next) => { (listeners[p] ??= []).push(next); setTimeout(() => next(snapOf(p)), 5); return () => {} },
      }),
      collection: (c) => query(c),
    }
    window.__mcp = { quotes: {}, hist: {}, px: {}, docs: {}, views: {}, news: {}, hook: null }
    const M = window.__mcp
    const mcp = {
      callTool: async (server, tool, input, opts) => {
        const kind = tool.endsWith('batch') ? ((input.columns ?? []).includes('free_cash_flow_fq_h') ? 'funds' : (input.columns ?? []).includes('total_revenue_fq_h') ? 'hist' : 'quotes') : tool.replace('mcp-tv-', '')
        window.__calls.push({ kind, n: input.symbols?.length ?? 1, sym: input.symbol ?? input.symbols?.[0], count: input.count, t: Date.now() })
        const h = M.hook?.(kind, input)
        if (h !== undefined) { if (h?.__throw) throw h.__throw; return { payload: h } }
        if (kind === 'quotes') { const data = {}; const missing = []; for (const s of input.symbols) M.quotes[s] ? (data[s] = M.quotes[s]) : missing.push({ symbol: s }); return { payload: { data, missing, success: true } } }
        if (kind === 'funds' || kind === 'hist') { const data = {}; const missing = []; for (const s of input.symbols) M.hist[s] ? (data[s] = M.hist[s]) : missing.push({ symbol: s }); return { payload: { data, missing, success: true } } }
        if (kind === 'get-ohlcv') { const b = M.px[input.symbol]; const n = input.count; return { payload: { bars: b ? { t: b.t.slice(-n), c: b.c.slice(-n) } : { t: [], c: [] } } } }
        if (kind === 'get-news') return { payload: { data: { headlines: M.news[input.symbol] ?? [] } } }
        if (kind === 'get-documents') return { payload: M.docs[input.symbol] ?? { items: [] } }
        if (kind === 'get-document-view') return { payload: M.views[input.view_id] ?? {} }
        if (kind === 'search-symbols') return { payload: { data: { symbols: [] } } }
        throw { code: 'tool_error', message: 'unhandled ' + tool }
      },
    }
    window.claude = { use: async (n) => (n === 'db' ? (window.__noDb ? null : db) : n === 'mcp' ? mcp : null) }
  })
  if (seed) await page.addInitScript(seed.fn, seed.arg)
  await page.goto('file://' + exports.PROBE + query)
  const settle = async (ms = 600) => { for (let i = 0; i < 80; i += 1) { await page.waitForTimeout(ms / 4); const s = await page.textContent('#status'); if (/آخر تحديث/.test(s) || s === '') break } await page.waitForTimeout(150) }
  const count = () => page.evaluate(() => { const o = {}; for (const c of window.__calls) o[c.kind] = (o[c.kind] ?? 0) + 1; o.total = window.__calls.length; return o })
  return { browser, page, logs, settle, count }
}
