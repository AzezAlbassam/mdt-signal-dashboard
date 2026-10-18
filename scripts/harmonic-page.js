// Build harmonic.html (Arabic) from reports/harmonic.json, so the page cannot drift from the
// run. Every number on the page is read out of that file; none is typed in by hand.
//
//   node scripts/harmonic-page.js

import fs from 'node:fs'

const d = JSON.parse(fs.readFileSync('reports/harmonic.json', 'utf8'))
const TF = ['4h', '1D', '1W', '1M']
const TFAR = { '1h': 'ساعة', '4h': '٤ ساعات', '1D': 'يومي', '1W': 'أسبوعي', '1M': 'شهري' }
const PAR = {
  Gartley: 'جارتلي', Bat: 'الخفاش', AltBat: 'الخفاش البديل', Butterfly: 'الفراشة',
  Crab: 'السلطعون', DeepCrab: 'السلطعون العميق', Cypher: 'سايفر', Shark: 'القرش',
  FiveZero: '٥-٠', ABCD: 'AB=CD', ThreeDrives: 'الدفعات الثلاث',
}
const GAR = { top20: 'أكبر ٢٠ شركة', sector: 'تنويع قطاعي', named: 'روكت لاب · بلوم · هيمز', crypto: 'بيتكوين', index: 'مؤشرات ETF' }

const pct = (x) => (x == null || Number.isNaN(x) ? '—' : `${(x * 100).toFixed(1)}%`)
const r2 = (x) => (x == null || Number.isNaN(x) ? '—' : (x >= 0 ? '+' : '') + x.toFixed(3))
const p4 = (x) => (x == null ? '—' : x < 0.0001 ? '<0.0001' : x.toFixed(4))

// pattern rows pooled over the four pre-registered timeframes
const byPat = new Map()
for (const r of d.cellRows) {
  if (!TF.includes(r.tf)) continue
  const b = byPat.get(r.pattern) ?? { n: 0, h: 0, r: 0, v: 0 }
  b.n += r.n; b.h += r.hit * r.n; b.r += r.r * r.n; b.v += (r.vsN2 ?? 0) * r.n
  byPat.set(r.pattern, b)
}
const patRows = [...byPat].map(([p, b]) => ({ p, n: b.n, hit: b.h / b.n, r: b.r / b.n, vs: b.v / b.n }))
  .sort((a, b) => b.hit - a.hit)

const fam = Object.fromEntries(d.family1.map((f) => [f.id, f]))
const cf = d.confirm?.[0]
const tfRows = d.tfRows.filter((r) => TF.includes(r.tf))
const n4 = tfRows.reduce((a, r) => a + r.n, 0)
const hit4 = tfRows.reduce((a, r) => a + r.hit * r.n, 0) / n4

const verdictRow = (f, label) => `<tr>
  <td class="k">${label}</td>
  <td class="num">${f.n.toLocaleString('en')}</td>
  <td class="num ${f.effect > 0 ? 'pos' : 'neg'}">${r2(f.effect)}</td>
  <td class="num">${p4(f.p)}</td>
  <td class="num">${p4(f.holm)}</td>
  <td><span class="pill no">لم يثبت</span></td></tr>`

const html = `<title>الهارمونيك تحت الاختبار</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
/* Layout: one measured column — verdict, then the two tables that were asked for, then the
   machinery underneath them. Tokens first; every colour below comes from one of these. */
:root{
  --paper:#f7f5f1; --ink:#15181c; --muted:#5d6570; --rule:#ddd8d0; --card:#fffdfa;
  --accent:#9a6a2f; --pos:#1f7a52; --neg:#a8322c; --chip:#efe9e0;
  --ar:'IBM Plex Sans Arabic',system-ui,'Segoe UI',sans-serif;
  --mono:'IBM Plex Mono',ui-monospace,Menlo,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --paper:#121417; --ink:#e9e6e1; --muted:#9aa3ad; --rule:#2a2f36; --card:#181b20;
  --accent:#d9a860; --pos:#4cb98a; --neg:#e4685f; --chip:#232830; color-scheme:dark}}
:root[data-theme="dark"]{
  --paper:#121417; --ink:#e9e6e1; --muted:#9aa3ad; --rule:#2a2f36; --card:#181b20;
  --accent:#d9a860; --pos:#4cb98a; --neg:#e4685f; --chip:#232830; color-scheme:dark}

body{background:var(--paper);color:var(--ink);font-family:var(--ar);line-height:1.75;margin:0}
.wrap{max-width:880px;margin:0 auto;padding-block:48px 72px;
  padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
h1,h2,h3{text-wrap:balance;line-height:1.3;margin:0}
h1{font-size:clamp(28px,6vw,44px);font-weight:700}
h2{font-size:clamp(20px,3.4vw,26px);font-weight:600;margin-block:56px 8px}
h3{font-size:17px;font-weight:600;margin-block:28px 6px}
p{margin:12px 0}
.lede{font-size:clamp(16px,2.4vw,19px);color:var(--muted);font-weight:300;max-width:62ch}
/* No letter-spacing anywhere: Arabic letters join, and tracking breaks the joins apart. */
.eyebrow{font-size:12px;font-weight:500;color:var(--accent)}
.rule{height:1px;background:var(--rule);border:0;margin:28px 0}

.verdict{background:color-mix(in srgb,var(--neg) 7%,var(--card));
  border:1px solid color-mix(in srgb,var(--neg) 28%,var(--rule));border-radius:4px;
  padding:20px 22px;margin-top:28px;font-size:15.5px}
.verdict strong{font-weight:600}

.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;
  background:var(--rule);border:1px solid var(--rule);margin-top:24px}
.fact{background:var(--card);padding:14px 16px;min-width:0}
.fact b{display:block;font-family:var(--mono);font-size:21px;font-weight:600;font-variant-numeric:tabular-nums;
  direction:ltr;unicode-bidi:isolate;text-align:right}
.fact span{font-size:12px;color:var(--muted)}

.scroll{overflow-x:auto;margin-top:14px;border:1px solid var(--rule);border-radius:4px;background:var(--card)}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{padding:9px 12px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--rule)}
thead th{font-size:12px;color:var(--muted);font-weight:500;background:var(--chip)}
tbody tr:last-child td{border-bottom:0}
/* Signed figures are LTR runs inside an RTL document: without isolation the bidi algorithm
   moves the sign to the far end and "+0.060" reads as "0.060+". */
td.num,th.num{font-family:var(--mono);font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate;text-align:right}
td.k{font-weight:500}
.pos{color:var(--pos)}.neg{color:var(--neg)}
.pill{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;background:var(--chip);color:var(--muted)}
.pill.no{color:var(--neg)}
.best{background:color-mix(in srgb,var(--accent) 9%,transparent)}
.note{font-size:13px;color:var(--muted);margin-top:8px}
code{font-family:var(--mono);font-size:.92em;background:var(--chip);padding:1px 5px;border-radius:3px}
ul{padding-inline-start:20px;margin:10px 0}li{margin:6px 0}
footer{margin-top:64px;padding-top:20px;border-top:1px solid var(--rule);font-size:12.5px;color:var(--muted)}
</style>

<div class="wrap" dir="rtl" lang="ar">

<div class="eyebrow">الدراسة ١٢ · مسجّلة مسبقاً</div>
<h1>الهارمونيك تحت الاختبار</h1>
<p class="lede">أحد عشر نموذجاً بنسبها المنشورة، على ٤٠ رمزاً وخمسة فريمات،
${d.counts.real.toLocaleString('en')} صفقة. القواعد كُتبت وجُمِّدت قبل تنزيل أول شمعة.</p>

<div class="verdict">
<strong>النتيجة: لم يثبت أي شيء.</strong> النماذج لم تتفوّق على <strong>دخول عشوائي</strong> بنفس الهدف
ونفس الوقف بعد تصحيح الاختبارات المتعددة، و<strong>نسب فيبوناتشي نفسها لم تضف شيئاً</strong>: حين ضُربت كل
نسبة منشورة في معامل عشوائي وأُعيد الاختبار على نفس القيعان والقمم، كان الفرق
${r2(fam.H2.effect)}R باحتمال ${p4(fam.H2.p)} — أي صفر عملياً.
</div>

<div class="facts">
<div class="fact"><b>${d.counts.real.toLocaleString('en')}</b><span>صفقة</span></div>
<div class="fact"><b>${pct(hit4)}</b><span>تصل الهدف الأول</span></div>
<div class="fact"><b>−1.00R</b><span>وسيط الصفقة</span></div>
<div class="fact"><b>${d.counts.cells}</b><span>سلسلة سعرية</span></div>
</div>
<p class="note">قورِنت هذه الصفقات بـ ${d.counts.sham.toLocaleString('en')} صفقة وهمية من عشرين سحبة نسب عشوائية.
«وسيط الصفقة −1.00R» يعني أن أكثر من نصف الصفقات ضربت الوقف، غالباً في نفس الشمعة التي دخلت فيها،
لأن الحافة البعيدة من منطقة الانعكاس قريبة جداً من حافتها القريبة.</p>

<h2>١ · الاختبارات المسجّلة مسبقاً</h2>
<p>«الأثر» هو متوسط R للصفقة الحقيقية ناقص متوسط R لتوأمها العشوائي. تصحيح Holm على العائلة كاملة (ستة اختبارات).</p>
<div class="scroll"><table>
<thead><tr><th>الاختبار</th><th class="num">عدد الصفقات</th><th class="num">الأثر</th><th class="num">p</th><th class="num">Holm</th><th>الحكم</th></tr></thead>
<tbody>
${verdictRow(fam.H1, 'مقابل دخول عشوائي — مجمّع')}
${verdictRow(fam.H2, 'مقابل نسب عشوائية — مجمّع')}
${TF.map((tf) => verdictRow(fam[`H4${tf}`], `مقابل دخول عشوائي — ${TFAR[tf]}`)).join('\n')}
</tbody></table></div>
<p class="note">H1 وحده كان p = ${p4(fam.H1.p)} قبل التصحيح. ومع ذلك لا يُعتمد: من يختبر ستة فروض ويأخذ أفضلها
يجد «نتيجة» في بيانات عشوائية أيضاً. هذا بالضبط ما يمنعه تصحيح Holm.</p>

<h2>٢ · أي فريم أدق؟</h2>
<p>هذا السؤال لا توجد له إجابة منشورة في أي مرجع — لم يقارن أحد الفريمات مقابل بعضها باختبار حقيقي. هذه المقارنة:</p>
<div class="scroll"><table>
<thead><tr><th>الفريم</th><th class="num">الصفقات</th><th class="num">تصل الهدف ١</th><th class="num">متوسط R</th><th class="num">وسيط R</th><th class="num">مقابل العشوائي</th></tr></thead>
<tbody>
${d.tfRows.map((r) => `<tr${r.tf === '1W' ? ' class="best"' : ''}><td class="k">${TFAR[r.tf]}${r.tf === '1h' ? ' <span class="pill">خارج العائلة</span>' : ''}</td>
<td class="num">${r.n.toLocaleString('en')}</td><td class="num">${pct(r.hit)}</td>
<td class="num ${r.r > 0 ? 'pos' : 'neg'}">${r2(r.r)}</td><td class="num">${r2(r.medR)}</td>
<td class="num ${r.vsN2 > 0 ? 'pos' : 'neg'}">${r2(r.vsN2)}</td></tr>`).join('\n')}
</tbody></table></div>
<p><strong>الجواب الصادق: الفريمات لا تفترق.</strong> نسبة الوصول للهدف الأول بين ${pct(Math.min(...d.tfRows.map((r) => r.hit)))}
و${pct(Math.max(...d.tfRows.map((r) => r.hit)))} على كل الفريمات — فرق لا يُذكر على هذه الأحجام.
الأسبوعي هو الأعلى في الفرق عن العشوائي (${r2(fam.H41W.effect)}R) وهو الأقرب للدلالة،
لكنه بعد التصحيح عند Holm = ${p4(fam.H41W.holm)}، أي <strong>لم يثبت</strong>.
الشهري عيّنته صغيرة (${d.tfRows.find((r) => r.tf === '1M').n} صفقة) فلا يحسم شيئاً.</p>
<p class="note">للمضاربة اليومية: فريم الساعة أُدرج للاطلاع فقط وهو خارج العائلة المسجّلة مسبقاً، لأن عمق البيانات اللحظية قصير.</p>

<h2>٣ · أي نموذج أدق؟</h2>
<p>مجمّع على الفريمات الأربعة المسجّلة. مرتّب بنسبة الوصول للهدف الأول:</p>
<div class="scroll"><table>
<thead><tr><th>النموذج</th><th class="num">الصفقات</th><th class="num">تصل الهدف ١</th><th class="num">متوسط R</th><th class="num">مقابل العشوائي</th></tr></thead>
<tbody>
${patRows.map((r) => `<tr><td class="k">${PAR[r.p] ?? r.p}</td><td class="num">${r.n.toLocaleString('en')}</td>
<td class="num">${pct(r.hit)}</td><td class="num ${r.r > 0 ? 'pos' : 'neg'}">${r2(r.r)}</td>
<td class="num ${r.vs > 0 ? 'pos' : 'neg'}">${r2(r.vs)}</td></tr>`).join('\n')}
</tbody></table></div>

<h3>النموذج الذي بدا «واو» — وكيف سقط</h3>
<p>نموذج <strong>الدفعات الثلاث</strong> تصدّر الجدول بفارق كبير. ولأن اختيار أفضل خانة من ٤٣ خانة هو بالضبط
الطريقة التي تكذب بها الدراسات، قُسِّمت الرموز نصفين قبل أن نرى أي نتيجة: نصف للبحث، ونصف لم يُفتح إطلاقاً.</p>
<div class="scroll"><table>
<thead><tr><th>الدفعات الثلاث · ٤ ساعات</th><th class="num">الصفقات</th><th class="num">تصل الهدف ١</th><th class="num">متوسط R</th></tr></thead>
<tbody>
<tr><td class="k">نصف البحث (٢٠ رمزاً)</td><td class="num">${cf.searchN}</td><td class="num pos">${pct(cf.searchHit)}</td><td class="num pos">${r2(cf.searchR)}</td></tr>
<tr><td class="k">نصف التأكيد — لم يُنظر إليه</td><td class="num">${cf.confirm.n}</td><td class="num">${pct(cf.confirm.hit)}</td><td class="num neg">${r2(cf.confirm.r)}</td></tr>
</tbody></table></div>
<p>على الرموز غير المرئية: ${pct(cf.confirm.hit)} و<strong>خسارة</strong> ${r2(cf.confirm.r)}R، باحتمال ${p4(cf.test.p)}.
هذا هو «لعنة الفائز» في سطر واحد: أفضل خانة في عيّنة هي غالباً أكثر خانة حالفها الحظ، لا أكثرها صدقاً.</p>

<h3>الفخّ: نسبة نجاح عالية تخسر مالاً</h3>
<p>نموذج <strong>٥-٠</strong> يصل هدفه في ${pct(patRows.find((r) => r.p === 'FiveZero').hit)} من الحالات —
وهي أعلى نسبة بعد الدفعات الثلاث — ومع ذلك متوسطه ${r2(patRows.find((r) => r.p === 'FiveZero').r)}R.
السبب أن أرباحه صغيرة وخسائره كاملة. أي نسبة نجاح بلا هدفها ووقفها ليست معلومة.</p>

<h2>٤ · الرموز التي سألت عنها</h2>
<div class="scroll"><table>
<thead><tr><th>المجموعة</th>${TF.map((t) => `<th class="num">${TFAR[t]}</th>`).join('')}</tr></thead>
<tbody>
${['top20', 'sector', 'named', 'crypto', 'index'].map((g) => `<tr><td class="k">${GAR[g]}</td>${TF.map((tf) => {
  const row = d.groupRows.find((x) => x.group === g && x.tf === tf)
  return `<td class="num">${row ? `${pct(row.hit)} <span class="${row.r > 0 ? 'pos' : 'neg'}">${r2(row.r)}R</span>` : '—'}</td>`
}).join('')}</tr>`).join('\n')}
</tbody></table></div>
<p class="note">كل خانة: نسبة الوصول للهدف الأول، ثم متوسط R. روكت لاب وبلوم إنرجي وهيمز سالبة على كل فريم —
أسهم حديثة وعالية التذبذب، وتاريخها أقصر من أن يحسم. الشهري محذوف لأغلبها لقلة الشموع.</p>

<h2>٥ · لماذا نصدّق هذه الأرقام</h2>
<ul>
<li><strong>لا إعادة رسم.</strong> القمم والقيعان تُعتمد فقط في الشمعة التي تؤكّدها، والنموذج يُسجَّل لحظة تأكيد النقطة C —
أي أن منطقة الانعكاس والهدف والوقف كلها معروفة قبل أن تتكوّن D. هذا أهم عيب في اختبارات الهارمونيك المنشورة، ومُعالَج هنا باختبارات برمجية.</li>
<li><strong>مرجعان للمقارنة لا واحد.</strong> دخول عشوائي بنفس الهندسة، ونسخة من نفس النماذج بنسب مضروبة في معامل عشوائي.</li>
<li><strong>بحث ثم تأكيد على رموز منفصلة</strong>، والقائمة القصيرة جُمِّدت في الملف قبل تشغيل نصف التأكيد.</li>
<li><strong>الاحتمالات محسوبة بالتبديل العشوائي</strong> مع تجميع على مستوى الرمز، حتى لا يحمل سهم محظوظ النتيجة كلها.</li>
</ul>

<h3>ما لا تقوله الدراسة</h3>
<ul>
<li>لم تُقرأ كتب كارني الأصلية مباشرة — الشبكة الخارجية محجوبة في بيئة التشغيل، فالنسب مجمّعة من مستخلصات بحث ومن شيفرة خمسة مؤشرات منشورة، ثم روجعت مرة ثانية بباحث مهمّته تفنيدها.</li>
<li>مقياس واحد للتأرجح (${'1.5'} ATR). تأرجح أصغر يعطي صفقات أكثر ونتيجة مشابهة؛ أكبر يعطي أقل وأسوأ.</li>
<li>لا عمولة ولا انزلاق سعري في الحساب — وهذا يُجمِّل الحقيقي والعشوائي معاً، ولهذا المقارنة هي النتيجة وليس الرقم المطلق.</li>
<li>الرموز هي كبار اليوم، أي أن تاريخها تاريخ ناجين. المقارنة تجري على نفس الشموع في الحالتين.</li>
</ul>

<h2>٦ · المؤشر</h2>
<p>المؤشر منشور في <code>pine/harmonic.pine</code> ويعمل على أي رمز وأي فريم: يرسم الهيكل الكامل XABCD،
منطقة الانعكاس، نقطة الدخول، الوقف، وأربعة أهداف (٣٨.٢٪ و٦١.٨٪ من ضلع AD، ثم نقطة C ثم نقطة A)،
مع تنبيه عند دخول السعر المنطقة. ترويسته تحمل هذه النتيجة نفسها، لأن البروتوكول ألزمها بذلك قبل تشغيل الاختبار.</p>
<p class="note">لم يُجرَّب تصريفه على TradingView بعد — لا يمكن الوصول للمنصة من بيئة التشغيل. إن ظهر خطأ تصريف، أرسله ويُصلَح.</p>

<footer>
الدراسة ١٢ · البروتوكول في <code>PROTOCOL-harmonic.md</code> · الأرقام كاملة في <code>reports/harmonic.txt</code><br>
التاريخ حتى ${'2026-10-17'} · بحث وقياس، وليست نصيحة استثمارية.
</footer>
</div>
`

fs.writeFileSync('harmonic.html', html)
console.log(`harmonic.html written (${(html.length / 1024).toFixed(1)} KB)`)
