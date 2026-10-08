// Render us.html (Arabic): study 4's confirmed strategies and study 2's robust rules, each
// with one winning and one losing example trade drawn as a chart. Examples follow the
// fixed rule of PROTOCOL-addendum-1.md §B (most recent completed win and loss in Period II
// on the first of NVDA, AAPL, MSFT, AMZN, META, GOOGL, TSLA, SPY that has both).
//
//   node scripts/study4-page.js   (SWING_ARTIFACT=<path> also writes the artifact body)

import fs from 'node:fs'
import zlib from 'node:zlib'

import * as I from '../engine/indicators.js'
import * as J from '../engine/indicators2.js'
import { toWeekly, signals, tradeFrom, tradesFor, TRACKS, COST } from '../engine/swing.js'
import { events4, outcomes4, SETTINGS } from '../engine/study4.js'

const SPLIT = '2018-01-01'
const CUTOFF = '2026-10-06'
const EXAMPLE_ORDER = ['NASDAQ:NVDA', 'NASDAQ:AAPL', 'NASDAQ:MSFT', 'NASDAQ:AMZN', 'NASDAQ:META', 'NASDAQ:GOOGL', 'NASDAQ:TSLA', 'AMEX:SPY']
const bars = (sym) => JSON.parse(zlib.gunzipSync(fs.readFileSync(`data/us/bars/${sym.replace(':', '_')}.json.gz`)).toString('utf8'))
const series = (sym, tf) => (tf === 'daily' ? bars(sym) : toWeekly({ ...bars(sym), group: 'us' }, CUTOFF))

const confirm = JSON.parse(fs.readFileSync('reports/study4-confirm.json', 'utf8')).rows
const usRes = JSON.parse(fs.readFileSync('reports/us-results.json', 'utf8'))
const universe = JSON.parse(fs.readFileSync('data/us/universe.json', 'utf8')).symbols
const watch = JSON.parse(fs.readFileSync('data/us/watchlist.json', 'utf8')).tickers

// ── strategies on the page ────────────────────────────────────────────────────

const S4 = [
  { key: 'weekly|rsi2|E2|F1', name: 'ارتداد RSI 2', tv: 'Relative Strength Index — الطول 2', rule: 'RSI(2) ينزل تحت 10 والسعر فوق متوسط 40 أسبوعاً', panel: 'rsi2' },
  { key: 'weekly|down3|E2|F1', name: 'ثلاثة إغلاقات هابطة', tv: 'لا يحتاج مؤشراً: ثلاث شموع أسبوعية كل إغلاق أقل من الذي قبله', rule: 'ثالث إغلاق أسبوعي هابط على التوالي، والسعر فوق متوسط 40 أسبوعاً', panel: null },
  { key: 'weekly|double7|E2|F1', name: 'أدنى إغلاق لـ 7 أسابيع', tv: 'لا يحتاج مؤشراً: الإغلاق أقل من إغلاقات آخر 7 أسابيع', rule: 'الإغلاق هو الأدنى في 7 أسابيع، والسعر فوق متوسط 40 أسبوعاً', panel: null },
  { key: 'weekly|pullback5|E2|F1', name: 'أدنى إغلاق لـ 5 أسابيع', tv: 'لا يحتاج مؤشراً: الإغلاق أقل من إغلاقات آخر 5 أسابيع', rule: 'الإغلاق هو الأدنى في 5 أسابيع، والسعر فوق متوسط 40 أسبوعاً', panel: null },
  { key: 'weekly|vixfix|E2|F1', name: 'Williams Vix Fix', tv: 'سكربت مجتمعي مشهور: CM_Williams_Vix_Fix', rule: 'مؤشر Vix Fix يلمس حده العلوي (خوف مرتفع)، والسعر فوق متوسط 40 أسبوعاً', panel: 'vixfix' },
  { key: 'daily|rsi2|E2|F1', name: 'ارتداد RSI 2 (يومي)', tv: 'Relative Strength Index — الطول 2', rule: 'RSI(2) يومي تحت 10 والسعر فوق متوسط 200 يوم', panel: 'rsi2' },
  { key: 'daily|vixfix|E2|F1', name: 'Williams Vix Fix (يومي)', tv: 'سكربت مجتمعي مشهور: CM_Williams_Vix_Fix', rule: 'Vix Fix يومي يلمس حده العلوي، والسعر فوق متوسط 200 يوم', panel: 'vixfix' },
]
const S2 = [
  { id: 'trix', name: 'TRIX 18', tv: 'TRIX — الطول 18', rule: 'TRIX يقطع الصفر للأعلى', panel: 'trix' },
  { id: 'ema_20_50', name: 'تقاطع EMA 20/50', tv: 'Moving Average Exponential مرتين: 20 و 50', rule: 'EMA20 يقطع EMA50 للأعلى', panel: 'ema' },
  { id: 'stoch', name: 'ستوكاستك 14/3/3', tv: 'Stochastic — الإعدادات الافتراضية', rule: '%K يقطع %D للأعلى وكلاهما تحت 20', panel: 'stoch' },
  { id: 'ao', name: 'المذبذب الرائع AO', tv: 'Awesome Oscillator', rule: 'AO يقطع الصفر للأعلى', panel: 'ao' },
]

// ── example trades ────────────────────────────────────────────────────────────

const exitPrice = (entry, ret) => (ret * entry + entry * (1 + COST)) / (1 - COST)

function study4Trades(sym, key) {
  const [tf, id, ex, fl] = key.split('|')
  const s = series(sym, tf)
  const x = events4(s, tf)
  const oc = outcomes4(s, tf, x)
  const ev = x.events[id].map((e, i) => e && x.filters[fl][i])
  const ts = tradesFor(ev, oc[ex], SETTINGS[tf].warmup).map((t) => {
    const entry = s.open[t.i + 1]
    return { ...t, entry, exit: exitPrice(entry, t.ret), stop: entry - 3 * x.atr14[t.i] }
  })
  return { s, tf, ts }
}

function study2Trades(sym, id) {
  const s = series(sym, 'daily')
  const sg = signals(s, 'daily')
  const oc = s.close.map((_, i) => (i >= TRACKS.A.warmup ? tradeFrom(s, i, sg.atr[i], TRACKS.A) : null))
  const ts = tradesFor(sg.events[id], oc, TRACKS.A.warmup).map((t) => ({
    ...t, stop: t.entry - 2 * sg.atr[t.i], target: t.entry + 3 * sg.atr[t.i],
  }))
  return { s, tf: 'daily', ts }
}

function pickExamples(get) {
  for (const sym of EXAMPLE_ORDER) {
    const { s, tf, ts } = get(sym)
    const p2 = ts.filter((t) => s.date[t.i] >= SPLIT)
    const win = [...p2].reverse().find((t) => t.ret > 0)
    const loss = [...p2].reverse().find((t) => t.ret <= 0)
    if (win && loss) return { sym, s, tf, win, loss }
  }
  return null
}

// ── charts (inline SVG) ───────────────────────────────────────────────────────

const W = 640
const PRICE_H = 210
const PANEL_H = 70
const PAD_L = 8
const PAD_R = 58

function panelSeries(kind, s) {
  const { high: h, low: l, close: c } = s
  if (kind === 'rsi2') return { lines: [{ v: I.rsi(c, 2), cls: 'ind' }], ref: [10], range: [0, 100], label: 'RSI(2)' }
  if (kind === 'vixfix') { const v = J.vixFix(h, l, c); return { lines: [{ v: v.wvf, cls: 'ind' }, { v: v.upper, cls: 'ind2' }], ref: [], label: 'Vix Fix' } }
  if (kind === 'trix') return { lines: [{ v: I.trix(c), cls: 'ind' }], ref: [0], label: 'TRIX' }
  if (kind === 'stoch') { const st = I.stochastic(h, l, c); return { lines: [{ v: st.k, cls: 'ind' }, { v: st.d, cls: 'ind2' }], ref: [20], range: [0, 100], label: 'Stoch' } }
  if (kind === 'ao') return { bars: I.awesome(h, l), ref: [0], label: 'AO' }
  return null
}

function chart(ex, which, kind, opts) {
  const { s, tf } = ex
  const t = ex[which]
  const before = tf === 'daily' ? 45 : 32
  const a = Math.max(0, t.i - before)
  const b = Math.min(s.close.length - 1, t.exitIndex + 6)
  const idx = Array.from({ length: b - a + 1 }, (_, k) => a + k)
  const trend = opts.trendMa ? I.sma(s.close, opts.trendMa) : null
  const sma5 = opts.sma5 ? I.sma(s.close, 5) : null
  const emas = kind === 'ema' ? [I.ema(s.close, 20), I.ema(s.close, 50)] : []
  const overlay = [trend, sma5, ...emas].filter(Boolean)
  let lo = Infinity, hi = -Infinity
  for (const i of idx) {
    lo = Math.min(lo, s.low[i]); hi = Math.max(hi, s.high[i])
    for (const o of overlay) if (Number.isFinite(o[i])) { lo = Math.min(lo, o[i]); hi = Math.max(hi, o[i]) }
  }
  for (const v of [t.stop, t.target]) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v) }
  const padY = (hi - lo) * 0.06
  lo -= padY; hi += padY
  const panel = panelSeries(kind, s)
  const H = PRICE_H + (panel ? PANEL_H + 14 : 0) + 18
  const plotW = W - PAD_L - PAD_R
  const step = plotW / idx.length
  const X = (i) => PAD_L + (i - a + 0.5) * step
  const Y = (v) => 8 + (1 - (v - lo) / (hi - lo)) * (PRICE_H - 16)
  const f = (v) => v.toFixed(1)
  const out = []
  // price grid: 4 ticks
  for (let k = 0; k <= 3; k += 1) {
    const v = lo + ((hi - lo) * k) / 3
    out.push(`<line class="grid" x1="${PAD_L}" x2="${W - PAD_R}" y1="${f(Y(v))}" y2="${f(Y(v))}"/><text class="tick" x="${W - PAD_R + 6}" y="${f(Y(v) + 3)}">${v >= 1000 ? v.toFixed(0) : v.toFixed(v >= 100 ? 1 : 2)}</text>`)
  }
  // holding window shading
  out.push(`<rect class="hold" x="${f(X(t.i + 1) - step / 2)}" y="4" width="${f((t.exitIndex - t.i) * step)}" height="${PRICE_H - 8}"/>`)
  const line = (arr, cls) => {
    const pts = idx.filter((i) => Number.isFinite(arr[i])).map((i) => `${f(X(i))},${f(Y(arr[i]))}`)
    return pts.length > 1 ? `<polyline class="${cls}" points="${pts.join(' ')}"/>` : ''
  }
  if (trend) out.push(line(trend, 'ma'))
  emas.forEach((e, k) => out.push(line(e, k ? 'ema50' : 'ema20')))
  if (sma5) out.push(line(sma5, 'sma5'))
  // candles
  const bw = Math.max(1.5, step * 0.62)
  for (const i of idx) {
    const up = s.close[i] >= s.open[i]
    const y1 = Y(Math.max(s.open[i], s.close[i]))
    const y2 = Y(Math.min(s.open[i], s.close[i]))
    out.push(`<g class="${up ? 'up' : 'dn'}"><title>${s.date[i]}  O ${s.open[i]}  H ${s.high[i]}  L ${s.low[i]}  C ${s.close[i]}</title><line x1="${f(X(i))}" x2="${f(X(i))}" y1="${f(Y(s.high[i]))}" y2="${f(Y(s.low[i]))}"/><rect x="${f(X(i) - bw / 2)}" y="${f(y1)}" width="${f(bw)}" height="${f(Math.max(1, y2 - y1))}"/></g>`)
  }
  // stop / target over the holding window
  const x0 = X(t.i + 1) - step / 2
  const x1 = X(t.exitIndex) + step / 2
  if (Number.isFinite(t.stop)) out.push(`<line class="stop" x1="${f(x0)}" x2="${f(x1)}" y1="${f(Y(t.stop))}" y2="${f(Y(t.stop))}"/>`)
  if (Number.isFinite(t.target)) out.push(`<line class="target" x1="${f(x0)}" x2="${f(x1)}" y1="${f(Y(t.target))}" y2="${f(Y(t.target))}"/>`)
  // signal, entry, exit
  const sx = X(t.i)
  out.push(`<path class="sig" d="M${f(sx)},${f(Y(s.low[t.i]) + 6)} l-5,9 h10 z"/>`)
  out.push(`<circle class="entry" cx="${f(X(t.i + 1))}" cy="${f(Y(t.entry))}" r="4.5"/>`)
  out.push(`<circle class="${t.ret > 0 ? 'exitw' : 'exitl'}" cx="${f(X(t.exitIndex))}" cy="${f(Y(t.exit))}" r="4.5"/>`)
  // indicator panel
  if (panel) {
    const top = PRICE_H + 14
    const vals = []
    for (const i of idx) {
      for (const ln of panel.lines ?? []) if (Number.isFinite(ln.v[i])) vals.push(ln.v[i])
      if (panel.bars && Number.isFinite(panel.bars[i])) vals.push(panel.bars[i])
    }
    let plo = panel.range ? panel.range[0] : Math.min(...vals, ...(panel.ref ?? []))
    let phi = panel.range ? panel.range[1] : Math.max(...vals, ...(panel.ref ?? []))
    if (phi === plo) phi = plo + 1
    const PY = (v) => top + 4 + (1 - (v - plo) / (phi - plo)) * (PANEL_H - 8)
    out.push(`<rect class="panelbg" x="${PAD_L}" y="${top}" width="${plotW}" height="${PANEL_H}"/>`)
    for (const r of panel.ref ?? []) out.push(`<line class="ref" x1="${PAD_L}" x2="${W - PAD_R}" y1="${f(PY(r))}" y2="${f(PY(r))}"/><text class="tick" x="${W - PAD_R + 6}" y="${f(PY(r) + 3)}">${r}</text>`)
    out.push(`<text class="plabel" x="${W - PAD_R + 6}" y="${top + 12}">${panel.label}</text>`)
    if (panel.bars) {
      for (const i of idx) {
        const v = panel.bars[i]
        if (!Number.isFinite(v)) continue
        const y0 = PY(0)
        const y = PY(v)
        out.push(`<rect class="${v >= 0 ? 'aoup' : 'aodn'}" x="${f(X(i) - bw / 2)}" y="${f(Math.min(y, y0))}" width="${f(bw)}" height="${f(Math.max(1, Math.abs(y - y0)))}"/>`)
      }
    }
    for (const ln of panel.lines ?? []) {
      const pts = idx.filter((i) => Number.isFinite(ln.v[i])).map((i) => `${f(X(i))},${f(PY(Math.max(plo, Math.min(phi, ln.v[i]))))}`)
      if (pts.length > 1) out.push(`<polyline class="${ln.cls}" points="${pts.join(' ')}"/>`)
    }
    out.push(`<line class="sigline" x1="${f(sx)}" x2="${f(sx)}" y1="${top}" y2="${top + PANEL_H}"/>`)
  }
  // date axis: first, signal, last
  const yAxis = H - 4
  out.push(`<text class="tick" x="${f(X(a))}" y="${yAxis}" text-anchor="start">${s.date[a]}</text><text class="tick" x="${f(X(b))}" y="${yAxis}" text-anchor="end">${s.date[b]}</text>`)
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${which === 'win' ? 'صفقة رابحة' : 'صفقة خاسرة'}">${out.join('')}</svg>`
}

const pct = (x, d = 1) => (Number.isFinite(x) ? `${(100 * x).toFixed(d)}%` : '—')
const spct = (x, d = 1) => (Number.isFinite(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(100 * x).toFixed(d)}%` : '—')
const L = (s) => `<span class="ltr">${s}</span>`
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const price = (x) => (x >= 1000 ? x.toFixed(0) : x.toFixed(2))

function exampleBlock(ex, kind, opts, unit) {
  if (!ex) return '<p class="muted">لا يوجد مثال مطابق للقاعدة.</p>'
  const fig = (which) => {
    const t = ex[which]
    const held = t.exitIndex - t.i
    return `<figure class="ex ${which}">
<figcaption><span class="tag ${which}">${which === 'win' ? 'صفقة رابحة' : 'صفقة خاسرة'}</span> ${L(esc(ex.sym))} · ${L(ex.s.date[t.i])}</figcaption>
<div class="chartbox">${chart(ex, which, kind, opts)}</div>
<dl class="facts"><div><dt>الدخول</dt><dd>${L(price(t.entry))}<small>${L(ex.s.date[t.i + 1])}</small></dd></div>
<div><dt>الخروج</dt><dd>${L(price(t.exit))}<small>${L(ex.s.date[t.exitIndex])}</small></dd></div>
<div><dt>النتيجة</dt><dd class="${t.ret > 0 ? 'pos' : 'neg'}">${L(spct(t.ret))}<small>بعد العمولة</small></dd></div>
<div><dt>المدة</dt><dd>${L(String(held))} ${unit}</dd></div></dl>
</figure>`
  }
  return `<div class="pair">${fig('win')}${fig('loss')}</div>`
}

// ── current signals (all universe + watchlist) ────────────────────────────────

const watchSet = new Set(watch.filter((w) => w.symbol).map((w) => w.symbol))
const allSyms = [...new Set([...universe.map((u) => u.symbol), ...watchSet])].filter((sym) => fs.existsSync(`data/us/bars/${sym.replace(':', '_')}.json.gz`))
const current = []
const perSymbolStats = {}
for (const sym of allSyms) {
  const d = bars(sym)
  if (d.close.length < 300) continue
  for (const tf of ['daily', 'weekly']) {
    const s = tf === 'daily' ? d : toWeekly({ ...d, group: 'us' }, CUTOFF)
    const x = events4(s, tf)
    const i = s.close.length - 1
    for (const st of S4) {
      const [ktf, id, , fl] = st.key.split('|')
      if (ktf !== tf) continue
      if (x.events[id][i] && x.filters[fl][i]) current.push({ key: st.key, sym, watch: watchSet.has(sym), date: s.date[i], close: s.close[i], stop: s.close[i] - 3 * x.atr14[i], sma5: x.sma5[i] })
    }
    if (tf === 'weekly' && watchSet.has(sym)) {
      const oc = outcomes4(s, tf, x)
      const ev = x.events.rsi2.map((e, k) => e && x.filters.F1[k])
      const ts = tradesFor(ev, oc.E2, SETTINGS.weekly.warmup)
      perSymbolStats[sym] = { n: ts.length, win: ts.length ? ts.filter((t) => t.ret > 0).length / ts.length : null, avg: ts.length ? ts.reduce((p, t) => p + t.ret, 0) / ts.length : null }
    }
  }
}

// ── page ──────────────────────────────────────────────────────────────────────

const conf = Object.fromEntries(confirm.map((r) => [r.key, r]))
const holdStats = JSON.parse(fs.readFileSync('reports/study4-hold.json', 'utf8'))
const best = conf['weekly|rsi2|E2|F1']

const s4Cards = S4.map((st, k) => {
  const r = conf[st.key]
  const hs = holdStats[st.key]
  const [tf] = st.key.split('|')
  const ex = pickExamples((sym) => study4Trades(sym, st.key))
  const unit = tf === 'daily' ? 'جلسات' : 'أسابيع'
  const opts = { trendMa: tf === 'daily' ? 200 : 40, sma5: true }
  return `<article class="card" id="s4-${k}">
<header class="cardhead"><div><span class="rank">${k + 1}</span><h3>${esc(st.name)}</h3><span class="tf">${tf === 'daily' ? 'يومي · صفقة أسبوع تقريباً' : 'أسبوعي · صفقة شهر تقريباً'}</span></div>
<div class="bignum"><b>${L(pct(r.all.win))}</b><span>نسبة الربح على أسهم لم تُرَ<br>العشوائي بنفس الخروج: ${L(pct(r.all.baseWin))}</span></div></header>
<div class="rules">
<div><span class="k">الشراء</span><span class="v">${esc(st.rule)}. الدخول عند افتتاح ${tf === 'daily' ? 'اليوم' : 'الأسبوع'} التالي.</span></div>
<div><span class="k">البيع</span><span class="v">أول إغلاق فوق متوسط 5 ${tf === 'daily' ? 'أيام' : 'أسابيع'}، والبيع عند الافتتاح التالي.</span></div>
<div><span class="k">وقف الطوارئ</span><span class="v">الدخول − 3 × ATR(14). أقصى مدة ${tf === 'daily' ? '10 جلسات' : '13 أسبوعاً'}.</span></div>
<div><span class="k">في تريدنج فيو</span><span class="v">${esc(st.tv)}، أو سكربت Pine في آخر الصفحة.</span></div>
</div>
<dl class="stats">
<div><dt>متوسط الصفقة</dt><dd>${L(spct(r.all.meanRet, 2))}</dd></div>
<div><dt>متوسط الربح / الخسارة</dt><dd>${L(spct(hs.avgWin))} / ${L(spct(hs.avgLoss))}</dd></div>
<div><dt>أسوأ صفقة</dt><dd class="neg">${L(spct(hs.worst))}</dd></div>
<div><dt>المدة الوسطى</dt><dd>${L(String(hs.median))} ${unit}</dd></div>
<div><dt>قبل 2018 / بعدها</dt><dd>${L(pct(r.I.win))} / ${L(pct(r.II.win))}</dd></div>
<div><dt>الصفقات المختبرة</dt><dd>${L(r.all.n.toLocaleString('en'))}</dd></div>
</dl>
${exampleBlock(ex, st.panel, opts, unit)}
</article>`
}).join('\n')

const s2Rows = Object.fromEntries(usRes.A.rows.map((r) => [r.id, r]))
const s2Cards = S2.map((st) => {
  const r = s2Rows[st.id]
  const ex = pickExamples((sym) => study2Trades(sym, st.id))
  return `<article class="card small">
<header class="cardhead"><div><h3>${esc(st.name)}</h3><span class="tf">يومي · وقف 2×ATR · هدف 3×ATR · 10 جلسات</span></div>
<div class="bignum"><b>${L(pct(r.II.win))}</b><span>نسبة الربح 2018–2026<br>العشوائي: ${L(pct(r.II.baseWin))}</span></div></header>
<div class="rules"><div><span class="k">الشراء</span><span class="v">${esc(st.rule)}</span></div><div><span class="k">في تريدنج فيو</span><span class="v">${esc(st.tv)}</span></div></div>
${exampleBlock(ex, st.panel, {}, 'جلسات')}
</article>`
}).join('\n')

const sigRows = (filter) => current.filter(filter).map((c) => {
  const st = S4.find((x) => x.key === c.key)
  return `<tr class="${c.watch ? 'hl' : ''}"><td><b>${L(esc(c.sym.split(':')[1]))}</b>${c.watch ? '<small>من قائمتك</small>' : ''}</td><td>${esc(st.name)}</td><td class="n">${L(price(c.close))}</td><td class="n neg">${L(price(c.stop))}</td><td class="n">${L(price(c.sma5))}</td></tr>`
}).join('')

const watchRows = watch.map((w) => {
  const st = w.symbol ? perSymbolStats[w.symbol] : null
  const sig = current.filter((c) => c.sym === w.symbol).map((c) => S4.find((x) => x.key === c.key).name)
  const note = w.note ?? (st ? '' : 'لا توجد بيانات كافية')
  return `<tr><td><b>${L(esc(w.ticker))}</b></td><td class="n">${st && st.n ? `${L(pct(st.win, 0))} <small>${L(`n=${st.n}`)}</small>` : '—'}</td><td class="n">${st && st.n ? L(spct(st.avg)) : '—'}</td><td>${sig.length ? `<span class="chip on">${esc(sig.join('، '))}</span>` : `<span class="muted">${esc(note || 'لا إشارة')}</span>`}</td></tr>`
}).join('')

const pine = fs.readFileSync('pine/pullback-reversion.pine', 'utf8')
const pineLab = fs.readFileSync('pine/swing-lab.pine', 'utf8')

const STYLE = `
:root{
  /* Layout: one RTL reading column; cards hold each strategy; charts scale to the column. */
  --bg:#F2F2EF; --surface:#FAFAF8; --raise:#EDEDE8; --ink:#1B1B19; --body:#43433D; --muted:#6B6B62;
  --faint:#93938A; --line:#DBDBD3; --accent:#8F711B; --accent-soft:#EFE7CC;
  --pos:#3F7A3A; --neg:#A3412C; --pos-soft:#E1ECDA; --neg-soft:#F4E0D9;
  --grid:#E4E4DD; --ma:#8A8A80; --sma5:#B07A10; --ind:#2F5E8C; --ind2:#B07A10; --hold:rgba(143,113,27,.08);
  --ar:"IBM Plex Sans Arabic",system-ui,"Segoe UI",Tahoma,sans-serif; --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#191917; --surface:#222220; --raise:#2A2A26; --ink:#EDEDE7; --body:#C1C1B7; --muted:#8D8D83;
  --faint:#696960; --line:#34342E; --accent:#CBA84A; --accent-soft:#322B17;
  --pos:#7FB26E; --neg:#D9806A; --pos-soft:#22301D; --neg-soft:#3A241E;
  --grid:#2E2E29; --ma:#77776E; --sma5:#D9A93F; --ind:#7FA9D6; --ind2:#D9A93F; --hold:rgba(203,168,74,.10); color-scheme:dark;
}}
:root[data-theme="dark"]{
  --bg:#191917; --surface:#222220; --raise:#2A2A26; --ink:#EDEDE7; --body:#C1C1B7; --muted:#8D8D83;
  --faint:#696960; --line:#34342E; --accent:#CBA84A; --accent-soft:#322B17;
  --pos:#7FB26E; --neg:#D9806A; --pos-soft:#22301D; --neg-soft:#3A241E;
  --grid:#2E2E29; --ma:#77776E; --sma5:#D9A93F; --ind:#7FA9D6; --ind2:#D9A93F; --hold:rgba(203,168,74,.10); color-scheme:dark;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--body);font-family:var(--ar);line-height:1.75}
.wrap{max-width:960px;margin:0 auto;padding-inline:16px;padding-block:0 80px}
header.top{padding-block:48px 22px;border-bottom:1px solid var(--line)}
.eyebrow{font-size:.74rem;color:var(--faint);font-weight:700;margin:0 0 8px}
h1{color:var(--ink);font-size:clamp(1.7rem,5vw,2.4rem);line-height:1.25;margin:0 0 12px;text-wrap:balance}
.lede{font-size:1.04rem;color:var(--muted);max-width:64ch;margin:0}
h2{color:var(--ink);font-size:1.3rem;margin:46px 0 10px;text-wrap:balance}
h3{color:var(--ink);font-size:1.12rem;margin:0}
p{max-width:70ch}
.muted{color:var(--muted)}
.ltr{direction:ltr;unicode-bidi:isolate;display:inline-block;font-variant-numeric:tabular-nums}
.hero{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-top:22px}
.hero>div{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:14px 16px;min-width:0}
.hero b{display:block;color:var(--ink);font-size:1.7rem;line-height:1.2;font-variant-numeric:tabular-nums}
.hero>div>span{font-size:.84rem;color:var(--muted)}
.callout{background:var(--accent-soft);border-radius:6px;padding:14px 18px;margin:18px 0;color:var(--ink)}
.callout p{margin:0}
.legend{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:.84rem;color:var(--muted);margin:10px 0 0}
.legend span{display:inline-flex;align-items:center;gap:6px}
.sw{display:inline-block;width:18px;height:0;border-top:2px solid}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%}
.card{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:18px;margin:16px 0;display:flex;flex-direction:column;gap:14px}
.cardhead{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
.cardhead>div:first-child{display:flex;flex-direction:column;gap:2px}
.rank{font-size:.72rem;color:var(--accent);font-weight:700}
.tf{font-size:.8rem;color:var(--faint)}
.bignum{display:flex;align-items:center;gap:10px}
.bignum b{color:var(--pos);font-size:2rem;font-variant-numeric:tabular-nums}
.bignum>span{font-size:.76rem;color:var(--muted);line-height:1.45}
.rules{display:grid;gap:6px}
.rules>div{display:grid;grid-template-columns:7.5em 1fr;gap:10px}
.rules .k{color:var(--faint);font-size:.8rem;font-weight:700;padding-top:2px}
.rules .v{color:var(--ink)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:0}
.stats div{background:var(--raise);border-radius:5px;padding:8px 10px}
dt{font-size:.72rem;color:var(--faint);font-weight:700}
dd{margin:0;color:var(--ink);font-weight:600}
dd small{display:block;color:var(--faint);font-weight:400;font-size:.72rem}
.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr));gap:12px}
figure.ex{margin:0;border:1px solid var(--line);border-radius:6px;padding:10px;min-width:0;background:var(--bg)}
figcaption{font-size:.84rem;color:var(--muted);margin-bottom:6px}
.tag{font-size:.72rem;font-weight:700;padding:1px 8px;border-radius:99px}
.tag.win{background:var(--pos-soft);color:var(--pos)} .tag.loss{background:var(--neg-soft);color:var(--neg)}
.chartbox{direction:ltr}
.chartbox svg{width:100%;height:auto;display:block}
.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0 0}
.facts div{min-width:0}
svg .grid{stroke:var(--grid);stroke-width:1}
svg .tick,svg .plabel{fill:var(--faint);font-size:10px;font-family:var(--mono)}
svg .hold{fill:var(--hold)}
svg .up line{stroke:var(--pos);stroke-width:1} svg .up rect{fill:var(--pos)}
svg .dn line{stroke:var(--neg);stroke-width:1} svg .dn rect{fill:var(--neg)}
svg .ma{fill:none;stroke:var(--ma);stroke-width:1.5;stroke-dasharray:4 3}
svg .sma5{fill:none;stroke:var(--sma5);stroke-width:1.6}
svg .ema20{fill:none;stroke:var(--ind);stroke-width:1.6} svg .ema50{fill:none;stroke:var(--sma5);stroke-width:1.6}
svg .stop{stroke:var(--neg);stroke-width:1.5;stroke-dasharray:5 3}
svg .target{stroke:var(--pos);stroke-width:1.5;stroke-dasharray:5 3}
svg .sig{fill:var(--accent)}
svg .entry{fill:var(--surface);stroke:var(--ink);stroke-width:2}
svg .exitw{fill:var(--pos);stroke:var(--surface);stroke-width:2} svg .exitl{fill:var(--neg);stroke:var(--surface);stroke-width:2}
svg .panelbg{fill:var(--raise)}
svg .ref{stroke:var(--faint);stroke-width:1;stroke-dasharray:3 3}
svg .ind{fill:none;stroke:var(--ind);stroke-width:1.6} svg .ind2{fill:none;stroke:var(--ind2);stroke-width:1.3}
svg .aoup{fill:var(--pos)} svg .aodn{fill:var(--neg)}
svg .sigline{stroke:var(--accent);stroke-width:1;stroke-dasharray:2 2}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:6px;background:var(--surface);margin:12px 0}
table{border-collapse:collapse;width:100%;font-size:.86rem;min-width:520px}
th{font-size:.74rem;color:var(--faint);font-weight:700;text-align:start;padding:8px 10px;border-bottom:1px solid var(--line);background:var(--raise);white-space:nowrap}
td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
td small{display:block;color:var(--faint);font-size:.72rem}
td.n{white-space:nowrap}
tr.hl td{background:var(--accent-soft)}
.pos{color:var(--pos)} .neg{color:var(--neg)}
.chip{font-size:.74rem;font-weight:700;padding:1px 8px;border-radius:99px}
.chip.on{background:var(--pos-soft);color:var(--pos)}
details{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:10px 14px;margin:10px 0}
summary{cursor:pointer;color:var(--ink);font-weight:600}
pre{direction:ltr;text-align:left;overflow-x:auto;background:var(--raise);padding:12px;border-radius:5px;font-size:.74rem;line-height:1.5;max-height:420px}
button.copy{font-family:inherit;font-size:.82rem;background:var(--accent);color:var(--surface);border:0;border-radius:5px;padding:6px 14px;cursor:pointer;margin:8px 0}
button.copy:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
ol,ul{padding-inline-start:22px;max-width:70ch} li{margin-bottom:6px}
code{font-family:var(--mono);font-size:.82em;background:var(--raise);padding:1px 5px;border-radius:3px;direction:ltr;unicode-bidi:isolate}
footer{margin-top:48px;padding-top:18px;border-top:1px solid var(--line);font-size:.84rem;color:var(--faint);max-width:70ch}
a{color:var(--accent)}
@media (max-width:520px){.facts{grid-template-columns:repeat(2,1fr)}.rules>div{grid-template-columns:1fr;gap:0}}
`

const legend = `<div class="legend"><span><span class="dot" style="background:var(--accent)"></span>شمعة الإشارة (▲)</span><span><span class="dot" style="border:2px solid var(--ink)"></span>الدخول</span><span><span class="dot" style="background:var(--pos)"></span>/<span class="dot" style="background:var(--neg)"></span>الخروج</span><span><span class="sw" style="border-color:var(--sma5)"></span>متوسط 5 (خط البيع)</span><span><span class="sw" style="border-color:var(--ma);border-top-style:dashed"></span>متوسط الاتجاه</span><span><span class="sw" style="border-color:var(--neg);border-top-style:dashed"></span>الوقف</span><span><span class="sw" style="border-color:var(--pos);border-top-style:dashed"></span>الهدف</span><span><span class="sw" style="border-color:var(--hold);border-top-width:8px"></span>فترة الاحتفاظ</span></div>`

const body = `<div class="wrap" dir="rtl" lang="ar">
<header class="top">
<p class="eyebrow">السوق الأمريكي · 311 سهماً وصندوقاً · 912 استراتيجية · بحث على نصف الأسهم وتأكيد على النصف الآخر</p>
<h1>مؤشرات السوينج المختبرة</h1>
<p class="lede">كل استراتيجية في هذه الصفحة مرّت بنفس الطريق: كتبنا الشروط في git قبل الحساب، وبحثنا على نصف الأسهم، ثم اختبرنا الفائزين على النصف الآخر الذي لم يُرَ. لكل استراتيجية صورة صفقة رابحة وصورة صفقة خاسرة من بيانات حقيقية.</p>
<div class="hero">
<div><b>${L(pct(best.all.win))}</b><span>نسبة ربح أفضل استراتيجية (ارتداد RSI 2 أسبوعي) على 155 سهماً لم تُرَ</span></div>
<div><b>${L(pct(best.all.baseWin))}</b><span>نسبة ربح الدخول العشوائي بنفس طريقة الخروج. الفرق هو قيمة المؤشر</span></div>
<div><b>${L(spct(best.all.meanRet))}</b><span>متوسط الصفقة بعد العمولة، ومدتها حوالي 4 أسابيع</span></div>
<div><b>10 / 10</b><span>استراتيجيات اختيرت في البحث ونجحت كلها في التأكيد</span></div>
</div>
</header>

<h2>كيف تقرأ الصور</h2>
<p>كل صورة شارت حقيقي لسهم. الأمثلة تُختار بقاعدة ثابتة كُتبت مسبقاً: آخر صفقة رابحة وآخر صفقة خاسرة بعد 2018 على NVDA، وإذا لم تتوفر فعلى AAPL، ثم MSFT وهكذا. لم أختر أجمل الصفقات.</p>
${legend}

<h2>الاستراتيجيات المؤكدة: الشراء عند التراجع في ترند صاعد</h2>
<p>الفكرة واحدة في كل هذه الاستراتيجيات: سهم في ترند صاعد ينزل بقوة لفترة قصيرة، فتشتري، وتبيع عند أول ارتداد فوق متوسط 5. لهذا نسبة الربح عالية، والأرباح صغيرة ومتكررة.</p>
${s4Cards}

<div class="callout"><p><b>اقرأ هذا قبل الاستخدام:</b> متوسط الربح أصغر من متوسط الخسارة، فالصفقات الخاسرة القليلة أكبر. وأسوأ صفقة في الأسبوعي وصلت ${L(spct(holdStats['weekly|rsi2|E2|F1'].worst))} بسبب فجوة سعرية تجاوزت الوقف. وزّع رأس المال على عدة صفقات ولا تضعه كله في واحدة. هذه الاستراتيجيات نجحت على الأسهم الأمريكية الكبيرة، وكانت ضعيفة على الكريبتو والسوق السعودي.</p></div>

<h2>إشارات الأسبوع الماضي</h2>
<p>شمعة الأسبوع المنتهي في ${L('2026-10-02')} للأسبوعي، وإغلاق ${L('2026-10-06')} لليومي. الدخول الفعلي عند الافتتاح التالي. البيع عندما يغلق السعر فوق عمود "متوسط 5"، علماً أن قيمة المتوسط تتحرك كل أسبوع.</p>
<div class="tw"><table><thead><tr><th>السهم</th><th>الاستراتيجية</th><th>الإغلاق</th><th>وقف الطوارئ</th><th>متوسط 5 الآن</th></tr></thead><tbody>${sigRows((c) => c.key === 'weekly|rsi2|E2|F1') || ''}${sigRows((c) => c.key !== 'weekly|rsi2|E2|F1' && (c.watch || c.key.startsWith('daily')))}</tbody></table></div>
<p class="muted">الجدول يعرض كل إشارات ارتداد RSI 2 الأسبوعي، والإشارات اليومية، وكل إشارة على أسهم قائمتك. هذه مخرجات قاعدة، وليست توصية.</p>

<h2>قائمتك</h2>
<p>كيف أدت أفضل استراتيجية (ارتداد RSI 2 أسبوعي) على كل سهم من قائمتك تاريخياً، وما الإشارات الحالية عليه. أرقام السهم الواحد عينة صغيرة، فانظر إلى عدد الصفقات (n) بجانب كل نسبة.</p>
<div class="tw"><table><thead><tr><th>السهم</th><th>نسبة الربح تاريخياً</th><th>متوسط الصفقة</th><th>إشارة الآن</th></tr></thead><tbody>${watchRows}</tbody></table></div>

<h2>مؤشرات سوينج قصير (أسبوع إلى أسبوعين) ثبتت أيضاً</h2>
<p>هذه من الدراسة الثانية، بخروج ثابت (وقف وهدف). ميزتها حقيقية لكنها أصغر بكثير، ونسبة ربحها حوالي 52%.</p>
${s2Cards}

<h2>ما فشل</h2>
<ul>
<li><b>اختراق قناة كيلتنر:</b> نجح في الدراسة الأولى على 33 رمزاً، ثم فشل على 288 سهماً أمريكياً جديداً. هذا سبب الإصرار على التأكيد.</li>
<li><b>مؤشرات الاختراق</b> (دونشيان، بولينجر العلوي) <b>والتقييم الفني لتريدنج فيو:</b> جاءت أسوأ من الدخول العشوائي على الأسهم الكبيرة.</li>
<li><b>الاستثمار لسنة أو سنتين:</b> لم تتفوق أي قاعدة توقيت من 19 على الشراء والاحتفاظ.</li>
</ul>

<h2>أضفها إلى تريدنج فيو</h2>
<p>افتح Pine Editor أسفل الشارت، والصق الكود، ثم اضغط Add to chart. للاستراتيجيات المؤكدة استخدم شارت <b>أسبوعي</b>. لم أستطع تشغيل Pine هنا، فإذا ظهر خطأ صوّره وأرسله لي.</p>
<details open><summary>Pullback Reversion: الاستراتيجيات المؤكدة (ارتداد RSI 2 وأخواتها)</summary>
<button class="copy" type="button" data-target="pine1">نسخ الكود</button><pre id="pine1">${esc(pine)}</pre></details>
<details><summary>Swing Lab: كل مؤشرات الدراسة الأولى بخروجها الثابت</summary>
<button class="copy" type="button" data-target="pine2">نسخ الكود</button><pre id="pine2">${esc(pineLab)}</pre></details>

<h2>كيف منعنا الغش</h2>
<ol>
<li>كل دراسة كُتبت شروطها في git قبل حسابها. تاريخ git لا يمكن تزويره للخلف.</li>
<li>بحثنا في 912 استراتيجية على 156 سهماً فقط، وجمّدنا أفضل 10 في git، ثم اختبرناها على 155 سهماً أمريكياً لم يرها البحث، ومعها الكريبتو والسعودي.</li>
<li>كل نتيجة مقارنة بالدخول العشوائي بنفس طريقة الخروج، وليس بالصفر.</li>
<li>الإعدادات الافتراضية لتريدنج فيو فقط، والعمولة 0.1% لكل جهة، وإذا لمست الشمعة الوقف والهدف معاً تُحسب خسارة.</li>
</ol>

<footer>للبحث والتحليل فقط، وليست نصيحة مالية. الأرقام من بيانات تاريخية، والماضي لا يضمن المستقبل. التقارير الكاملة في <code>reports/study4-*.txt</code> و<code>reports/us-*.txt</code>.</footer>
</div>
<script>
document.querySelectorAll('button.copy').forEach(function (b) {
  b.addEventListener('click', function () {
    var el = document.getElementById(b.dataset.target)
    var done = function () { b.textContent = 'تم النسخ' ; setTimeout(function () { b.textContent = 'نسخ الكود' }, 1800) }
    try {
      navigator.clipboard.writeText(el.textContent).then(done, function () { selectText(el) })
    } catch (e) { selectText(el) }
  })
})
function selectText(el) { var r = document.createRange(); r.selectNodeContents(el); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r) }
</script>`

const FONT = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap">'
const TITLE = '<title>مؤشرات السوينج المختبرة</title>'
fs.writeFileSync('us.html', `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${TITLE}
<meta name="description" content="912 استراتيجية سوينج مختبرة على السوق الأمريكي بشروط مكتوبة مسبقاً وتأكيد على أسهم لم تُرَ، مع صور صفقات رابحة وخاسرة.">
${FONT}<style>${STYLE}</style></head><body>
${body}
</body></html>
`)
if (process.env.SWING_ARTIFACT) fs.writeFileSync(process.env.SWING_ARTIFACT, `${TITLE}\n${FONT}\n<style>${STYLE}</style>\n${body}\n`)
console.log(`wrote us.html — ${current.length} current signals`)
