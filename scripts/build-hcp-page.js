// Builds hcp.html — the HCP Pine script with a copy button, with study 11's result above it.
// The code is inlined from pine/hcp.pine at build time, the way scripts/build-stocks-page.js
// inlines engine/score.js, so the page can never show a script that differs from the one in
// the repo. Re-run it after any change to the Pine.
//   node scripts/build-hcp-page.js → hcp.html
import fs from 'node:fs'

const pine = fs.readFileSync('pine/hcp.pine', 'utf8').trimEnd()
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const lines = pine.split('\n').length

const html = `<title>Harmonic Cycle Projection</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{
  /* One reading column. The verdict comes before the code, because the code is the seductive part. */
  /* Colours are the indicator's own: the fitted line's blue and the projection's purple. */
  --bg:#F2F3F0; --surface:#FBFBF9; --raise:#E8EAE5; --ink:#1A1C1A; --body:#434740; --muted:#6B7066; --line:#D8DAD3;
  --fit:#2962FF; --proj:#8E3AA0; --bad:#B3261E; --badbg:#FBECEA; --ok:#2E7D4F;
  --sans:"IBM Plex Sans",system-ui,"Segoe UI",sans-serif; --mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#242624; --surface:#2E302C; --raise:#383A35; --ink:#EDEEE7; --body:#C9CCC2; --muted:#979B90; --line:#40423C;
  --fit:#6E93FF; --proj:#C27BD2; --bad:#F2B8B5; --badbg:#3A2422; --ok:#6CC08F; color-scheme:dark;
}}
:root[data-theme="dark"]{
  --bg:#242624; --surface:#2E302C; --raise:#383A35; --ink:#EDEEE7; --body:#C9CCC2; --muted:#979B90; --line:#40423C;
  --fit:#6E93FF; --proj:#C27BD2; --bad:#F2B8B5; --badbg:#3A2422; --ok:#6CC08F; color-scheme:dark;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--body);font:15px/1.65 var(--sans)}
.wrap{max-width:860px;margin:0 auto;padding-block:40px 72px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:30px}
h1{color:var(--ink);font-size:clamp(1.7rem,4.5vw,2.25rem);line-height:1.15;margin:0;text-wrap:balance;letter-spacing:-.015em}
h2{color:var(--ink);font-size:1.1rem;margin:0 0 10px;text-wrap:balance}
p{margin:0;max-width:66ch}
.sub{color:var(--muted);margin-top:8px}
section{display:grid;gap:12px}
.verdict{border:1px solid var(--bad);background:var(--badbg);border-radius:6px;padding:20px;display:grid;gap:12px}
.verdict h2{color:var(--bad);margin:0;font-size:1.25rem}
.verdict strong{color:var(--ink)}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:6px;background:var(--surface);min-width:0}
table{border-collapse:collapse;width:100%;font-size:.9rem}
th,td{text-align:left;padding:9px 13px;border-bottom:1px solid var(--line);white-space:nowrap}
th{font-weight:600;color:var(--muted);font-size:.76rem;letter-spacing:.04em;text-transform:uppercase;background:var(--raise)}
tr:last-child td{border-bottom:0}
td:first-child{color:var(--ink);font-weight:600}
td.n{font-variant-numeric:tabular-nums;text-align:right}
.code{border:1px solid var(--line);border-radius:6px;background:var(--surface);min-width:0}
.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 10px 9px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.bar span{font:500 .8rem var(--mono);color:var(--muted)}
button{font:600 .9rem var(--sans);color:#fff;background:var(--fit);border:0;border-radius:5px;padding:9px 18px;cursor:pointer}
button.done{background:var(--ok)}
button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
pre{margin:0;overflow:auto;max-height:460px;padding:14px;font:12.5px/1.55 var(--mono);color:var(--ink)}
ol,ul{margin:0;padding-left:1.25em;display:grid;gap:7px;max-width:66ch}
li::marker{color:var(--muted)}
code{font:.88em var(--mono);background:var(--raise);padding:1px 5px;border-radius:3px;color:var(--ink)}
.note{font-size:.88rem;color:var(--muted);max-width:66ch}
hr{border:0;border-top:1px solid var(--line);margin:0}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>

<div class="wrap">
  <header>
    <h1>Harmonic Cycle Projection</h1>
    <p class="sub">A model line fitted to the last 1000 bars and carried forward past the last candle.
    Works on any daily chart: indices, ETFs, US and non-US stocks, crypto. Pine v6, ${lines} lines.</p>
  </header>

  <div class="verdict">
    <h2>It was tested on 153 of your symbols, and it failed</h2>
    <p>10,309 projections, 101 dates from 2010 to 2026, every fit using only the bars available at the
    time. Both pre-registered hypotheses failed. <strong>Do not trade off this line.</strong></p>
    <div class="tbl">
      <table>
        <thead><tr><th>Question</th><th>HCP</th><th>Doing nothing</th></tr></thead>
        <tbody>
          <tr><td>Distance from price over 40 bars</td><td class="n">38.0%</td><td class="n">9.1%</td></tr>
          <tr><td>Beat a flat line at the last close</td><td class="n">in 11% of cases</td><td class="n">&mdash;</td></tr>
          <tr><td>Does it rank winners above losers</td><td class="n">&minus;0.015 (p 0.91)</td><td class="n">&mdash;</td></tr>
        </tbody>
      </table>
    </div>
    <p>A 10-day moving average also beat it. Both halves of the period agree, so it is not one bad regime.</p>
  </div>

  <section>
    <h2>Why it is published anyway</h2>
    <p>You asked for the indicator, so here it is, with the part that is usually missing attached.
    The chart that prompted this showed a line running 39 bars past the last candle, captioned
    &ldquo;continues to track extremely well&rdquo;. Its author has never published the method and it
    appears to sit behind a paid channel, so this is an open look-alike of the <em>shape</em> of such a
    line, not a copy of anyone&rsquo;s model.</p>
    <p>Measured off that chart, the posted line sat an average 1.77% from QQQ over five and a half
    months &mdash; the same as a 20-day moving average, and worse than a 10-day one.</p>
  </section>

  <section>
    <h2>The one thing worth knowing before you look at it</h2>
    <p>Across your 153 symbols the median move this model implies over the next eight weeks is
    <strong>44%</strong>. For your six indices it is <strong>5.8%</strong>.</p>
    <div class="tbl">
      <table>
        <thead><tr><th>Symbol</th><th>Implied 8-week move</th></tr></thead>
        <tbody>
          <tr><td>IWM</td><td class="n">&minus;7.0%</td></tr>
          <tr><td>DOW</td><td class="n">+2.4%</td></tr>
          <tr><td>SPY</td><td class="n">+2.8%</td></tr>
          <tr><td>QQQ</td><td class="n">+4.6%</td></tr>
          <tr><td>US500</td><td class="n">+7.3%</td></tr>
          <tr><td>NAS100</td><td class="n">+10.7%</td></tr>
          <tr><td>EOSE</td><td class="n">+645%</td></tr>
          <tr><td>BCHG</td><td class="n">+977%</td></tr>
        </tbody>
      </table>
    </div>
    <p>That is the whole result in one picture. A three-cycle extrapolation only looks credible on a
    low-volatility index &mdash; which is exactly where charts like this get posted. On anything
    volatile the fit leaves a large residual and the continuation runs away.</p>
  </section>

  <hr>

  <section>
    <h2>The script</h2>
    <div class="code">
      <div class="bar"><span>hcp.pine &middot; Pine v6 &middot; ${lines} lines</span><button type="button" id="copy">Copy code</button></div>
      <pre id="src">${esc(pine)}</pre>
    </div>
    <ol>
      <li>TradingView &rarr; Pine Editor (bottom of the chart).</li>
      <li>Paste over whatever is there, press <strong>Save</strong>, then <strong>Add to chart</strong>.</li>
      <li>Open a daily chart. The fit runs once, on the last bar, and can take a few seconds.</li>
    </ol>
    <p class="note">Not yet compiled on TradingView from this end. If it throws an error, send me the
    message and I will fix it.</p>
  </section>

  <section>
    <h2>Reading it honestly</h2>
    <ul>
      <li>The fitted line is <strong>not</strong> pinned to the last close. The gap between line and
      price is part of the model&rsquo;s output, not an error.</li>
      <li>The historical part is refitted every update, so it is drawn with hindsight and repaints.
      Only the forward segment is a statement about something not yet known. Judging the model by how
      well the drawn history hugs the candles is judging a curve against the points it was fitted to.</li>
      <li>A cycle found in one window is routinely gone from the next. Nothing tests whether a period
      is real; the search always returns its best three, even on noise.</li>
      <li>Lowering <code>Window</code> or <code>Trial periods</code> speeds the script up and makes it
      a different model from the one that was tested.</li>
    </ul>
  </section>

  <section>
    <h2>The honest test is still running</h2>
    <p>Today&rsquo;s projections for all 153 symbols are frozen in the repository, written down before
    the bars existed. Around <strong>11 December</strong> they get scored against what actually
    happened. That is the one test a posted screenshot can never offer, and it is the number worth
    waiting for.</p>
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
`

fs.writeFileSync('hcp.html', html)
console.log(`hcp.html written: ${lines} lines of Pine inlined, ${(html.length / 1024).toFixed(1)} KB`)
