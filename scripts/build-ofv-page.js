// Builds ofv.html — study 15's Pine script (pine/open-flow-vwap.pine) with a copy button, in
// Arabic, with what was and was not shown above it. Same approach as scripts/build-hcp-page.js:
// the code and the numbers are read at build time, so the page cannot drift from the repo.
// Re-run after any change to the Pine or the report.
//   node scripts/build-ofv-page.js → ofv.html
import fs from 'node:fs'

const pine = fs.readFileSync('pine/open-flow-vwap.pine', 'utf8').trimEnd()
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const lines = pine.split('\n').length
const rep = JSON.parse(fs.readFileSync('reports/study15.json', 'utf8'))
const a35 = rep.posthoc.anchorScan.find((r) => r.anchor === '09:35')
const f2 = (x) => x.toFixed(2)
const k = (x) => (x > 0 ? '+' : '−') + Math.abs(x).toFixed(2)
const edgesOk = ['E1', 'E2', 'E3', 'E4'].filter((e) => a35[e].label === 'MATCH').length

const html = `<title>مؤشر Flow VWAP المفتوح</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{
  /* One reading column, right to left. The answer to "which timeframe" comes first, then what was
     shown and what was not, then the code. Colours are the indicator's own: the gold line and the
     purple of put-dominated gamma, on a chart-dark code panel. */
  --bg:#F3F2EE; --surface:#FCFBF8; --raise:#EAE8E1; --ink:#1C1B18; --body:#45433C; --muted:#706D63; --line:#DCD9D0;
  --gold:#9A6B00; --goldbg:#F6EDD6; --purple:#6B3FB0; --ok:#2E6B45; --okbg:#E5F0E8; --no:#A13A2C; --nobg:#F7E7E3;
  --codebg:#16161A; --codeink:#E9E6DD; --codemuted:#8E8A80;
  --sans:"IBM Plex Sans Arabic",system-ui,"Segoe UI",Tahoma,sans-serif; --mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#1D1C19; --surface:#262521; --raise:#302E29; --ink:#EEEBE3; --body:#CBC7BC; --muted:#99958A; --line:#3B3933;
  --gold:#E8BC5A; --goldbg:#3A3020; --purple:#B48BF0; --ok:#7CC496; --okbg:#1F3326; --no:#F0A496; --nobg:#3A2420;
  --codebg:#111114; --codeink:#E9E6DD; --codemuted:#8E8A80; color-scheme:dark;
}}
:root[data-theme="dark"]{
  --bg:#1D1C19; --surface:#262521; --raise:#302E29; --ink:#EEEBE3; --body:#CBC7BC; --muted:#99958A; --line:#3B3933;
  --gold:#E8BC5A; --goldbg:#3A3020; --purple:#B48BF0; --ok:#7CC496; --okbg:#1F3326; --no:#F0A496; --nobg:#3A2420;
  --codebg:#111114; --codeink:#E9E6DD; --codemuted:#8E8A80; color-scheme:dark;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--body);font:16px/1.75 var(--sans)}
.wrap{max-width:840px;margin:0 auto;padding-block:40px 72px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:34px}
h1{color:var(--ink);font-size:clamp(1.7rem,4.6vw,2.3rem);line-height:1.25;margin:0;text-wrap:balance}
h2{color:var(--ink);font-size:1.18rem;line-height:1.4;margin:0;text-wrap:balance}
p{margin:0;max-width:64ch}
.sub{color:var(--muted);margin-top:8px}
section{display:grid;gap:14px;min-width:0}
.ltr{direction:ltr;unicode-bidi:isolate}
.tf{background:var(--goldbg);border-radius:8px;padding:22px;display:grid;gap:14px}
.tf .big{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.tf .big b{font:700 2.4rem/1 var(--mono);color:var(--gold)}
.tf .big span{color:var(--ink);font-weight:500}
ul{margin:0;padding-inline-start:1.2em;display:grid;gap:8px;max-width:64ch}
li::marker{color:var(--muted)}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:8px;background:var(--surface);min-width:0}
table{border-collapse:collapse;width:100%;font-size:.94rem}
th,td{text-align:start;padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-weight:500;color:var(--muted);font-size:.82rem;background:var(--raise)}
tr:last-child td{border-bottom:0}
td:first-child{color:var(--ink);font-weight:500;white-space:nowrap}
.pill{display:inline-block;font-size:.8rem;font-weight:700;padding:1px 10px;border-radius:99px;white-space:nowrap;margin-inline-end:6px}
.pill.ok{color:var(--ok);background:var(--okbg)}
.pill.no{color:var(--no);background:var(--nobg)}
.pill.na{color:var(--muted);background:var(--raise)}
.num{font-family:var(--mono);font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate}
.code{border-radius:8px;background:var(--codebg);min-width:0;overflow:hidden}
.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px 10px 16px;flex-wrap:wrap;border-bottom:1px solid #2A2A30}
.bar span{font:500 .82rem var(--mono);color:var(--codemuted)}
button{font:700 .95rem var(--sans);color:#1C1B18;background:#F0C050;border:0;border-radius:6px;padding:9px 20px;cursor:pointer}
button.done{background:#8FD3A6}
button:focus-visible{outline:2px solid #F0C050;outline-offset:3px}
pre{margin:0;overflow:auto;max-height:480px;padding:16px;font:12.5px/1.6 var(--mono);color:var(--codeink);direction:ltr;text-align:left;tab-size:4}
ol{margin:0;padding-inline-start:1.3em;display:grid;gap:8px;max-width:64ch}
code{font:.86em var(--mono);background:var(--raise);padding:1px 6px;border-radius:4px;color:var(--ink);direction:ltr;unicode-bidi:isolate}
.note{font-size:.9rem;color:var(--muted);max-width:64ch}
.swatch{display:inline-block;width:.8em;height:.8em;border-radius:50%;vertical-align:-.05em;margin-inline-end:4px}
@media (max-width:560px){td:first-child{white-space:normal} th,td{padding:9px 10px} .pill{display:table;margin-block-end:4px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>

<div class="wrap" dir="rtl" lang="ar">
  <header>
    <h1>مؤشر Flow VWAP، نسخة مفتوحة</h1>
    <p class="sub">بنيناه وقِسناه على شارت <span class="ltr">@t38p_flow</span> ليوم 12 أكتوبر 2026، وهو ليس كوده الأصلي.
    <span class="ltr">Pine v6</span>، ${lines} سطراً.</p>
  </header>

  <section class="tf">
    <h2>أفضل فريم</h2>
    <div class="big"><b class="ltr">3m</b><span>ثلاث دقائق، على <span class="ltr">SP:SPX</span></span></div>
    <ul>
      <li>شارته نفسه على شموع 3 دقائق: شموعه طابقت شموع SPX الحقيقية بفرق متوسطه <span class="num">0.03</span> نقطة. هذا الفريم يجعل شارتك مثل شارته تماماً.</li>
      <li>الخط والنطاقات تُحسب من بيانات الدقيقة داخل كل شمعة، فقيمتها واحدة على 1 و2 و3 و5 دقائق. تغيير الفريم يغيّر شكل الشموع فقط.</li>
      <li>مستويات الغاما تتحدث مع كل شمعة، فالأفضل لها من دقيقة إلى 3 دقائق. فوق 15 دقيقة تصير بطيئة، ولا يعمل المؤشر على اليومي.</li>
      <li>أي فريم يربح أكثر؟ <strong>لم نختبر ذلك.</strong> لا يوجد عندنا دليل على أفضلية لأي فريم، والصفقات الثلاث في تغريدته لا تثبت شيئاً.</li>
    </ul>
  </section>

  <section>
    <h2>ماذا أثبتنا وماذا لم نثبت</h2>
    <div class="tbl">
      <table>
        <thead><tr><th>الجزء</th><th>النتيجة</th></tr></thead>
        <tbody>
          <tr><td>المعادلة التي نشرها</td><td><span class="pill no">مزحة</span>معادلة فيزياء كمّية (ثابت بلانك ودوال بيسل)، لا سعر فيها ولا حجم.</td></tr>
          <tr><td>VWAP عادي من 9:30</td><td><span class="pill no">لا يطابق</span>أعلى من خطه دائماً، بفرق وسيطه <span class="num">${f2(rep.H1.V1.median)}</span> نقطة. هذا كان الاختبار المسجّل قبل القياس.</td></tr>
          <tr><td>VWAP عادي من 9:35</td><td><span class="pill ok">يطابق</span>بفرق <span class="num">${f2(a35.line.median)}</span> نقطة فقط. السبب أن دقيقة 9:30 فيها صفقات مزاد الافتتاح (حجمها نحو عشرة أضعاف الدقيقة العادية)، وخطه لا يحسبها.</td></tr>
          <tr><td>المنطقة المظللة</td><td><span class="pill ok">${edgesOk} من 4</span>حوافها الأربع هي ±1σ و±2σ لنفس الـVWAP من 9:35 (المضاعفات المقيسة <span class="num">${['E1', 'E2', 'E3', 'E4'].map((e) => k(a35[e].kFit)).join('  ')}</span>).</td></tr>
          <tr><td>فقاعات الغاما</td><td><span class="pill na">لا يمكن اختبارها</span>عقود أوبشن 12 أكتوبر انتهت، وTradingView لا يعرض إلا عقود اليوم السابق. الشارت يحمل علامة <span class="ltr">skylit.ai</span>، فالفقاعات غالباً من تلك المنصة.</td></tr>
          <tr><td>هل يربح؟</td><td><span class="pill na">غير مختبر</span>لم نختبر أي استراتيجية دخول وخروج عليه.</td></tr>
        </tbody>
      </table>
    </div>
    <p class="note">بداية 9:35 وجدناها بالبحث على نفس الشارت، لذلك لا تُعتبر مثبتة بعد. سجّلناها مسبقاً كفرضية تُختبر على أول شارت جديد له، بنفس طريقة القياس ونفس حدود المطابقة.</p>
  </section>

  <section>
    <h2>الكود</h2>
    <div class="code">
      <div class="bar"><span>open-flow-vwap.pine · Pine v6 · ${lines} lines</span><button type="button" id="copy">نسخ الكود</button></div>
      <pre id="src">${esc(pine)}</pre>
    </div>
    <ol>
      <li>في TradingView افتح <span class="ltr">Pine Editor</span> أسفل الشارت.</li>
      <li>الصق الكود مكان الموجود، ثم <span class="ltr">Save</span> ثم <span class="ltr">Add to chart</span>.</li>
      <li>افتح الرمز <code>SP:SPX</code> (فيه حجم الأسهم) على فريم 3 دقائق. على <code>CBOE:SPX</code> لا يوجد حجم، فاختر <code>Equal</code> في الإعدادات.</li>
      <li>مستويات الغاما تحتاج بيانات <span class="ltr">OPRA</span> في اشتراكك، وتظهر لآخر جلسة على الشارت فقط. بدونها يظهر الخط والنطاقات وحدها.</li>
    </ol>
    <p class="note">لم أتمكن من تشغيله على TradingView من عندي. إذا ظهر خطأ عند الحفظ أرسل لي نصّه وأصلحه.</p>
  </section>

  <section>
    <h2>الإعدادات</h2>
    <div class="tbl">
      <table>
        <thead><tr><th>الإعداد</th><th>الافتراضي</th><th>المعنى</th></tr></thead>
        <tbody>
          <tr><td class="ltr">Line weights</td><td class="ltr">Volume</td><td>وزن كل دقيقة بحجمها، مثل VWAP العادي. <span class="ltr">Equal</span> يعطي كل دقيقة نفس الوزن، و<span class="ltr">0DTE options flow</span> يزن بحجم عقود أوبشن اليوم.</td></tr>
          <tr><td class="ltr">Start delay</td><td class="num">5</td><td>عدد الدقائق المستبعدة بعد 9:30. القيمة 5 طابقت شارته، والقيمة 0 تعطي VWAP العادي.</td></tr>
          <tr><td class="ltr">Bands</td><td>مفعّل</td><td>النطاقات ±1σ و±2σ حول الخط.</td></tr>
          <tr><td class="ltr">Gamma levels</td><td>مفعّل</td><td><span class="swatch" style="background:var(--gold)"></span>أصفر حيث تغلب عقود الكول، <span class="swatch" style="background:var(--purple)"></span>بنفسجي حيث تغلب عقود البوت. الأقوى بخط أعرض.</td></tr>
          <tr><td class="ltr">Strikes each side</td><td class="num">9</td><td>عدد السترايكات فوق وتحت سعر الافتتاح، كل 5 نقاط. الحد 9 لأن TradingView يسمح بـ40 طلب بيانات.</td></tr>
          <tr><td class="ltr">Gamma levels to draw</td><td class="num">5</td><td>عدد أقوى المستويات المرسومة.</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>اختبار اليوم</h2>
    <p>بعد إغلاق جلسة اليوم (23 أكتوبر) سأحفظ عقود أوبشن اليوم وأجمّد مستوياتي وخطوطي في ملف قبل أن أرى أي شارت له. إذا نشر شارتاً لليوم أرسله لي وأقارنه بالأرقام المجمّدة. هذا أول اختبار نظيف لجزء الغاما.</p>
  </section>
</div>

<script>
const btn = document.getElementById('copy')
const src = document.getElementById('src')
btn.addEventListener('click', async () => {
  const done = (msg) => { btn.textContent = msg; btn.classList.add('done'); setTimeout(() => { btn.textContent = 'نسخ الكود'; btn.classList.remove('done') }, 2200) }
  try {
    await navigator.clipboard.writeText(src.textContent)
    done('تم النسخ')
  } catch {
    // clipboard refused (some app views): select the code so the viewer can copy it by hand
    const r = document.createRange(); r.selectNodeContents(src)
    const s = getSelection(); s.removeAllRanges(); s.addRange(r)
    done('حدّدت الكود، انسخه يدوياً')
  }
})
</script>
`
fs.writeFileSync('ofv.html', html)
console.log(`ofv.html: ${lines} lines of Pine, ${(html.length / 1024).toFixed(0)} KB`)
