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
