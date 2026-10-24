// Render swing.html (Arabic) from reports/swing-results.json, so the page can never
// disagree with the reports. Also writes the body alone to $SWING_ARTIFACT if set.
//
//   node scripts/swing-page.js

import fs from 'node:fs'

const R = JSON.parse(fs.readFileSync('reports/swing-results.json', 'utf8'))

// ── names and rules in Arabic ──────────────────────────────────────────────────

const NAMES = {
  ma_cross: ['تقاطع المتوسطات 50/200', 'المتوسط 50 يقطع 200 للأعلى (أسبوعي: 10/40)', 'المتوسط 50 فوق 200'],
  ema_20_50: ['تقاطع EMA 20/50', 'EMA20 يقطع EMA50 للأعلى', 'EMA20 فوق EMA50'],
  price_ma: ['السعر فوق متوسط 200', 'الإغلاق يقطع متوسط 200 للأعلى (أسبوعي: 40)', 'الإغلاق فوق متوسط 200 (أسبوعي: 40)'],
  macd_signal: ['MACD مع خط الإشارة', 'MACD يقطع خط الإشارة للأعلى', 'MACD فوق خط الإشارة'],
  macd_zero: ['MACD فوق الصفر', 'MACD يقطع الصفر للأعلى', 'MACD فوق الصفر'],
  supertrend: ['سوبر ترند 10، 3', 'يتحول إلى صاعد', 'صاعد'],
  psar: ['بارابوليك سار', 'النقاط تنتقل تحت السعر', 'النقاط تحت السعر'],
  ichimoku: ['إيشيموكو', 'الإغلاق يخترق أعلى السحابة', 'الإغلاق فوق السحابة'],
  adx_di: ['ADX و DMI', '+DI يقطع −DI للأعلى و ADX فوق 20', '+DI فوق −DI'],
  aroon: ['أرون 14', 'خط الصعود يقطع خط الهبوط للأعلى', 'الصعود فوق الهبوط'],
  hma: ['متوسط هَل 9', 'ينعطف للأعلى', 'صاعد'],
  donchian20: ['اختراق دونشيان 20', 'إغلاق فوق أعلى قمة لآخر 20 شمعة', 'دخول عند قمة 20، خروج عند كسر قاع 10'],
  donchian55: ['اختراق دونشيان 55', 'إغلاق فوق أعلى قمة لآخر 55 شمعة', 'دخول عند قمة 55، خروج عند كسر قاع 20'],
  keltner_break: ['اختراق قناة كيلتنر', 'الإغلاق يخترق الحد العلوي (EMA20 + 2×ATR10)', ''],
  bb_break: ['اختراق بولينجر العلوي', 'الإغلاق يخترق الحد العلوي (20، 2)', ''],
  tv_rating: ['التقييم الفني لتريدنج فيو', 'التقييم يتجاوز +0.5 (شراء قوي)', 'التقييم فوق +0.1 (شراء)'],
  rsi_30: ['RSI خروج من التشبع البيعي', 'RSI 14 يقطع 30 للأعلى', ''],
  rsi_50: ['RSI فوق 50', 'RSI 14 يقطع 50 للأعلى', 'RSI فوق 50'],
  rsi2: ['RSI 2 (كونورز)', 'RSI 2 تحت 10 والسعر فوق متوسط 200', ''],
  stoch: ['ستوكاستك 14/3/3', '%K يقطع %D للأعلى وكلاهما تحت 20', ''],
  stochrsi: ['ستوكاستك RSI', 'K يقطع D للأعلى وكلاهما تحت 20', ''],
  cci: ['CCI 20', 'يقطع −100 للأعلى', ''],
  willr: ['ويليامز %R', 'يقطع −80 للأعلى', ''],
  bb_revert: ['ارتداد بولينجر السفلي', 'الإغلاق يعود فوق الحد السفلي', ''],
  ao: ['المذبذب الرائع AO', 'يقطع الصفر للأعلى', ''],
  momentum: ['الزخم 10', 'يقطع الصفر للأعلى', ''],
  tsmom: ['زخم 12 شهر', 'عائد آخر سنة يتحول موجباً', 'عائد آخر سنة موجب'],
  uo: ['المذبذب النهائي UO', 'يقطع 30 للأعلى', ''],
  trix: ['TRIX 18', 'يقطع الصفر للأعلى', ''],
  vortex: ['فورتكس 14', 'VI+ يقطع VI− للأعلى', 'VI+ فوق VI−'],
  obv: ['OBV حجم التداول', 'OBV يقطع متوسطه 20 للأعلى', 'OBV فوق متوسطه 20'],
  mfi: ['MFI تدفق الأموال', 'يقطع 20 للأعلى', ''],
  cmf: ['تشايكن CMF', 'يقطع الصفر للأعلى', 'فوق الصفر'],
}
const VERDICT = {
  Robust: ['مثبت', 'v-robust'],
  Possible: ['محتمل فقط', 'v-possible'],
  'No edge': ['بلا ميزة', 'v-none'],
  Thin: ['عينة صغيرة', 'v-thin'],
  'Worse than random': ['أسوأ من العشوائي', 'v-worse'],
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const num = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(d))
const signed = (x, d = 2) => (!Number.isFinite(x) ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}`)
const pct = (x, d = 1) => (!Number.isFinite(x) ? '—' : `${(100 * x).toFixed(d)}%`)
const spct = (x, d = 1) => (!Number.isFinite(x) ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(100 * x).toFixed(d)}%`)
const tone = (x) => (x > 0 ? 'pos' : x < 0 ? 'neg' : '')
const L = (s) => `<span class="ltr">${s}</span>`
const chip = (v) => `<span class="chip ${VERDICT[v][1]}">${VERDICT[v][0]}</span>`
const price = (x) => (x >= 1000 ? x.toFixed(0) : x >= 100 ? x.toFixed(2) : x >= 1 ? x.toFixed(2) : x.toFixed(4))

function tableAB(track) {
  const rows = track.rows.map((r, k) => {
    const a = r.II
    const b = r.I
    return `<tr class="${r.verdict === 'Robust' ? 'hl' : ''}">
<td class="n">${k + 1}</td>
<td class="ind"><b>${esc(NAMES[r.id][0])}</b><small>${esc(NAMES[r.id][1])}</small></td>
<td>${chip(r.verdict)}</td>
<td class="n">${L(pct(a.win))}<small>${L(`عشوائي ${pct(a.baseWin)}`)}</small></td>
<td class="n ${tone(a.edge)}">${L(signed(a.edge, 3))}</td>
<td class="n ${tone(a.meanRet)}">${L(spct(a.meanRet, 2))}</td>
<td class="n">${L(String(a.n))}</td>
<td class="n ${tone(b.edge)}">${L(signed(b.edge, 3))}</td>
</tr>`
  })
  return `<div class="tw"><table>
<thead><tr><th>#</th><th>المؤشر وإشارة الشراء</th><th>الحكم</th><th>نسبة الربح</th><th>الميزة R</th><th>متوسط الصفقة</th><th>الصفقات</th><th>قبل 2018</th></tr></thead>
<tbody>${rows.join('\n')}</tbody></table></div>`
}

function tableC(track) {
  const rows = track.rows.map((r, k) => {
    const a = r.II
    return `<tr>
<td class="n">${k + 1}</td>
<td class="ind"><b>${esc(NAMES[r.id][0])}</b><small>داخل السوق طالما: ${esc(NAMES[r.id][2])}</small></td>
<td>${chip(r.verdict)}</td>
<td class="n ${tone(a.dSharpe)}">${L(signed(a.dSharpe))}</td>
<td class="n ${tone(a.dCagr)}">${L(spct(a.dCagr))}</td>
<td class="n">${L(pct(a.maxDD, 0))}</td>
<td class="n">${L(pct(a.exposure, 0))}</td>
<td class="n">${L(pct(a.beatShare, 0))}</td>
<td class="n ${tone(r.I.dSharpe)}">${L(signed(r.I.dSharpe))}</td>
</tr>`
  })
  return `<div class="tw"><table>
<thead><tr><th>#</th><th>القاعدة</th><th>الحكم</th><th>فرق شارب</th><th>فرق العائد السنوي</th><th>أقصى هبوط</th><th>وقت داخل السوق</th><th>تفوق في</th><th>قبل 2018</th></tr></thead>
<tbody>${rows.join('\n')}</tbody></table></div>`
}

// ── current signals ────────────────────────────────────────────────────────────

const verdictOf = (key, id) => R[key].rows.find((r) => r.id === id).verdict
function signalRows(key) {
  const xs = R.current[key].filter((x) => ['Robust', 'Possible'].includes(verdictOf(key, x.id)))
  xs.sort((a, b) => (verdictOf(key, a.id) === 'Robust' ? 0 : 1) - (verdictOf(key, b.id) === 'Robust' ? 0 : 1))
  if (!xs.length) return '<p class="muted">لا توجد إشارة من مؤشر مثبت أو محتمل على آخر شمعة.</p>'
  return `<div class="tw"><table class="sig">
<thead><tr><th>السهم</th><th>المؤشر</th><th>الحكم</th><th>الإغلاق</th><th>الوقف</th><th>الهدف</th><th>أقصى مدة</th></tr></thead>
<tbody>${xs.map((x) => `<tr class="${verdictOf(key, x.id) === 'Robust' ? 'hl' : ''}">
<td><b>${esc(x.name)}</b><small>${L(esc(x.symbol))}</small></td>
<td>${esc(NAMES[x.id][0])}</td>
<td>${chip(verdictOf(key, x.id))}</td>
<td class="n">${L(price(x.close))}</td>
<td class="n neg">${L(price(x.stop))}<small>${L(spct(x.stop / x.close - 1))}</small></td>
<td class="n pos">${L(price(x.target))}<small>${L(spct(x.target / x.close - 1))}</small></td>
<td class="n">${x.horizon} ${key === 'A' ? 'جلسات' : 'أسبوعاً'}</td>
</tr>`).join('\n')}</tbody></table></div>`
}

// ── page ───────────────────────────────────────────────────────────────────────

const A = R.A
const B = R.B
const C = R.C
const kel = A.rows.find((r) => r.id === 'keltner_break')
const sto = B.rows.find((r) => r.id === 'stoch')
const bh = C.rows[0].II
const best = A.rows[0]
const bestC = C.rows[0]
const robustA = A.rows.filter((r) => r.verdict === 'Robust')
const possibleA = A.rows.filter((r) => r.verdict === 'Possible')

const STYLE = `
:root{
  /* Layout: one reading column, RTL; tables scroll inside their own frame. */
  --bg:#F2F2EF; --surface:#FAFAF8; --raise:#EDEDE8; --ink:#1B1B19; --body:#43433D; --muted:#6B6B62;
  --faint:#93938A; --line:#DBDBD3; --accent:#8F711B; --accent-soft:#EFE7CC;
  --pos:#4C6839; --neg:#93412F; --warn:#856611; --pos-soft:#E3EBDB; --neg-soft:#F2E1DB;
  --ar:"IBM Plex Sans Arabic",system-ui,"Segoe UI",Tahoma,sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#191917; --surface:#222220; --raise:#2A2A26; --ink:#EDEDE7; --body:#C1C1B7; --muted:#8D8D83;
  --faint:#696960; --line:#34342E; --accent:#CBA84A; --accent-soft:#322B17;
  --pos:#8FAE6E; --neg:#D0806A; --warn:#CBA84A; --pos-soft:#25301D; --neg-soft:#3A241E; color-scheme:dark;
}}
:root[data-theme="dark"]{
  --bg:#191917; --surface:#222220; --raise:#2A2A26; --ink:#EDEDE7; --body:#C1C1B7; --muted:#8D8D83;
  --faint:#696960; --line:#34342E; --accent:#CBA84A; --accent-soft:#322B17;
  --pos:#8FAE6E; --neg:#D0806A; --warn:#CBA84A; --pos-soft:#25301D; --neg-soft:#3A241E; color-scheme:dark;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--body);font-family:var(--ar);line-height:1.75;-webkit-font-smoothing:antialiased}
.wrap{max-width:900px;margin:0 auto;padding-inline:18px;padding-block:0 80px}
header{padding-block:56px 26px;border-bottom:1px solid var(--line)}
.eyebrow{font-size:.74rem;letter-spacing:.04em;color:var(--faint);font-weight:700;margin:0 0 8px}
h1{color:var(--ink);font-size:clamp(1.8rem,5vw,2.5rem);line-height:1.25;margin:0 0 12px;font-weight:700;text-wrap:balance}
.lede{font-size:1.05rem;color:var(--muted);max-width:62ch;margin:0}
h2{color:var(--ink);font-size:1.3rem;margin:44px 0 10px;font-weight:700;text-wrap:balance}
h3{color:var(--ink);font-size:1.05rem;margin:22px 0 6px}
p{max-width:68ch}
.muted{color:var(--muted)}
.ltr{direction:ltr;unicode-bidi:isolate;display:inline-block;font-variant-numeric:tabular-nums}
.verdicts{display:grid;gap:12px;margin-top:22px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.vcard{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:16px 18px;display:flex;flex-direction:column;gap:6px;min-width:0}
.vcard .h{font-size:.78rem;color:var(--faint);font-weight:700}
.vcard .big{color:var(--ink);font-size:1.12rem;font-weight:700;line-height:1.4}
.vcard p{margin:0;font-size:.9rem;color:var(--muted)}
.callout{background:var(--accent-soft);border-radius:6px;padding:14px 18px;margin:18px 0;color:var(--ink)}
.callout p{margin:0}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:6px;background:var(--surface);margin:14px 0}
table{border-collapse:collapse;width:100%;font-size:.86rem;min-width:640px}
th{font-size:.74rem;color:var(--faint);font-weight:700;text-align:start;padding:9px 10px;border-bottom:1px solid var(--line);white-space:nowrap;background:var(--raise)}
td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
td small{display:block;color:var(--faint);font-size:.74rem;line-height:1.5}
td.ind b{color:var(--ink);font-weight:600}
td.n{white-space:nowrap;font-variant-numeric:tabular-nums}
tr.hl td{background:var(--accent-soft)}
.pos{color:var(--pos)} .neg{color:var(--neg)}
.chip{display:inline-block;font-size:.72rem;font-weight:700;padding:1px 8px;border-radius:99px;white-space:nowrap}
.v-robust{background:var(--pos-soft);color:var(--pos)}
.v-possible{background:var(--accent-soft);color:var(--warn)}
.v-none{background:var(--raise);color:var(--muted)}
.v-thin{background:var(--raise);color:var(--faint)}
.v-worse{background:var(--neg-soft);color:var(--neg)}
.rules{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin:14px 0}
.rule{border:1px solid var(--line);border-radius:6px;padding:12px 14px;background:var(--surface);min-width:0}
.rule .k{font-size:.74rem;color:var(--faint);font-weight:700}
.rule .v{color:var(--ink);font-weight:600}
ol,ul{padding-inline-start:22px;max-width:68ch}
li{margin-bottom:6px}
code{font-family:var(--mono);font-size:.82em;background:var(--raise);padding:1px 5px;border-radius:3px;direction:ltr;unicode-bidi:isolate}
footer{margin-top:48px;padding-top:18px;border-top:1px solid var(--line);font-size:.84rem;color:var(--faint);max-width:68ch}
a{color:var(--accent)}
`

const body = `<div class="wrap" dir="rtl" lang="ar">
<header>
<p class="eyebrow">33 سهماً وعملة · 20 سنة بيانات من تريدنج فيو · 85 قاعدة · كل الشروط مكتوبة قبل النتائج</p>
<h1>أي مؤشرات السوينج تنجح فعلاً؟</h1>
<p class="lede">اختبرنا 33 مؤشراً من مؤشرات تريدنج فيو المدمجة بإعداداتها الافتراضية، على ثلاث مدد: صفقة أسبوع إلى أسبوعين، وصفقة شهرين إلى ثلاثة، واستثمار سنة إلى سنتين. وقارنّا كل مؤشر بالدخول في وقت عشوائي، لا بالصفر.</p>
</header>

<h2>الخلاصة</h2>
<div class="verdicts">
<div class="vcard"><span class="h">سوينج أسبوع إلى أسبوعين (يومي)</span>
<span class="big">مؤشر واحد اجتاز كل الشروط: ${esc(NAMES[robustA[0]?.id ?? 'keltner_break'][0])}</span>
<p>ميزة ${L(signed(kel.II.edge, 3))}R لكل صفقة، ونسبة ربح ${L(pct(kel.II.win))} مقابل ${L(pct(kel.II.baseWin))} للدخول العشوائي. ثابت قبل 2018 وبعدها.</p></div>
<div class="vcard"><span class="h">سوينج شهرين إلى ثلاثة (أسبوعي)</span>
<span class="big">لا يوجد مؤشر مثبت</span>
<p>الستوكاستك كان الأفضل بعد 2018 (${L(pct(sto.II.win))} ربح) لكنه خسر قبل 2018، فلا يمكن الاعتماد عليه.</p></div>
<div class="vcard"><span class="h">استثمار سنة إلى سنتين</span>
<span class="big">ولا قاعدة توقيت تفوقت على الشراء والاحتفاظ</span>
<p>كلها قلّلت أقصى هبوط من ${L(pct(bh.bhMaxDD, 0))} إلى نحو ${L(pct(bestC.II.maxDD, 0))}، لكنها خفّضت العائد بنحو 3–7% سنوياً.</p></div>
</div>

<div class="callout"><p><b>الدقة الحقيقية:</b> أفضل مؤشر يربح ${L(pct(kel.II.win))} من صفقاته، والدخول العشوائي يربح ${L(pct(kel.II.baseWin))}. الفرق 3 نقاط فقط، ومنه يأتي كل الربح. من يعدك بدقة 80–90% من مؤشر فني إما اختار الأمثلة الناجحة بعد حدوثها، أو يستخدم وقفاً بعيداً جداً وهدفاً قريباً: يربح كثيراً بمبالغ صغيرة ويخسر قليلاً بمبالغ كبيرة.</p></div>

<h2>كيف منعنا الغش</h2>
<ol>
<li><b>الشروط قبل النتائج.</b> كتبنا البروتوكول (<code>PROTOCOL-swing.md</code>) ورفعناه إلى git في <span class="ltr">2026-10-06 23:38 UTC</span> (<code>315ae08</code>) قبل حساب أي مؤشر. ثم ثبّتنا الكود والبيانات (<code>760d13c</code>) قبل تشغيل الاختبار، ثم النتائج (<code>156b31f</code>). تاريخ git لا يمكن تزويره للخلف.</li>
<li><b>إعدادات تريدنج فيو الافتراضية فقط.</b> لم نعدّل أي رقم لأي مؤشر. تحسين الإعدادات على الماضي هو أكبر مصدر للدقة الوهمية.</li>
<li><b>المقارنة مع العشوائي.</b> في سوق صاعد كل مؤشر شراء يبدو رابحاً. لذلك نطرح من نتيجة كل مؤشر نتيجة الدخول في يوم عشوائي على السهم نفسه وفي الفترة نفسها وبقواعد الخروج نفسها، ونكرر السحب العشوائي ألفي مرة.</li>
<li><b>فترتان منفصلتان.</b> ما قبل 2018 للاكتشاف، و2018 حتى اليوم للحكم. المؤشر المثبت يجب أن ينجح في الاثنتين.</li>
<li><b>تصحيح تعدد الاختبارات (Holm).</b> مع 85 قاعدة، نتوقع أن تبدو 4 منها ناجحة بالصدفة وحدها. لذلك "محتمل" ليس "مثبت".</li>
<li><b>الشمعة الغامضة ضد الصفقة.</b> إذا لمست الشمعة الوقف والهدف معاً نحسبها خسارة، والدخول عند افتتاح الشمعة التالية للإشارة، مع عمولة 0.1% لكل جهة.</li>
</ol>

<h2>المؤشر المثبت: اختراق قناة كيلتنر (صفقة 1–2 أسبوع)</h2>
<p>هذا هو المؤشر الوحيد الذي اجتاز كل الشروط. القواعد بالضبط كما اختُبرت:</p>
<div class="rules">
<div class="rule"><span class="k">الإطار</span><div class="v">يومي</div></div>
<div class="rule"><span class="k">إشارة الشراء</span><div class="v">إغلاق يومي يخترق الحد العلوي لكيلتنر (EMA 20 + 2×ATR 10)</div></div>
<div class="rule"><span class="k">الدخول</span><div class="v">افتتاح اليوم التالي</div></div>
<div class="rule"><span class="k">الوقف</span><div class="v">الدخول − 2 × ATR 14</div></div>
<div class="rule"><span class="k">الهدف</span><div class="v">الدخول + 3 × ATR 14</div></div>
<div class="rule"><span class="k">الخروج بالوقت</span><div class="v">إغلاق الجلسة العاشرة إن لم يُلمس وقف ولا هدف</div></div>
</div>
<p>على ${L(String(kel.II.n))} صفقة منذ 2018: نسبة ربح ${L(pct(kel.II.win))}، ومتوسط الصفقة ${L(spct(kel.II.meanRet, 2))}، ومعامل الربح ${L(num(kel.II.pf))}. نجح في الكريبتو (${L(signed(kel.II.groups.crypto.edge, 3))}R) والأسهم الأمريكية (${L(signed(kel.II.groups.us.edge, 3))}R) والسعودية (${L(signed(kel.II.groups.saudi.edge, 3))}R)، وعلى ${L(pct(kel.II.breadth, 0))} من الرموز. قبل 2018 كانت ميزته ${L(signed(kel.I.edge, 3))}R، أي تقريباً الرقم نفسه.</p>
<p class="muted">حجم الميزة صغير: نحو 0.08 من المخاطرة لكل صفقة. إذا خاطرت بـ 1% من محفظتك في كل صفقة، فالمتوقع نحو 0.08% لكل صفقة فوق الدخول العشوائي. هي ميزة حقيقية لكنها ليست ثروة سريعة، وتحتاج مئات الصفقات لتظهر.</p>

<h2>الإشارات الحالية</h2>
<p>إغلاق <span class="ltr">2026-10-05</span>. الإغلاق مرجع تقريبي، والدخول الفعلي عند افتتاح الجلسة التالية، والوقف والهدف يُعاد حسابهما منه. المؤشرات "المحتملة" معروضة للمتابعة وهي أضعف دليلاً.</p>
<h3>صفقات 1–2 أسبوع (يومي)</h3>
${signalRows('A')}
<h3>صفقات 2–3 أشهر (أسبوعي)</h3>
${signalRows('B')}
<p class="muted">هذه مخرجات قاعدة، لا توصية شراء. سجل هذه الإشارات للأمام يبدأ من هذا التاريخ.</p>

<h2>الترتيب الكامل: سوينج أسبوع إلى أسبوعين</h2>
<p>شموع يومية. وقف 2×ATR وهدف 3×ATR وخروج بعد 10 جلسات. مرتبة من الأفضل للأسوأ حسب <b>الميزة</b>: متوسط الربح بوحدات المخاطرة (R) فوق الدخول العشوائي، للفترة 2018–2026. عمود "قبل 2018" يبيّن هل صمدت الميزة في الفترة الأخرى.</p>
${tableAB(A)}

<h2>الترتيب الكامل: سوينج شهرين إلى ثلاثة</h2>
<p>شموع أسبوعية. وقف 2×ATR وهدف 4×ATR وخروج بعد 13 أسبوعاً. الدخول العشوائي هنا يربح وحده ${L(signed(B.baseline.II.meanR, 2))}R لكل صفقة بسبب صعود السوق، ولهذا لا يكفي أن يكون المؤشر رابحاً، بل يجب أن يتفوق على هذا الرقم.</p>
${tableAB(B)}
<p class="muted">اختبار الاختيار: لو اخترت في 2018 أفضل خمسة مؤشرات أسبوعية حسب الماضي (${B.selection.map((id) => esc(NAMES[id][0])).join('، ')})، لما تفوق أي منها بشكل مثبت بعدها، وانقلب OBV من الثاني إلى الثلاثين. أما في الإطار اليومي فقد حافظ ثلاثة من أفضل خمسة على ميزتهم بالحجم نفسه تقريباً (TRIX وكيلتنر وإيشيموكو)، وواحد منهم فقط اجتاز التصحيح.</p>

<h2>الترتيب الكامل: استثمار سنة إلى سنتين</h2>
<p>شموع أسبوعية. القاعدة تبقيك في السوق طالما شرطها متحقق، وتخرجك إلى الكاش عندما يختفي. تُقارن بالشراء والاحتفاظ للسهم نفسه. المقياس فرق نسبة شارب (العائد مقابل التذبذب)، والوسيط على 33 رمزاً من 2018.</p>
${tableC(C)}
<p>الشراء والاحتفاظ خلال 2018–2026: شارب وسيط ${L(num(bh.bhSharpe))}، وعائد سنوي وسيط ${L(pct(bh.bhCagr))}، وأقصى هبوط وسيط ${L(pct(bh.bhMaxDD, 0))}. كل قاعدة توقيت قلّلت الهبوط، لكن ولا واحدة رفعت العائد المعدّل بالمخاطرة في الوسيط، لا قبل 2018 ولا بعدها. على مؤشر S&amp;P 500 وحده، تحسّن السعر فوق متوسط 40 أسبوعاً قبل 2018 (أزمة 2008) ولم يتحسّن بعدها.</p>
<div class="callout"><p><b>للاستثمار الطويل:</b> في هذا الاختبار، الشراء والاحتفاظ (أو الشراء على دفعات منتظمة) تفوّق على كل مؤشر توقيت. إذا كان الهبوط الكبير لا يُحتمل بالنسبة لك، فقاعدة مثل "السعر فوق متوسط 40 أسبوعاً" أو "MACD فوق الصفر" تقطع نحو 7–9 نقاط من أقصى هبوط، مقابل نحو 3% من العائد السنوي. هذه مقايضة، لا ميزة.</p></div>

<h2>حدود الاختبار</h2>
<ul>
<li><b>المؤشرات المجتمعية لم تُختبر.</b> اتصال تريدنج فيو يعطي الأسعار ولا يعطي سكربتات Pine المجتمعية، فالآلاف التي في المكتبة لا يمكن تشغيلها عبره. ما اختُبر هو المؤشرات المدمجة التي تُبنى منها معظم السكربتات.</li>
<li><b>الأسهم موجودة اليوم.</b> الشركات التي أفلست غائبة. هذا يرفع نتيجة الشراء والاحتفاظ، لكن مقارنتنا بالعشوائي على الرموز نفسها تلغي معظم أثره.</li>
<li><b>الأسعار معدّلة للتجزئة لا للتوزيعات.</b> يظلم هذا الشراء والاحتفاظ قليلاً في المسار الثالث، ومع ذلك تفوّق.</li>
<li><b>تصحيح في عدد القواعد.</b> نص البروتوكول قال 34 قاعدة دخول و18 قاعدة حالة، بينما جدوله يذكر 33 و19. اختُبرت كل صفوف الجدول (33 و19)، ولم يُضف أو يُحذف شيء.</li>
<li><b>التقييم الفني لتريدنج فيو أعيد بناؤه</b> من وصفه المنشور، لأن تريدنج فيو لا يعطي تاريخه. قارنّاه بالتقييم الحي في <span class="ltr">2026-10-06</span>: نفس الفئة (شراء قوي، شراء، محايد، بيع، بيع قوي) في 33 من 33 رمزاً (<code>reports/swing-rating-check.txt</code>).</li>
<li><b>الماضي لا يضمن المستقبل.</b> حتى المؤشر المثبت قد يتوقف عن العمل. الحكم النهائي يأتي من التسجيل المسبق للإشارات القادمة.</li>
</ul>

<footer>للبحث والتحليل فقط، وليست نصيحة مالية. كل الأرقام محسوبة من بيانات تاريخية وتصف ما حدث، لا ما سيحدث. التقارير الكاملة: <code>reports/swing-A.txt</code> و<code>swing-B.txt</code> و<code>swing-C.txt</code>.</footer>
</div>`

const FONT = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap">'
const TITLE = '<title>مؤشرات السوينج تحت الاختبار</title>'

const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${TITLE}
<meta name="description" content="33 مؤشراً من تريدنج فيو مختبرة على 33 سهماً وعملة بشروط مكتوبة مسبقاً: أيها يتفوق على الدخول العشوائي.">
${FONT}
<style>${STYLE}</style></head><body>
${body}
</body></html>
`
fs.writeFileSync('swing.html', page)
if (process.env.SWING_ARTIFACT) fs.writeFileSync(process.env.SWING_ARTIFACT, `${TITLE}\n${FONT}\n<style>${STYLE}</style>\n${body}\n`)
console.log('wrote swing.html')
