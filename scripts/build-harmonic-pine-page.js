// Builds harmonic-pine.html — the harmonic Pine script with a copy button, Arabic, with the
// study's verdict above it. Same approach as scripts/build-hcp-page.js: the code is inlined
// from pine/harmonic.pine at build time, so the page can never show a script that differs
// from the one in the repo. Re-run after any change to the Pine.
//   node scripts/build-harmonic-pine-page.js → harmonic-pine.html
import fs from 'node:fs'

const pine = fs.readFileSync('pine/harmonic.pine', 'utf8').trimEnd()
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const lines = pine.split('\n').length
const kb = (pine.length / 1024).toFixed(0)

const d = JSON.parse(fs.readFileSync('reports/harmonic.json', 'utf8'))
const fam = Object.fromEntries(d.family1.map((f) => [f.id, f]))
const r2 = (x) => (x >= 0 ? '+' : '') + x.toFixed(3)
const p4 = (x) => (x < 0.0001 ? '<0.0001' : x.toFixed(4))

// How long a trade lasts, per timeframe — reports/harmonic-holding.json, post-hoc.
const hold = JSON.parse(fs.readFileSync('reports/harmonic-holding.json', 'utf8'))
// Arabic counts its nouns by the number in front of them: one, two, the plural of paucity
// for three to ten, then the singular again. A table that gets this wrong reads as machine
// output, so the four forms are carried per unit.
const ar = (n, [one, two, few, many]) => (n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`)
const DAY = ['يوم واحد', 'يومان', 'أيام', 'يوماً']
const WEEK = ['أسبوع واحد', 'أسبوعان', 'أسابيع', 'أسبوعاً']
const MONTH = ['شهر واحد', 'شهران', 'أشهر', 'شهراً']
const YEAR = ['سنة واحدة', 'سنتان', 'سنوات', 'سنة']
const dur = (days) => {
  if (days < 1) return 'أقل من يوم'
  if (days < 14) return ar(Math.round(days), DAY)
  if (days < 70) return ar(Math.round(days / 7), WEEK)
  if (days < 400) return ar(Math.round(days / 30.44), MONTH)
  const y = days / 365.25
  return Math.abs(y - Math.round(y)) < 0.1 ? ar(Math.round(y), YEAR) : `${y.toFixed(1)} سنة`
}
const holdRows = hold.rows.map((r) => `<tr><td class="tf">${r.tf}</td>
    <td>${dur(r.horizonDays)}</td><td>${dur(r.structureDays.median)}</td><td>${dur(r.waitDays.median)}</td>
    <td>${dur(r.winnerDays.median)} · ${dur(r.winnerDays.p90)}</td>
    <td>${dur(r.cycleDays.median)} · ${dur(r.cycleDays.p90)}</td></tr>`).join('\n  ')

const html = `<title>مؤشر الهارمونيك XABCD</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
/* Layout: the verdict, then the button, then the code. Same tokens as the results page so the
   two read as one system. No letter-spacing anywhere — Arabic letters join. */
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
.wrap{max-width:900px;margin:0 auto;padding-block:44px 72px;
  padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));
  display:grid;gap:30px}
h1{font-size:clamp(26px,5.5vw,38px);font-weight:700;margin:0;text-wrap:balance;line-height:1.25}
h2{font-size:clamp(18px,3vw,22px);font-weight:600;margin:0 0 6px;text-wrap:balance}
p{margin:0 0 10px;max-width:64ch}
.sub{color:var(--muted);font-weight:300;font-size:clamp(15px,2.2vw,17px)}
.eyebrow{font-size:12px;font-weight:500;color:var(--accent)}
section{display:grid;gap:8px}
hr{border:0;border-top:1px solid var(--rule);margin:0}

.verdict{background:color-mix(in srgb,var(--pos) 7%,var(--card));
  border:1px solid color-mix(in srgb,var(--pos) 26%,var(--rule));border-radius:4px;padding:18px 20px}
.verdict strong{font-weight:600}
.verdict .num{font-family:var(--mono);direction:ltr;unicode-bidi:isolate}

.code{border:1px solid var(--rule);border-radius:4px;background:var(--card);min-width:0}
.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
  padding:10px 12px;border-bottom:1px solid var(--rule);background:var(--chip);border-radius:4px 4px 0 0}
.bar span{font:500 12.5px var(--mono);color:var(--muted);direction:ltr;unicode-bidi:isolate}
button{font:600 15px var(--ar);color:#fff;background:var(--accent);border:0;border-radius:4px;
  padding:10px 22px;cursor:pointer}
button.done{background:var(--pos)}
button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
pre{margin:0;overflow:auto;max-height:440px;padding:14px;direction:ltr;text-align:left;
  font:12px/1.55 var(--mono);color:var(--ink)}

ol,ul{margin:0;padding-inline-start:20px;display:grid;gap:7px;max-width:64ch}
li::marker{color:var(--muted)}
code{font:.9em var(--mono);background:var(--chip);padding:1px 5px;border-radius:3px;direction:ltr;unicode-bidi:isolate}
.note{font-size:13.5px;color:var(--muted);max-width:64ch}
.panel{background:var(--card);border:1px solid var(--rule);border-radius:4px;padding:14px 16px;
  font:12.5px/1.7 var(--mono);direction:ltr;text-align:left;overflow-x:auto;white-space:pre}
.warn{background:color-mix(in srgb,var(--neg) 7%,var(--card));
  border:1px solid color-mix(in srgb,var(--neg) 26%,var(--rule));border-radius:4px;padding:16px 18px}

.scroll{overflow-x:auto;border:1px solid var(--rule);border-radius:4px;background:var(--card)}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{padding:9px 12px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--rule)}
th{font-weight:600;font-size:12.5px;color:var(--muted);background:var(--chip)}
tr:last-child td{border-bottom:0}
td.tf{font-family:var(--mono);direction:ltr;unicode-bidi:isolate;color:var(--accent);font-weight:600}

/* The key: a swatch, then what it means. Swatch colours are the indicator's own. */
.key{display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:start;
  background:var(--card);border:1px solid var(--rule);border-radius:4px;padding:16px 18px}
.key b{display:inline-block;min-width:26px;font-family:var(--mono);font-weight:700;text-align:center}
.key span{font-size:14.5px}
.g{color:var(--pos)} .r{color:var(--neg)} .m{color:var(--muted)}
</style>

<div class="wrap" dir="rtl" lang="ar">

<header>
  <div class="eyebrow">Pine v6 · ${lines} سطراً · الدراسة ١٢</div>
  <h1>مؤشر الهارمونيك XABCD</h1>
  <p class="sub">أحد عشر نموذجاً بنسبها المنشورة، مع منطقة الانعكاس والدخول والوقف وأربعة أهداف،
  ولوحة تقيس دقة كل نموذج على الرمز المفتوح أمامك. يعمل على أي رمز وأي فريم، ولا يعيد الرسم.</p>
</header>

<div class="verdict">
<strong>ما الذي ثبت وما الذي لم يثبت.</strong> على ٤٠ رمزاً وخمسة فريمات و<span class="num">${d.counts.real.toLocaleString('en')}</span> صفقة:
الهندسة تتفوّق على دخول عشوائي بنفس الهدف والوقف بفارق <span class="num">${r2(fam.H1.effect)}R</span> للصفقة
(p <span class="num">${p4(fam.H1.p)}</span>، بعد التصحيح <span class="num">${p4(fam.H1.holm)}</span>) — <strong>ثبت</strong>.
أما <strong>نسب فيبوناتشي نفسها فلا تضيف شيئاً</strong>: اضرب كل نسبة في معامل عشوائي وأعد الاختبار،
الفرق <span class="num">${r2(fam.H2.effect)}R</span> باحتمال <span class="num">${p4(fam.H2.p)}</span>.
<br><br>
وحجم الرقم قبل النجوم: <span class="num">${r2(fam.H1.effect)}R</span> أي ثمانية بالمئة من وحدة مخاطرة،
بلا عمولة ولا انزلاق. ووسيط الصفقة <span class="num">−1.00R</span>: أكثر من نصف الصفقات تضرب الوقف،
غالباً في شمعة الدخول نفسها.
</div>

<hr>

<section>
  <h2>الكود</h2>
  <div class="code">
    <div class="bar"><span>harmonic.pine · Pine v6 · ${lines} lines · ${kb} KB</span><button type="button" id="copy">انسخ الكود</button></div>
    <pre id="src">${esc(pine)}</pre>
  </div>
  <ol>
    <li>افتح TradingView ← <strong>Pine Editor</strong> من أسفل الشارت.</li>
    <li>امسح ما بداخله، الصق الكود، ثم <strong>Save</strong> ثم <strong>Add to chart</strong>.</li>
    <li>افتح أي رمز وأي فريم. لوحة الدقة تظهر أسفل يمين الشارت بعد أن يمرّ على التاريخ كاملاً.</li>
  </ol>
  <p class="note">لم يُصرَّف على TradingView من هنا — المنصة محجوبة في بيئة التشغيل. إن ظهر خطأ تصريف
  أرسل لي نصّه كما هو ويُصلَح فوراً.</p>
</section>

<hr>

<section>
  <h2>قراءة الشارت</h2>
  <p>كل ما يرسمه المؤشر مشروح في مفتاح صغير أسفل يسار الشارت، وهذا هو:</p>
  <div class="key">
    <b class="m">▬</b><span>أضلاع النموذج <span dir="ltr">X A B C</span>.</span>
    <b class="m">┈</b><span>ضلع <span dir="ltr">XA</span> المرجعي الذي تُقاس عليه النسب.</span>
    <b class="g">▭</b><span><strong>البوكس هو مكان الأمر.</strong> أخضر = منطقة شراء، أحمر = منطقة بيع.
    يبدأ من <strong>الشمعة التي تأكّد فيها النموذج</strong> — لا من النقطة C، لأن C أقدم من الإشارة —
    وينتهي عند <strong>آخر شمعة يُحتسب فيها الوصول</strong>. فطرفا البوكس هما التاريخان المهمّان:
    متى صار النموذج معلوماً، ومتى يموت.</span>
    <b class="g">▬</b><span>خط الدخول: أمر محدَّد عند الحافة القريبة من البوكس.</span>
    <b class="r">╌</b><span>الوقف: <span dir="ltr">0.25</span> من <span dir="ltr">ATR</span> خلف الحافة البعيدة.</span>
    <b class="g">┈</b><span>الأهداف الأربعة. الاختبار يخرج عند الهدف الأول، وأرقام اللوحة كلها محسوبة عليه.</span>
    <b class="m">■</b><span>الرمادي: النموذج <strong>لاغٍ</strong> — لم يصل إليه السعر قبل أن تُقفل النافذة.</span>
  </div>
  <p>وعلى البوكس نفسه مكتوب الاتجاه واسم النموذج والمنطقة، ثم <strong>حالته</strong>، وهي واحدة من أربع:</p>
  <ul>
    <li><strong>بانتظار وصول السعر</strong> — النافذة ما زالت مفتوحة ولم يصل بعد.</li>
    <li><strong>تفعّل</strong> — السعر دخل المنطقة: هنا كان الأمر المحدَّد سينفّذ.</li>
    <li><strong>لاغٍ</strong> — كسر النقطة <span dir="ltr">C</span> قبل أن يصل، أو قفزت شمعة فوق المنطقة كاملة.</li>
    <li><strong>انتهى</strong> — أُقفلت النافذة ولم يصل.</li>
  </ul>
  <p class="note">النماذج اللاغية تبقى رمادية على الشارت عن قصد: نسبة ما لا يصل إليه السعر جزء من الصورة.
  لإخفائها: الإعدادات ← <code>Display</code> ← <code>Hide patterns once they are void</code>.
  ولعرض الكتابة بالإنجليزية إن لم تُرسم العربية عندك بشكل صحيح: أطفئ <code>Arabic text on the chart</code>.</p>
</section>

<section>
  <h2>أي فريم لأي مدة</h2>
  <p>القاعدة تُغلق الصفقة بعد <strong>٦٠ شمعة</strong> مهما حدث، فطول الشمعة هو ما يحدّد أفق الصفقة.
  هذه الأرقام من نفس الـ<span class="num" dir="ltr">${d.counts.real.toLocaleString('en')}</span> صفقة، بالأيام التقويمية:</p>
  <div class="scroll"><table>
  <tr><th>الفريم</th><th>سقف الصفقة</th><th>تكوّن النموذج <span dir="ltr">X→C</span></th>
      <th>انتظار الدخول</th><th>صفقة رابحة · وسيط ثم ٩٠٪</th><th>الدورة كاملة <span dir="ltr">X→الخروج</span></th></tr>
  ${holdRows}
  </table></div>
  <p class="note">«سقف الصفقة» هو ما تساويه ٦٠ شمعة من تقويم فعلي. «انتظار الدخول» هو الوقت الميّت بين
  تأكّد النموذج ولمس السعر للمنطقة. أرقام <span dir="ltr">1h</span> و<span dir="ltr">4h</span> مقرّبة
  لليوم الكامل لأن تواريخ تلك السلاسل بلا ساعات، فما يحدث داخل الجلسة يُقرأ صفراً.</p>
</section>

<section>
  <h2>إطفاء النماذج التي لا تريدها</h2>
  <p>في الإعدادات ← مجموعة <code>Patterns</code> إحدى عشرة خانة. أطفئ الكل وأبقِ ما تريد:</p>
  <p class="note">Gartley · Bat · Alt Bat · Butterfly · Crab · Deep Crab · Cypher · Shark · 5-0 · AB=CD · Three Drives</p>
  <p><code>AB=CD</code> مطفأ افتراضياً: يحتاج ثلاث نقاط ونسبة واحدة فقط، فيظهر أكثر من كل الباقي مجتمعاً
  (٧١٪ من كل الاكتشافات في الدراسة). <code>Three Drives</code> هو الأندر والأعلى نسبةً، وعيّنته صغيرة دائماً.</p>
</section>

<section>
  <h2>لوحة الدقة على شارتك</h2>
  <p>تعيد تشغيل قواعد الدراسة نفسها على تاريخ الرمز المفتوح، وتطبع لكل نموذج: عدد الصفقات،
  نسبة الوصول للهدف الأول، مجال الثقة ٩٥٪، ومتوسط R.</p>
  <div class="panel">AAPL · 4h          n    win% (95% CI)     avg R
Gartley            18   38.9% [20–61]      0.21
Shark              31   41.9% [26–59]      0.14
Three Drives        4   75.0% [30–95]      0.52   ← رمادي
all               142   31.0%              0.09</div>
  <p class="note">قورنت هذه اللوحة بمحرّك الدراسة على ١٨٧ سلسلة و١٩٬٨٨٦ صفقة: تطابق تام، صفقة بصفقة.
  فالرقم على شارتك هو نفس الرقم الذي تنتجه الدراسة.</p>
</section>

<div class="warn">
<strong>الفخّ الذي بُنيت اللوحة لتحذّرك منه.</strong> حين ترى نموذجاً بنسبة ٨٨٪، انظر أولاً إلى عدد
الصفقات ومجال الثقة بجانبها. في هذه الدراسة بالذات: خانة قرأت <strong>٦٨.٨٪ على ٣٢ صفقة</strong>،
ثم على ٣٣ صفقة من أسهم لم تُفتح من قبل قرأت <strong>٥٧.٦٪ وخسارة</strong>. لذلك يظهر الرقم بالرمادي
تحت ٣٠ صفقة، وبجانبه دائماً مجاله. و<strong>نسبة عالية مع R سالب = فخّ</strong>: نموذج ٥-٠ يصل هدفه
٥٧–٦٠٪ ومتوسطه حوالي −0.30R، لأن أرباحه صغيرة وخسائره كاملة.
</div>

<section>
  <h2>إعدادات تغيّر المؤشر عن الذي اختُبر</h2>
  <ul>
    <li><code>Swing size</code> — حجم التأرجح بمضاعفات ATR. القيمة المختبرة <strong>1.5</strong>.
    أقل = نماذج أكثر وأصغر، أكثر = أقل وأكبر وأسوأ في القياس.</li>
    <li><code>Ratio tolerance</code> — سماحية النسبة. المختبَر <strong>٥٪</strong> نسبيّاً، وهو من الطرف
    المتشدّد؛ مؤشرات منتشرة تستعمل ١٠–١٥٪ فتجد ضعف العدد ويعني نصف المعنى.</li>
    <li><code>Require the AB=CD projection</code> — القراءة الصارمة لشرط التقارب عند كارني. مطفأة
    افتراضياً لأن اعتبارها شرطاً قاطعاً يجعل بعض النماذج مستحيلة هندسياً.</li>
    <li>أي تغيير في هذه الثلاثة يجعل ما تراه <strong>مؤشراً آخر</strong> غير الذي تقول عنه الأرقام أعلاه.</li>
  </ul>
</section>

<p class="note">البروتوكول <code>PROTOCOL-harmonic.md</code> · الأرقام كاملة <code>reports/harmonic.txt</code> ·
البيانات حتى ٢٠٢٦-١٠-١٧ · بحث وقياس، وليست نصيحة استثمارية.</p>

</div>

<script>
document.getElementById('copy').addEventListener('click', async (e) => {
  const b = e.currentTarget, pre = document.getElementById('src')
  try {
    await navigator.clipboard.writeText(pre.textContent)
    b.textContent = 'تم النسخ ✓'; b.classList.add('done')
  } catch {
    const r = document.createRange(); r.selectNodeContents(pre)
    const s = getSelection(); s.removeAllRanges(); s.addRange(r)
    b.textContent = 'محدَّد — اضغط Ctrl+C'
  }
  setTimeout(() => { b.textContent = 'انسخ الكود'; b.classList.remove('done') }, 2500)
})
</script>
`

fs.writeFileSync('harmonic-pine.html', html)
console.log(`harmonic-pine.html written: ${lines} lines of Pine inlined, ${(html.length / 1024).toFixed(1)} KB`)
