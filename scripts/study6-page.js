// Render study6.html (Arabic): study 6's result (reports/study6.json), the per-coin check
// (post-hoc, report only), a BTC chart with the FLT lines and the tested signals, today's
// signals, and the Pine script. Run after scripts/study6-run.js.
//   node scripts/study6-page.js
import fs from 'node:fs'

import { summarize6, events6, CRYPTO6, SPLIT6 } from '../engine/study6.js'
import { pool } from './study5-common.js'
import { loadCrypto } from './study6-run.js'

const R = JSON.parse(fs.readFileSync('reports/study6.json', 'utf8'))
const pine = fs.readFileSync('pine/flt-mod.pine', 'utf8')
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const pct = (v, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%`
const w = (v) => `${(v * 100).toFixed(1)}%`
const ltr = (s) => `<span class="ltr">${s}</span>`
const short = (sym) => sym.split(':')[1].replace(/USDT?$/, '')

const NAME = {
  OL: ['Open Long', 'EMA 20 تقطع EMA 50 للأعلى'],
  CU: ['Cross Up', 'EMA 20 تقطع EMA 200 للأعلى'],
  BC: ['تجمّع اختراقات', '3 اختراقات في آخر 5 شموع'],
  MOD: ['دايفرجنس MOD', 'قاع أدنى للسعر ومذبذبان من 4 أعلى'],
  DB: ['اختراق بعد دايفرجنس', 'أول اختراق خلال 20 شمعة بعد MOD'],
}
const EXIT = { X: 'حتى Close Long', H20: '20 شمعة', M3: '3 أشهر', M6: '6 أشهر', M12: '12 شهراً', XD: 'حتى Cross Down' }
const RL = JSON.parse(fs.readFileSync('reports/study6-long.json', 'utf8'))

// ── per-coin check for the passing crypto test (post-hoc, report only) ────────────────
const crypto = CRYPTO6.map((c) => ({ c, s: loadCrypto(c) }))
const sums = crypto.map(({ c, s }) => summarize6({ symbol: c.symbol, group: 'crypto' }, s, SPLIT6.crypto))
const randMedian = (() => {
  const all = []
  for (const x of sums) for (const p of ['I', 'II']) for (const v of x.base['H20|F0'][p].ret) all.push(v)
  all.sort((a, b) => a - b)
  return all[all.length >> 1]
})()
const loo = sums.filter((x) => pool([x], 'daily|BC|H20|F0').n > 0).map((x) => pool(sums.filter((y) => y !== x), 'daily|BC|H20|F0').edge)
const perCoin = sums.map((x) => ({ sym: short(x.symbol), ...pool([x], 'daily|BC|H20|F0') })).filter((q) => q.n > 0).sort((a, b) => b.edge - a.edge)

function coinChart() {
  const W = 720, row = 22, top = 26, left = 70, right = 70
  const H = top + perCoin.length * row + 30
  const max = Math.max(...perCoin.map((q) => Math.abs(q.edge)))
  const lim = Math.ceil(max * 10) / 10
  const x0 = left + (W - left - right) / 2
  const sx = (v) => x0 + (v / lim) * ((W - left - right) / 2)
  const ticks = [-lim, -lim / 2, 0, lim / 2, lim]
  let g = ''
  for (const t of ticks) g += `<line x1="${sx(t)}" x2="${sx(t)}" y1="${top - 6}" y2="${H - 24}" class="grid"/><text x="${sx(t)}" y="${H - 8}" class="tick" text-anchor="middle">${pct(t, 0)}</text>`
  perCoin.forEach((q, k) => {
    const y = top + k * row
    const a = sx(Math.min(0, q.edge)), b = sx(Math.max(0, q.edge))
    const cls = q.edge >= 0 ? 'barpos' : 'barneg'
    g += `<g class="hov"><title>${q.sym}: ${q.n} صفقة، ربح ${w(q.win)} (عشوائي ${w(q.baseWin)})، التفوّق ${pct(q.edge)}</title>`
    g += `<rect x="0" y="${y}" width="${W}" height="${row}" fill="transparent"/>`
    g += `<rect x="${a}" y="${y + 5}" width="${Math.max(1, b - a)}" height="${row - 10}" rx="2" class="${cls}"/>`
    g += `<text x="${left - 8}" y="${y + row / 2 + 4}" class="lab" text-anchor="end">${q.sym}</text>`
    g += `<text x="${q.edge >= 0 ? b + 6 : a - 6}" y="${y + row / 2 + 4}" class="val" text-anchor="${q.edge >= 0 ? 'start' : 'end'}">${pct(q.edge, 0)} · ${q.n}</text></g>`
  })
  g += `<line x1="${x0}" x2="${x0}" y1="${top - 6}" y2="${H - 24}" class="zero"/>`
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="تفوّق تجمّع الاختراقات على الدخول العشوائي لكل عملة">${g}</svg>`
}

// ── BTC chart data ────────────────────────────────────────────────────────────────────
const btc = crypto.find(({ c }) => c.symbol === 'BITSTAMP:BTCUSD').s
const bx = events6(btc)
const from = btc.date.findIndex((d) => d >= '2023-01-01')
const r2 = (v) => Math.round(v * 100) / 100
const chart = {
  d: btc.date.slice(from), c: btc.close.slice(from).map(r2),
  f: Array.from(bx.flt.fast.slice(from), r2), mf: Array.from(bx.flt.midFast.slice(from), r2),
  ms: Array.from(bx.flt.midSlow.slice(from), r2), s: Array.from(bx.flt.slow.slice(from), r2),
  bc: bx.events.BC.slice(from).map(Number), mod: bx.events.MOD.slice(from).map(Number),
}

// ── today's signals ───────────────────────────────────────────────────────────────────
const today = crypto.map(({ c, s }) => {
  const x = events6(s)
  const last = (a) => { let k = a.length - 1; while (k >= 0 && !a[k]) k -= 1; return k }
  const bc = last(x.events.BC), md = last(x.events.MOD)
  const n = s.close.length - 1
  const trend = x.flt.fast[n] > x.flt.midFast[n]
  const cloud = s.close[n] > Math.max(x.flt.midFast[n], x.flt.midSlow[n]) ? 'فوق' : s.close[n] < Math.min(x.flt.midFast[n], x.flt.midSlow[n]) ? 'تحت' : 'داخل'
  return { sym: short(c.symbol), lastDate: s.date[n], bc: bc >= 0 ? s.date[bc] : '—', bcAgo: bc >= 0 ? n - bc : Infinity, md: md >= 0 ? s.date[md] : '—', mdAgo: md >= 0 ? n - md : Infinity, trend, cloud }
})

// ── results tables ────────────────────────────────────────────────────────────────────
function table(group, all = R.rows) {
  const rows = all.filter((r) => r.group === group)
  let h = '<div class="tbl"><table><thead><tr><th>الإشارة</th><th>الخروج</th><th>الصفقات</th><th>نسبة الربح</th><th>عشوائي</th><th>الوسيط</th><th>التفوّق</th><th>قبل / بعد</th><th>p بعد Holm</th><th>الحكم</th></tr></thead><tbody>'
  for (const r of rows) {
    const a = r.all
    h += `<tr class="${r.beats ? 'win' : ''}"><td><b>${NAME[r.id][0]}</b><small>${NAME[r.id][1]}</small></td><td>${EXIT[r.exit]}</td>`
    h += `<td>${ltr(a.n.toLocaleString('en-US'))}</td><td>${ltr(w(a.win))}</td><td class="muted">${ltr(w(a.baseWin))}</td><td>${ltr(pct(a.median))}</td>`
    h += `<td class="${a.edge >= 0 ? 'pos' : 'neg'}">${ltr(pct(a.edge, 2))}</td><td class="muted">${ltr(`${pct(r.I.edge)} / ${pct(r.II.edge)}`)}</td><td>${ltr(a.pHolm < 0.001 ? '<0.001' : a.pHolm.toFixed(3))}</td>`
    h += `<td>${r.beats ? '<span class="pill ok">يتفوّق</span>' : '<span class="pill no">لا</span>'}</td></tr>`
  }
  return `${h}</tbody></table></div>`
}

const bcRow = R.rows.find((r) => r.group === 'crypto' && r.id === 'BC' && r.exit === 'H20')
const modRow = R.rows.find((r) => r.group === 'us' && r.id === 'MOD' && r.exit === 'X')
const passed = R.rows.filter((r) => r.beats).length
const btcList = R.btcTrades['daily|BC|H20|F0']
const btcWins = btcList.filter((t) => t.ret > 0).length

const html = `<title>FLT و MOD</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap">
<style>
:root{
  /* Layout: one RTL reading column, same system as us.html; charts and code run LTR. */
  --bg:#F2F2EF; --surface:#FAFAF8; --raise:#EDEDE8; --ink:#1B1B19; --body:#43433D; --muted:#6B6B62;
  --faint:#93938A; --line:#DBDBD3; --accent:#8F711B; --accent-soft:#EFE7CC;
  --pos:#3F7A3A; --neg:#A3412C; --pos-soft:#E1ECDA; --neg-soft:#F4E0D9; --grid:#E4E4DD;
  --l-fast:#1F63B5; --l-slow:#B07A10; --m-bc:#9C3D8F; --m-mod:#3F7A3A; --cloud-up:rgba(63,122,58,.14); --cloud-dn:rgba(163,65,44,.13);
  --ar:"IBM Plex Sans Arabic",system-ui,"Segoe UI",Tahoma,sans-serif; --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#191917; --surface:#222220; --raise:#2A2A26; --ink:#EDEDE7; --body:#C1C1B7; --muted:#8D8D83;
  --faint:#696960; --line:#34342E; --accent:#CBA84A; --accent-soft:#322B17;
  --pos:#7FB26E; --neg:#D9806A; --pos-soft:#22301D; --neg-soft:#3A241E; --grid:#2E2E29;
  --l-fast:#4F92E0; --l-slow:#B8861F; --m-bc:#C46FBA; --m-mod:#5A9E4B; --cloud-up:rgba(127,178,110,.16); --cloud-dn:rgba(217,128,106,.14); color-scheme:dark;
}}
:root[data-theme="dark"]{
  --bg:#191917; --surface:#222220; --raise:#2A2A26; --ink:#EDEDE7; --body:#C1C1B7; --muted:#8D8D83;
  --faint:#696960; --line:#34342E; --accent:#CBA84A; --accent-soft:#322B17;
  --pos:#7FB26E; --neg:#D9806A; --pos-soft:#22301D; --neg-soft:#3A241E; --grid:#2E2E29;
  --l-fast:#4F92E0; --l-slow:#B8861F; --m-bc:#C46FBA; --m-mod:#5A9E4B; --cloud-up:rgba(127,178,110,.16); --cloud-dn:rgba(217,128,106,.14); color-scheme:dark;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--body);font-family:var(--ar);line-height:1.75}
.wrap{max-width:960px;margin:0 auto;padding-inline:16px;padding-block:0 80px}
header.top{padding-block:48px 22px;border-bottom:1px solid var(--line)}
.eyebrow{font-size:.74rem;color:var(--faint);font-weight:700;margin:0 0 8px;letter-spacing:.02em}
h1{color:var(--ink);font-size:clamp(1.6rem,4.6vw,2.3rem);line-height:1.3;margin:0 0 12px;text-wrap:balance}
.lede{font-size:1.04rem;color:var(--muted);max-width:64ch;margin:0}
h2{color:var(--ink);font-size:1.3rem;margin:48px 0 10px;text-wrap:balance}
h3{color:var(--ink);font-size:1.05rem;margin:0 0 6px}
p{max-width:70ch;margin:0 0 12px}
.muted{color:var(--muted)}
.ltr{direction:ltr;unicode-bidi:isolate;display:inline-block;font-variant-numeric:tabular-nums}
.notice{margin-top:24px;background:var(--accent-soft);border:1px solid var(--line);border-radius:6px;padding:16px 18px}
.notice h3{margin-bottom:8px}
.notice ul{margin:0;padding-inline-start:20px;display:grid;gap:4px}
.hero{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:22px}
.hero>div{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:14px 16px;min-width:0}
.hero b{display:block;color:var(--ink);font-size:1.6rem;line-height:1.25;font-variant-numeric:tabular-nums}
.hero span{font-size:.88rem;color:var(--muted)}
.hero small.vs{font-size:.9rem;font-weight:400;color:var(--muted)}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:6px;background:var(--surface);margin:12px 0 6px}
table{border-collapse:collapse;width:100%;font-size:.88rem;font-variant-numeric:tabular-nums}
th,td{padding:8px 10px;text-align:start;border-bottom:1px solid var(--line);white-space:nowrap;vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:.78rem;background:var(--raise)}
tr:last-child td{border-bottom:0}
td small{display:block;color:var(--faint);font-size:.74rem}
td b{color:var(--ink)}
tr.win td{background:var(--pos-soft)}
.pos{color:var(--pos)} .neg{color:var(--neg)}
.pill{display:inline-block;padding:1px 10px;border-radius:999px;font-size:.78rem;font-weight:700}
.pill.ok{background:var(--pos);color:var(--surface)} .pill.no{background:var(--raise);color:var(--muted)}
.pill.live{background:var(--m-bc);color:var(--surface)}
.findings{display:grid;gap:12px;margin:16px 0 0;padding:0;list-style:none}
.findings li{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:12px 16px}
.findings li b{color:var(--ink)}
.fig{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:14px;margin:12px 0;direction:ltr;position:relative}
.fig svg{display:block;width:100%;height:auto}
.fig .legend svg{display:inline-block;width:12px;height:12px}
.fig .cap{direction:rtl;font-size:.85rem;color:var(--muted);margin:0 0 8px}
.legend{direction:rtl;display:flex;flex-wrap:wrap;gap:6px 18px;font-size:.82rem;color:var(--body);margin:0 0 8px}
.legend i{display:inline-block;width:18px;height:2px;vertical-align:middle;margin-inline-end:6px}
.legend i.sq{width:12px;height:12px;border-radius:2px}
svg .grid{stroke:var(--grid);stroke-width:1}
svg .zero{stroke:var(--faint);stroke-width:1}
svg .tick{fill:var(--faint);font-size:11px;font-family:var(--mono)}
svg .lab{fill:var(--body);font-size:12px;font-family:var(--mono)}
svg .val{fill:var(--muted);font-size:11px;font-family:var(--mono)}
svg .barpos{fill:var(--pos)} svg .barneg{fill:var(--neg)}
svg .hov:hover .barpos,svg .hov:hover .barneg{opacity:.75}
#tip{position:absolute;pointer-events:none;background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:6px 10px;font-size:.8rem;color:var(--body);box-shadow:0 2px 8px rgba(0,0,0,.12);font-family:var(--mono);white-space:nowrap}
#tip b{color:var(--ink)}
details{margin:10px 0;background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:10px 14px}
summary{cursor:pointer;color:var(--ink);font-weight:600}
summary:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
ol.steps{display:grid;gap:6px;padding-inline-start:22px;max-width:70ch}
.code{position:relative;margin-top:12px}
.code pre{direction:ltr;text-align:left;overflow:auto;max-height:420px;background:var(--raise);border:1px solid var(--line);border-radius:6px;padding:14px;font:12px/1.55 var(--mono);color:var(--ink);margin:0}
.code button{position:absolute;top:8px;left:8px;font:600 .8rem var(--ar);background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:4px 12px;cursor:pointer}
code{font-family:var(--mono);font-size:.88em;background:var(--raise);padding:1px 5px;border-radius:3px;direction:ltr;unicode-bidi:isolate}
footer{margin-top:56px;padding-top:16px;border-top:1px solid var(--line);font-size:.82rem;color:var(--faint)}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
<div class="wrap" dir="rtl" lang="ar">
<header class="top">
  <p class="eyebrow">دراسة 6 · البروتوكول سُجّل قبل أي نتيجة · ${ltr('2026-10-08')}</p>
  <h1>نسخة مفتوحة من فكرة TBO و TBT Divergence، مختبرة على 24 عملة و311 سهماً</h1>
  <p class="lede">المؤشران الأصليان من قناة MooninPapa مغلقان ومدفوعان، فلا يمكن نسخهما حرفياً. بنيت مؤشرين مفتوحين من وصفهما المنشور، وثبّتّ كل إعداداتهما قبل الحساب، ثم قارنت كل إشارة بدخول عشوائي على نفس العملة ونفس المدة ونفس طريقة الخروج.</p>
  <div class="notice">
    <h3>هذان ليسا TBO ولا TBT Divergence</h3>
    <ul>
      <li>TBO سكربت invite-only من The Better Traders، و TBT Divergence من أدوات عضويتهم المدفوعة. الكود مخفي ولم أجد معادلاتهما منشورة في أي مكان.</li>
      <li>يوتيوب و TradingView محجوبان في بيئة العمل هذه، وليس عندك اشتراك، فلا يوجد مؤشر أصلي أقارن به.</li>
      <li>لذلك سمّيتهما FLT (خطوط الاتجاه الأربعة) و MOD (دايفرجنس متعدد المذبذبات). النتائج هنا تخصهما فقط ولا تقول شيئاً عن المؤشرين الأصليين.</li>
    </ul>
  </div>
  <div class="hero">
    <div><b>${ltr(`${passed} / ${R.rows.length}`)}</b><span>اختبارات تفوّقت على الدخول العشوائي</span></div>
    <div><b>${ltr(w(bcRow.all.win))} <small class="vs">مقابل ${ltr(w(bcRow.all.baseWin))}</small></b><span>نسبة الربح لتجمّع الاختراقات في الكريبتو (احتفاظ 20 يوماً)، مقابل دخول عشوائي</span></div>
    <div><b>${ltr(pct(bcRow.all.median))} <small class="vs">مقابل ${ltr(pct(randMedian))}</small></b><span>الصفقة الوسطى للتجمّع، مقابل الصفقة الوسطى للدخول العشوائي</span></div>
  </div>
</header>

<h2>ماذا بنيت</h2>
<p>كل سطر: ما هو منشور عن المؤشر الأصلي، وما اخترته أنا مكانه لأن المعادلة غير منشورة.</p>
<div class="tbl"><table><thead><tr><th>الوصف المنشور</th><th>اختياري في FLT / MOD</th></tr></thead><tbody>
<tr><td>أربعة خطوط: Fast و Mid Fast و Mid Slow و Slow</td><td>${ltr('EMA 20 / 50 / 100 / 200')} على الإغلاق</td></tr>
<tr><td>سحابة: فوقها صعود، داخلها تذبذب، تحتها هبوط</td><td>المنطقة بين ${ltr('EMA 50')} و ${ltr('EMA 100')}</td></tr>
<tr><td>إشارات Open Long و Close Long</td><td>${ltr('EMA 20')} تقطع ${ltr('EMA 50')} للأعلى / للأسفل</td></tr>
<tr><td>Cross Up و Cross Down</td><td>${ltr('EMA 20')} تقطع ${ltr('EMA 200')}</td></tr>
<tr><td>Breakout، و«تجمّعات» الاختراق البيضاء</td><td>إغلاق فوق أعلى سعر لآخر 20 شمعة وفوق الخطوط الأربعة؛ التجمّع = 3 من آخر 5 شموع</td></tr>
<tr><td>دايفرجنس بين السعر ومؤشرات القوة، وتجمّعها إشارة أقوى</td><td>دايفرجنس عادي على ${ltr('RSI 14')} و ${ltr('MACD')} و ${ltr('OBV')} و ${ltr('MFI 14')}؛ الإشارة تحتاج 2 من 4</td></tr>
<tr><td>«دايفرجنس ثم اختراقات» كما في مقالات الفريق</td><td>أول اختراق خلال 20 شمعة بعد إشارة MOD</td></tr>
</tbody></table></div>
<p class="muted">القاع (pivot) يحتاج 5 شموع على كل جانب، فإشارة الدايفرجنس لا تظهر إلا بعد 5 شموع من القاع. الاختبار يدخل بعد ظهورها، لا قبله، فلا يوجد غش بالنظر للمستقبل. اختبارات «القطع» في الكود تتأكد من ذلك.</p>

<h2>النتيجة</h2>
<p>شراء فقط، فريم يومي، الدخول عند افتتاح الشمعة التالية للإشارة، وعمولة ${ltr('0.10%')} لكل جهة. لكل إشارة طريقتا خروج: <b>حتى Close Long</b> (بحد أقصى 250 شمعة) أو <b>بعد 20 شمعة</b>. «التفوّق» = متوسط ربح الصفقة ناقص متوسط ربح دخول عشوائي بنفس الخروج على نفس الأصل ونفس الفترة. الإشارة <b>تتفوّق</b> إذا كان التفوّق موجباً، و p بعد تصحيح Holm لعشرين اختباراً أقل من ${ltr('0.05')}، والتفوّق موجباً قبل وبعد تاريخ القسمة.</p>
<h3>الكريبتو: ${CRYPTO6.length} عملة، القسمة ${ltr(SPLIT6.crypto)}</h3>
${table('crypto')}
<h3 style="margin-top:22px">الأسهم الأمريكية: 311 سهماً وصندوقاً، القسمة ${ltr(SPLIT6.us)}</h3>
${table('us')}

<ul class="findings">
  <li><b>الكريبتو: تجمّع الاختراقات مع احتفاظ 20 يوماً هو الناجح الوحيد.</b> ${ltr(bcRow.all.n)} صفقة، ربح ${ltr(w(bcRow.all.win))} مقابل ${ltr(w(bcRow.all.baseWin))} عشوائياً، وتفوّق موجب قبل 2022 وبعدها. على البيتكوين وحده ${ltr(`${btcWins}/${btcList.length}`)} صفقة رابحة.</li>
  <li><b>الأسهم: دايفرجنس MOD مع الخروج عند Close Long ناجح، لكن تفوّقه صغير.</b> ${ltr(pct(modRow.all.edge, 2))} للصفقة التي تستمر ${ltr(modRow.all.held.toFixed(0))} يوم تداول في المتوسط، ونسبة الربح ${ltr(w(modRow.all.win))} مقابل ${ltr(w(modRow.all.baseWin))}.</li>
  <li><b>تقاطعات الخطوط (Open Long و Cross Up) لم تنجح في أي سوق.</b> في الأسهم كانت مثل العشوائي أو أسوأ قليلاً.</li>
  <li><b>الدايفرجنس في الكريبتو، و«دايفرجنس ثم اختراق» في السوقين، لم تنجح.</b> المتوسطات الكبيرة في عمود الخروج «حتى Close Long» للكريبتو تأتي من صفقات قليلة تضاعفت في 2020–2021؛ وسيطها سالب وأغلب صفقاتها خسرت، لذلك الحكم على التفوّق والاختبار الإحصائي وليس على المتوسط.</li>
</ul>

<h2>هل النتيجة من عملة أو عملتين؟</h2>
<p>فحص أضفته بعد النتيجة (post-hoc)، للتقرير فقط ولا يغيّر الحكم: تفوّق تجمّع الاختراقات (احتفاظ 20 يوماً) لكل عملة. موجب في ${ltr(`${perCoin.filter((q) => q.edge > 0).length} من ${perCoin.length}`)} عملة، وحذف أي عملة واحدة يبقيه بين ${ltr(pct(Math.min(...loo)))} و ${ltr(pct(Math.max(...loo)))}.</p>
<div class="fig">
  <p class="cap">التفوّق على الدخول العشوائي لكل عملة · الرقم بعد النسبة = عدد الصفقات · مرّر على الشريط للتفاصيل</p>
  ${coinChart()}
</div>

<h2>الصفقات المتوسطة والطويلة</h2>
<p>ملحق سُجّلت شروطه قبل الحساب (${ltr('<code>PROTOCOL-study6-addendum-1.md</code>')}): نفس الإشارات الخمس، مع احتفاظ 3 أو 6 أو 12 شهراً، أو حتى Cross Down بحد أقصى سنتين. النتيجة: <b>${ltr(`${RL.rows.filter((r) => r.beats).length} من ${RL.rows.length}`)}</b> اختباراً تفوّق على الدخول العشوائي. في الأسهم كانت كل الإشارات مثل العشوائي أو أسوأ قليلاً. في الكريبتو المتوسطات كبيرة لكنها من صفقات قليلة في 2020–2021، والوسيط غالباً سالب.</p>
<details><summary>الجدول الكامل: 40 اختباراً</summary>
<h3 style="margin-top:12px">الكريبتو</h3>
${table('crypto', RL.rows)}
<h3 style="margin-top:12px">الأسهم الأمريكية</h3>
${table('us', RL.rows)}
</details>
<p>ما نجح فعلاً للمدى المتوسط والطويل في دراسات هذا المشروع:</p>
<ul class="findings">
  <li><b>طويلة، سنة: L52.</b> RSI(14) الأسبوعي يرجع فوق 30، والاحتفاظ 52 أسبوعاً (دراسة 5). على ${ltr('539')} صفقة في أسهم لم تُستخدم في البحث: ربح ${ltr('75.9%')} مقابل ${ltr('65.3%')} عشوائياً، والصفقة الوسطى ${ltr('+19%')}. التفوّق قبل 2018 كان ${ltr('+2.6%')} فقط. أضفتها للمؤشر كعلامة L52.</li>
  <li><b>متوسطة إلى طويلة، 6 أشهر:</b> نفس L52 مع احتفاظ 26 أسبوعاً: ربح ${ltr('65.5%')} مقابل ${ltr('61.7%')}، وتفوّق ${ltr('+3.4%')}.</li>
  <li><b>متوسطة، نحو 4–5 أشهر:</b> DIV ثم الخروج عند CL في الأسهم: تفوّق صغير ${ltr('+1.75%')} للصفقة.</li>
</ul>

<h2>البيتكوين مع FLT و MOD</h2>
<div class="fig" id="btcfig">
  <div class="legend"><span><i style="background:var(--ink)"></i>سعر الإغلاق (لوغاريتمي)</span><span><i style="background:var(--l-fast)"></i>Fast · EMA 20</span><span><i style="background:var(--l-slow)"></i>Slow · EMA 200</span><span><i class="sq" style="background:var(--cloud-up);border:1px solid var(--pos)"></i>السحابة EMA 50–100</span><span><svg width="12" height="12" viewBox="0 0 12 12" style="vertical-align:middle;margin-inline-end:6px"><path d="M6 0L12 6L6 12L0 6Z" fill="var(--m-bc)"/></svg>تجمّع اختراقات BC</span><span><svg width="12" height="12" viewBox="0 0 12 12" style="vertical-align:middle;margin-inline-end:6px"><path d="M6 0L12 12L0 12Z" fill="var(--m-mod)"/></svg>دايفرجنس MOD</span></div>
  <svg id="btc" viewBox="0 0 900 400" role="img" aria-label="سعر البيتكوين اليومي منذ 2023 مع خطوط FLT وإشارات BC و MOD"></svg>
  <div id="tip" hidden></div>
</div>
<details><summary>كل صفقات تجمّع الاختراقات على البيتكوين (احتفاظ 20 يوماً)</summary>
<div class="tbl"><table><thead><tr><th>يوم الإشارة</th><th>يوم البيع</th><th>العائد</th></tr></thead><tbody>
${btcList.map((t) => `<tr><td>${ltr(t.signal)}</td><td>${ltr(t.exit)}</td><td class="${t.ret >= 0 ? 'pos' : 'neg'}">${ltr(pct(t.ret))}</td></tr>`).join('')}
</tbody></table></div></details>

<h2>الإشارات الآن</h2>
<p>آخر شمعة يومية مخزّنة لكل عملة. ليست توصية. «نافذة مفتوحة» تعني أن تجمّع اختراقات ظهر خلال آخر 20 شمعة، أي أن صفقة القاعدة المختبرة ما زالت داخل مدتها.</p>
<div class="tbl"><table><thead><tr><th>العملة</th><th>آخر شمعة</th><th>آخر BC</th><th></th><th>آخر MOD</th><th>EMA 20 فوق 50</th><th>السعر و السحابة</th></tr></thead><tbody>
${today.map((t) => `<tr><td><b>${t.sym}</b></td><td>${ltr(t.lastDate)}</td><td>${ltr(t.bc)}</td><td>${t.bcAgo <= 20 ? '<span class="pill live">نافذة مفتوحة</span>' : ''}</td><td>${ltr(t.md)}</td><td>${t.trend ? 'نعم' : 'لا'}</td><td>${t.cloud}</td></tr>`).join('')}
</tbody></table></div>

<h2>على TradingView</h2>
<ol class="steps">
  <li>افتح Pine Editor أسفل الشارت، احذف ما فيه، والصق الكود التالي، ثم Add to chart.</li>
  <li>يشتغل على كل الفريمات (كل القواعد بعدد الشموع لا بالأيام). الباك تيست تم على اليومي فقط، فنتائج الفريمات الأخرى لم تُختبر بعد.</li>
  <li>الألوان قابلة للتغيير من Settings ← Colours، والقيم الافتراضية مختارة لتناسب شموع ذهبية ورمادية على خلفية داكنة. تغيير الألوان لا يغيّر أي إشارة.</li>
  <li>لا توجد إعدادات للأطوال عمداً: تغييرها يجعل الشارت مختلفاً عن المؤشر الذي اختُبر.</li>
  <li>للتأكد أن الشارت يطابق الباك تيست ${ltr('100%')}: من قائمة الشارت اختر Export chart data، وأرسل لي الملف. السكربت ${ltr('<code>scripts/study6-verify.js</code>')} يقارن كل إشارة في كل شمعة ويذكر أي اختلاف. لم أستطع تشغيل الكود داخل TradingView من هنا، فالتطابق لم يُقَس بعد.</li>
</ol>
<div class="code"><button type="button" id="copy">نسخ الكود</button><pre id="pine">${esc(pine)}</pre></div>

<h2>مقارنة مع تواريخ TBO المنشورة</h2>
<p>المقارنة الوحيدة الممكنة بدون اشتراك: تواريخ إشارات TBO على البيتكوين اليومي كما ذكرها الشريك المؤسس لـ The Better Traders في مقالاته على Kitco، مقابل إشارات FLT. التواريخ من ملخصات البحث (موقع Kitco محجوب هنا) وهي تواريخ مقالات أو أشهر، لا شموع محددة. هذه ليست قياساً للتطابق، ولم أعدّل أي إعداد لتقريب التواريخ.</p>
<div class="tbl"><table><thead><tr><th>ما ذكروه عن TBO</th><th>FLT على البيتكوين اليومي</th><th>التوافق</th></tr></thead><tbody>
<tr><td>تجمّع اختراق يومي، نوفمبر 2023</td><td>BC ${ltr('2023-12-03')} (الاختراقات من 1 نوفمبر)</td><td>متأخر بأسابيع</td></tr>
<tr><td>تجمّع اختراق يومي، فبراير 2024</td><td>BC ${ltr('2024-02-09')}</td><td>نفس الشهر</td></tr>
<tr><td>تجمّع اختراق يومي، نوفمبر 2024</td><td>BC ${ltr('2024-11-13')}</td><td>نفس الشهر</td></tr>
<tr><td>تجمّع اختراق يومي، مقال ${ltr('2025-05-20')}</td><td>BC ${ltr('2025-05-22')}</td><td>بعده بيومين</td></tr>
<tr><td>Breakdown، مقالا ${ltr('2025-11-04')} و ${ltr('2025-11-18')}</td><td>BD ${ltr('2025-11-21')}</td><td>بعده بـ 3 أيام أو أكثر</td></tr>
<tr><td>تجمّع «بدأ 31 يناير» 2026 (جهة الهبوط)</td><td>شموع كسر في 25 و 29 و 31 يناير، بدون تجمّع BD</td><td>الشمعة تطابق، التجمّع لا</td></tr>
<tr><td>Breakdown جديد، مقال ${ltr('2026-06-05')}</td><td>BD ${ltr('2026-06-03')}</td><td>قبله بيومين</td></tr>
</tbody></table></div>
<p class="muted">الخلاصة: نفس الحركات تقريباً، و FLT غالباً أبطأ من TBO ببضعة أيام. FLT طلع أيضاً BC في ${ltr('2024-03-01')} و ${ltr('2024-07-19')} و ${ltr('2025-07-11')} و ${ltr('2025-10-03')}، ولا نعرف هل طلع TBO فيها.</p>

<h2>حدود الدراسة</h2>
<ul class="findings">
  <li>كل العملات والأسهم هنا كبيرة <b>اليوم</b>، وهذا يجمّل أي شراء. الدخول العشوائي يحمل نفس الانحياز، ولهذا المقياس هو التفوّق عليه وليس الربح نفسه.</li>
  <li>تاريخ الكريبتو قصير (أغلب أزواج Binance تبدأ 2017–2021) وتسيطر عليه موجات صعود قليلة. الفترة بعد 2022 هي الفحص على ذلك، والنتيجة صمدت فيها.</li>
  <li>الشراء فقط. البيع على المكشوف لم يُختبر.</li>
  <li>المؤشران الأصليان قد يختلفان تماماً عن FLT و MOD.</li>
</ul>

<footer>
  البروتوكول ${ltr('<code>PROTOCOL-study6.md</code>')} · المحرك ${ltr('<code>engine/study6.js</code>')} · النتائج ${ltr('<code>reports/study6.txt</code>')} · الفحص اللاحق ${ltr('<code>reports/study6-posthoc.txt</code>')} · ${ltr('mdt-signal-dashboard')}
</footer>
</div>
<script>
const D = ${JSON.stringify(chart)};
(function () {
  const svg = document.getElementById('btc'), tip = document.getElementById('tip'), fig = document.getElementById('btcfig')
  const W = 900, H = 400, L = 56, Rr = 12, T = 12, B = 30, n = D.d.length
  const vals = [...D.c, ...D.s.filter(Number.isFinite), ...D.ms.filter(Number.isFinite)]
  const lo = Math.log(Math.min(...vals) * 0.9), hi = Math.log(Math.max(...vals) * 1.08)
  const sx = (i) => L + (i / (n - 1)) * (W - L - Rr), sy = (v) => T + (1 - (Math.log(v) - lo) / (hi - lo)) * (H - T - B)
  const ns = 'http://www.w3.org/2000/svg'
  const el = (t, a) => { const e = document.createElementNS(ns, t); for (const k in a) e.setAttribute(k, a[k]); svg.appendChild(e); return e }
  for (const v of [10000, 15000, 20000, 30000, 40000, 50000, 70000, 100000, 150000]) {
    if (Math.log(v) < lo || Math.log(v) > hi) continue
    el('line', { x1: L, x2: W - Rr, y1: sy(v), y2: sy(v), class: 'grid' })
    el('text', { x: L - 6, y: sy(v) + 4, class: 'tick', 'text-anchor': 'end' }).textContent = v >= 1000 ? (v / 1000) + 'k' : v
  }
  D.d.forEach((d, i) => { if (i > 0 && d.slice(5, 7) !== D.d[i - 1].slice(5, 7) && /^(01|07)$/.test(d.slice(5, 7))) {
    el('line', { x1: sx(i), x2: sx(i), y1: T, y2: H - B, class: 'grid' })
    el('text', { x: sx(i), y: H - 10, class: 'tick', 'text-anchor': 'middle' }).textContent = d.slice(0, 7)
  } })
  // cloud: one polygon per run where EMA 50 stays above (or below) EMA 100
  let k = 0
  while (k < n) {
    const up = D.mf[k] >= D.ms[k]; let j = k
    while (j + 1 < n && (D.mf[j + 1] >= D.ms[j + 1]) === up) j += 1
    const top = [], bot = []
    for (let i = k; i <= Math.min(j + 1, n - 1); i += 1) { top.push(sx(i) + ',' + sy(D.mf[i])); bot.unshift(sx(i) + ',' + sy(D.ms[i])) }
    el('polygon', { points: top.concat(bot).join(' '), fill: up ? 'var(--cloud-up)' : 'var(--cloud-dn)', stroke: 'none' })
    k = j + 1
  }
  const path = (a) => a.map((v, i) => (i ? 'L' : 'M') + sx(i).toFixed(1) + ' ' + sy(v).toFixed(1)).join('')
  el('path', { d: path(D.s), fill: 'none', stroke: 'var(--l-slow)', 'stroke-width': 2 })
  el('path', { d: path(D.f), fill: 'none', stroke: 'var(--l-fast)', 'stroke-width': 2 })
  el('path', { d: path(D.c), fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.25 })
  D.bc.forEach((b, i) => { if (b) { const x = sx(i), y = sy(D.c[i]) - 14; el('path', { d: 'M' + x + ' ' + (y - 6) + 'L' + (x + 6) + ' ' + y + 'L' + x + ' ' + (y + 6) + 'L' + (x - 6) + ' ' + y + 'Z', fill: 'var(--m-bc)', stroke: 'var(--surface)', 'stroke-width': 2 }) } })
  D.mod.forEach((m, i) => { if (m) { const x = sx(i), y = sy(D.c[i]) + 16; el('path', { d: 'M' + x + ' ' + (y - 6) + 'L' + (x + 6) + ' ' + (y + 6) + 'L' + (x - 6) + ' ' + (y + 6) + 'Z', fill: 'var(--m-mod)', stroke: 'var(--surface)', 'stroke-width': 2 }) } })
  const cross = el('line', { x1: 0, x2: 0, y1: T, y2: H - B, stroke: 'var(--faint)', 'stroke-width': 1, 'stroke-dasharray': '3 3', visibility: 'hidden' })
  const dot = el('circle', { r: 4, fill: 'var(--ink)', stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' })
  const hit = el('rect', { x: L, y: T, width: W - L - Rr, height: H - T - B, fill: 'transparent' })
  const fmt = (v) => Number.isFinite(v) ? '$' + Math.round(v).toLocaleString('en-US') : '—'
  function move(ev) {
    const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W
    const i = Math.max(0, Math.min(n - 1, Math.round((px - L) / (W - L - Rr) * (n - 1))))
    cross.setAttribute('x1', sx(i)); cross.setAttribute('x2', sx(i)); cross.setAttribute('visibility', 'visible')
    dot.setAttribute('cx', sx(i)); dot.setAttribute('cy', sy(D.c[i])); dot.setAttribute('visibility', 'visible')
    const sig = (D.bc[i] ? ' · <b>BC</b>' : '') + (D.mod[i] ? ' · <b>MOD</b>' : '')
    tip.innerHTML = '<b>' + D.d[i] + '</b>' + sig + '<br>close ' + fmt(D.c[i]) + '<br>EMA20 ' + fmt(D.f[i]) + ' · EMA200 ' + fmt(D.s[i])
    tip.hidden = false
    const fr = fig.getBoundingClientRect(), x = ev.clientX - fr.left, y = ev.clientY - fr.top
    tip.style.left = Math.min(Math.max(8, x + 14), fr.width - tip.offsetWidth - 8) + 'px'
    tip.style.top = Math.max(8, y - tip.offsetHeight - 12) + 'px'
  }
  hit.addEventListener('pointermove', move)
  hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden') })
})()
document.getElementById('copy').addEventListener('click', async (e) => {
  const b = e.currentTarget, text = document.getElementById('pine').textContent
  try { await navigator.clipboard.writeText(text); b.textContent = 'تم النسخ' }
  catch { const r = document.createRange(); r.selectNodeContents(document.getElementById('pine')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'محدد — اضغط Ctrl+C' }
  setTimeout(() => { b.textContent = 'نسخ الكود' }, 2500)
})
</script>
`
fs.writeFileSync('study6.html', html)
console.log(`study6.html ${(html.length / 1024).toFixed(0)} KB`)
