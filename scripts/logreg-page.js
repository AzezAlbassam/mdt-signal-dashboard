// Render logreg.html: the Log Regression Band Pine script with a copy button.
// Rebuild after editing pine/metal-log-regression.pine:   node scripts/logreg-page.js
import fs from 'node:fs'

const pine = fs.readFileSync('pine/metal-log-regression.pine', 'utf8')
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

fs.writeFileSync('logreg.html', `<title>Log Regression Band</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{
  /* Layout: one reading column; the code block is the page's main object. Colours follow the band itself. */
  --bg:#F3F3F0; --surface:#FBFBF9; --raise:#EAEAE5; --ink:#1C1C1A; --body:#45453F; --muted:#6E6E66; --line:#DADAD2;
  --upper:#8E3AA0; --mid:#1F4FD8; --lower:#1E86B8; --accent:#1F4FD8; --ok:#2E7D4F;
  --sans:"IBM Plex Sans",system-ui,"Segoe UI",sans-serif; --mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#262624; --surface:#2F2F2C; --raise:#383834; --ink:#EEEBE3; --body:#CCC8BE; --muted:#9A968C; --line:#41413C;
  --upper:#C27BD2; --mid:#6E93FF; --lower:#5FC3EE; --accent:#6E93FF; --ok:#6CC08F; color-scheme:dark;
}}
:root[data-theme="dark"]{
  --bg:#262624; --surface:#2F2F2C; --raise:#383834; --ink:#EEEBE3; --body:#CCC8BE; --muted:#9A968C; --line:#41413C;
  --upper:#C27BD2; --mid:#6E93FF; --lower:#5FC3EE; --accent:#6E93FF; --ok:#6CC08F; color-scheme:dark;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--body);font:15px/1.65 var(--sans)}
.wrap{max-width:900px;margin:0 auto;padding-block:40px 72px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:28px}
h1{color:var(--ink);font-size:clamp(1.7rem,4.5vw,2.3rem);line-height:1.2;margin:0 0 8px;text-wrap:balance}
h2{color:var(--ink);font-size:1.15rem;margin:0 0 10px;text-wrap:balance}
p{margin:0;max-width:68ch}
.lines{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:12px;font-size:.9rem}
.lines i{display:inline-block;width:20px;height:3px;border-radius:2px;vertical-align:middle;margin-right:6px}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:6px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:.9rem}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
th{font-weight:600;color:var(--muted);font-size:.78rem;letter-spacing:.03em;text-transform:uppercase;background:var(--raise)}
tr:last-child td{border-bottom:0}
td:first-child{color:var(--ink);font-weight:600}
figure{margin:0}
figure img{display:block;width:100%;border-radius:6px;border:1px solid var(--line)}
figcaption{font-size:.82rem;color:var(--muted);margin-top:6px}
.code{border:1px solid var(--line);border-radius:6px;background:var(--surface);min-width:0}
.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 10px 8px 14px;border-bottom:1px solid var(--line)}
.bar span{font:500 .82rem var(--mono);color:var(--muted)}
button{font:600 .9rem var(--sans);color:var(--surface);background:var(--accent);border:0;border-radius:5px;padding:8px 16px;cursor:pointer}
button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
button.done{background:var(--ok)}
pre{margin:0;overflow:auto;max-height:520px;padding:14px;font:12.5px/1.55 var(--mono);color:var(--ink)}
ol,ul{margin:0;padding-left:20px;display:grid;gap:6px;max-width:68ch}
code{font:.88em var(--mono);background:var(--raise);padding:1px 5px;border-radius:3px}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
<div class="wrap">
  <header>
    <h1>Log Regression Band</h1>
    <p>One indicator for gold, silver, stocks and coins. It reads the ticker and picks the start date and the curve for you.</p>
    <div class="lines"><span><i style="background:var(--upper)"></i>Upper (+1 SD)</span><span><i style="background:var(--mid)"></i>Regression</span><span><i style="background:var(--lower)"></i>Lower (−1 SD)</span></div>
  </header>

  <section>
    <h2>What it does on each chart</h2>
    <div class="tbl"><table>
      <thead><tr><th>Symbol</th><th>Fit starts</th><th>Curve</th><th>Why</th></tr></thead>
      <tbody>
        <tr><td>Gold (GOLD, XAU)</td><td>Aug 1971</td><td>Straight on a log chart</td><td>Before that the price was fixed by law</td></tr>
        <tr><td>Silver (SILVER, XAG)</td><td>Jul 1968</td><td>Straight on a log chart</td><td>The Treasury capped the price until 1967–68</td></tr>
        <tr><td>Stocks and ETFs</td><td>First bar (listing)</td><td>Straight on a log chart</td><td>A steady growth rate</td></tr>
        <tr><td>Crypto</td><td>First bar</td><td>Curved (power law), like the ETH band</td><td>Growth slows as the coin ages</td></tr>
      </tbody>
    </table></div>
    <p style="margin-top:10px">Every choice can be overridden in the settings: <code>Fit from</code>, <code>Time axis</code>, <code>Band width</code>, <code>Outer bands</code>, <code>Carry the lines forward</code> and the colours.</p>
  </section>

  <figure>
    <img src="logreg-preview.png" alt="The band on gold since 1971 and on Microsoft since 2000: three rising lines with a green fill between the upper and lower line">
    <figcaption>Gold and MSFT, monthly. Drawn from the same fit outside TradingView, so the look on your chart will match but this is not a screenshot.</figcaption>
  </figure>

  <section class="code">
    <div class="bar"><span>metal-log-regression.pine · Pine v6 · ${pine.split('\n').length} lines</span><button type="button" id="copy">Copy code</button></div>
    <pre id="src">${esc(pine)}</pre>
  </section>

  <section>
    <h2>Add it to TradingView</h2>
    <ol>
      <li>Open the Pine Editor, select everything in it and delete it.</li>
      <li>Paste the code, press Save, then Add to chart.</li>
      <li>Use the monthly or weekly chart. Daily works too, but the band is meant for years.</li>
    </ol>
  </section>

  <section>
    <h2>Read it with care</h2>
    <ul>
      <li>The default fit, <code>All data</code>, draws one line through the whole history to today. The past is fitted with hindsight and moves a little every month. Switch <code>Fit</code> to <code>Past only</code> to see what the band said at each date.</li>
      <li>For gold and silver the lower band was checked on 2–3 full cycles (study 7): too few to call it a signal.</li>
      <li>For stocks it is untested. Only companies that survived have long charts, so the band looks better on them than it would on a random stock.</li>
    </ul>
  </section>
</div>
<script>
document.getElementById('copy').addEventListener('click', async (e) => {
  const b = e.currentTarget, pre = document.getElementById('src')
  try { await navigator.clipboard.writeText(pre.textContent); b.textContent = 'Copied'; b.classList.add('done') }
  catch { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Selected, press Ctrl+C' }
  setTimeout(() => { b.textContent = 'Copy code'; b.classList.remove('done') }, 2500)
})
</script>
`)
console.log('logreg.html written')
