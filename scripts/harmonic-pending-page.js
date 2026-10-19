// Builds harmonic-watch.html — the monthly setups that are registered but not yet reached.
// Generated from reports/harmonic-pending-1M.json and reports/harmonic.json, so the page
// cannot disagree with the scan. Re-run after scripts/harmonic-pending.js.
//   node scripts/harmonic-pending-page.js → harmonic-watch.html
import fs from 'node:fs'

const d = JSON.parse(fs.readFileSync('reports/harmonic-pending-1M.json', 'utf8'))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const N = (x) => (Math.abs(x) >= 1000 ? x.toLocaleString('en', { maximumFractionDigits: 0 }) : x.toFixed(2))
const pct = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}%`
const AR = { long: 'شراء', short: 'بيع' }
const PAT = {
  Gartley: 'Gartley', Bat: 'Bat', AltBat: 'Alt Bat', Butterfly: 'Butterfly', Crab: 'Crab',
  DeepCrab: 'Deep Crab', Cypher: 'Cypher', Shark: 'Shark', FiveZero: '5-0', ABCD: 'AB=CD',
  ThreeDrives: 'Three Drives',
}

const TOP = d.shortlist.slice(0, 10)
const ABCD = d.rows.filter((r) => r.status === 'waiting' && r.kind === 'stock' && r.monthsLeft >= 1 && r.pattern === 'ABCD').slice(0, 8)
const be = d.monthly.breakEvenRR

const row = (r) => `<tr${r.rr1 >= be ? ' class="ok"' : ''}>
    <td class="sym">${esc(r.sym.split(':')[1])}</td>
    <td>${esc(PAT[r.pattern] ?? r.pattern)}</td>
    <td class="${r.side}">${AR[r.side]}</td>
    <td class="n">${N(r.price)}</td>
    <td class="n zone">${N(Math.min(r.zoneNear, r.zoneFar))} – ${N(Math.max(r.zoneNear, r.zoneFar))}</td>
    <td class="n dist">${pct(r.distPct)}</td>
    <td class="n neg">${N(r.stop)}</td>
    <td class="n pos">${N(r.t1)}</td>
    <td class="n pos">${N(r.t4)}</td>
    <td class="n rr">${r.rr1.toFixed(2)}${r.rr1 >= be ? '' : ' <span class="flag">!</span>'}</td>
    <td class="n">${r.monthsLeft}</td>
  </tr>`

const table = (rows) => `<div class="scroll"><table>
  <tr><th>الرمز</th><th>النموذج</th><th>الاتجاه</th><th>السعر</th><th>المنطقة</th><th>المسافة</th>
      <th>الوقف</th><th>هدف ١</th><th>هدف ٤</th><th>عائد/مخاطرة</th><th>أشهر</th></tr>
  ${rows.map(row).join('\n  ')}
  </table></div>`

const asOf = [...new Set(TOP.concat(ABCD).map((r) => r.priceAt))].sort()

const html = `<title>مراقبة الهارمونيك الشهري</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
/* Same tokens as the other two harmonic pages, so the three read as one system.
   No letter-spacing anywhere — Arabic letters join. */
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

*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--ar);line-height:1.75}
.wrap{max-width:1000px;margin:0 auto;padding-block:44px 72px;
  padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));
  display:grid;gap:30px}
h1{font-size:clamp(26px,5.5vw,38px);font-weight:700;margin:0;text-wrap:balance;line-height:1.25}
h2{font-size:clamp(18px,3vw,22px);font-weight:600;margin:0 0 6px;text-wrap:balance}
p{margin:0 0 10px;max-width:64ch}
.sub{color:var(--muted);font-weight:300;font-size:clamp(15px,2.2vw,17px)}
.eyebrow{font-size:12px;font-weight:500;color:var(--accent)}
section{display:grid;gap:8px}
hr{border:0;border-top:1px solid var(--rule);margin:0}
.note{font-size:13.5px;color:var(--muted);max-width:68ch}
code{font:.9em var(--mono);background:var(--chip);padding:1px 5px;border-radius:3px;direction:ltr;unicode-bidi:isolate}
ul{margin:0;padding-inline-start:20px;display:grid;gap:7px;max-width:68ch}
li::marker{color:var(--muted)}

.warn{background:color-mix(in srgb,var(--neg) 7%,var(--card));
  border:1px solid color-mix(in srgb,var(--neg) 26%,var(--rule));border-radius:4px;padding:16px 18px}
.warn .num{font-family:var(--mono);direction:ltr;unicode-bidi:isolate}

.scroll{overflow-x:auto;border:1px solid var(--rule);border-radius:4px;background:var(--card)}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{padding:9px 11px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--rule)}
th{font-weight:600;font-size:12px;color:var(--muted);background:var(--chip)}
tr:last-child td{border-bottom:0}
tr.ok td.rr{font-weight:700;color:var(--pos)}
td.n{font-family:var(--mono);direction:ltr;unicode-bidi:isolate}
td.sym{font-family:var(--mono);font-weight:700;color:var(--accent);direction:ltr;unicode-bidi:isolate}
td.long{color:var(--pos);font-weight:600} td.short{color:var(--neg);font-weight:600}
td.pos{color:var(--pos)} td.neg{color:var(--neg)}
td.zone{font-weight:600}
td.dist{color:var(--muted)}
.flag{color:var(--neg);font-weight:700}
</style>

<div class="wrap" dir="rtl" lang="ar">

<header>
  <div class="eyebrow">فريم شهري · <span dir="ltr">${d.scanned}</span> سلسلة · الدراسة ١٢</div>
  <h1>مناطق شهرية جاهزة، والسعر لم يصل بعد</h1>
  <p class="sub">كل صف هنا نموذج اكتملت نقاطه <span dir="ltr">X A B C</span> على الشارت الشهري، فصارت
  منطقته ووقفه وأهدافه أرقاماً ثابتة. الشيء الوحيد المفتوح هو: هل يصل السعر إلى المنطقة أم لا.
  لا شيء هنا تنبؤ بأنه سيصل.</p>
</header>

<div class="warn">
<strong>اقرأ هذا قبل الجدول.</strong> الفريم الشهري هو <strong>أضعف خانة في الدراسة كلها</strong>:
على <span class="num">${d.monthly.n}</span> صفقة شهرية، متوسط العائد
<span class="num">+${d.monthly.meanR.toFixed(3)}R</span> للصفقة — أي صفر عملياً — ونسبة الوصول للهدف الأول
<span class="num">${(d.monthly.hit * 100).toFixed(1)}%</span> بمجال ثقة
<span class="num">[${(d.monthly.hitCI[0] * 100).toFixed(0)}–${(d.monthly.hitCI[1] * 100).toFixed(0)}%]</span>.
وبما أن الخسارة <span class="num">−1R</span> بحكم التصميم، فالصفقة تحتاج عائداً/مخاطرة فوق
<strong><span class="num">${be.toFixed(2)}</span></strong> لمجرد أن تتعادل قبل العمولة والانزلاق.
الصفوف التي تحتها هذا الحد معلّمة بـ<span class="flag">!</span> — وهي الأكثرية.
</div>

<section>
  <h2>العشرة الأقرب</h2>
  <p class="note">أسهم فقط، ونماذج المؤشر الافتراضية (<span dir="ltr">AB=CD</span> مطفأ)، والأقرب أولاً.
  «المسافة» كم يجب أن يتحرك السعر ليلمس الحافة القريبة: سالب يعني نزولاً، وموجب صعوداً.
  «أشهر» كم شمعة شهرية بقيت قبل أن تُقفل نافذة الدخول.</p>
  ${table(TOP)}
  <p class="note">القيم بعملة السهم. «هدف ٤» هو النقطة <span dir="ltr">A</span>، أبعد هدف في النموذج؛
  الدراسة قاست الخروج عند <strong>هدف ١</strong> وعليه كل الأرقام أعلاه.
  أسعار ${esc(asOf.join(' و'))} حسب مصدر كل رمز.</p>
</section>

<section>
  <h2>ولو شغّلت <span dir="ltr">AB=CD</span></h2>
  <p class="note">مطفأ افتراضياً لأنه ثلاث نقاط ونسبة واحدة، فيشكّل ٧١٪ من كل الاكتشافات. لكنه هو
  الذي فيه أقرب المناطق، فإن شغّلته سترى هذه:</p>
  ${table(ABCD)}
</section>

<hr>

<section>
  <h2>كيف بُني الجدول</h2>
  <ul>
    <li><strong>العيّنة:</strong> <span dir="ltr">${d.scanned}</span> سلسلة شهرية — ٣٢٧ رمزاً أمريكياً
    بتاريخ يومي يعود إلى <span dir="ltr">2006</span> حُوِّل إلى شهري، زائد الأربعين رمزاً التي قيست في
    الدراسة. الأخيرة تفوز عند التكرار لأنها الأحدث.</li>
    <li><strong>«قريب التكوين» له معنى واحد هنا:</strong> النقاط الأربع مؤكَّدة والمنطقة محسوبة.
    نموذج «نسبه قريبة من الصحيحة» ليس في الجدول — ذاك نموذج غير موجود، وإدخاله هو التحريف
    الذي بُنيت الدراسة كلها لتجنّبه.</li>
    <li><strong>الشهر الجاري لا يُحتسب شمعة:</strong> المسح يقرأ الأشهر المكتملة فقط. لكن أيام الشهر
    المفتوح لم تُهمَل — كل نموذج أُعيد تشغيله عليها يومياً، فظهر
    <span dir="ltr">${d.statuses['reached-since'] ?? 0}</span> وصل السعر إلى منطقته فعلاً و<span dir="ltr">${d.statuses['void-since'] ?? 0}</span> لغا،
    وكلها خارج الجدول.</li>
    <li><strong>ما استُبعد:</strong> المؤشرات والصناديق (أنت طلبت أسهماً)، وأي نموذج تُقفل نافذته هذا الشهر.</li>
  </ul>
  <p class="note">لو فتحت الرمز على TradingView ووضعت المؤشر على الشهري، يفترض أن يرسم البوكس نفسه.
  إن اختلف الرقم قليلاً فالسبب عمق التاريخ أو تعديل التجزئة عند مزوّدك — الشارت عندك هو المرجع.</p>
</section>

<p class="note">تحليل لاحق وصفي (<span dir="ltr">post-hoc</span>): البروتوكول
<code>PROTOCOL-harmonic.md</code> لا يسجّل أي مسح مسبق، وهذا هو المؤشر مصوَّباً على قائمة رموز.
الأرقام كاملة <code>reports/harmonic-pending-1M.json</code> · بحث وقياس، وليست نصيحة استثمارية.</p>

</div>
`

fs.writeFileSync('harmonic-watch.html', html)
console.log(`harmonic-watch.html written: ${TOP.length} stocks + ${ABCD.length} AB=CD rows, ${(html.length / 1024).toFixed(1)} KB`)
