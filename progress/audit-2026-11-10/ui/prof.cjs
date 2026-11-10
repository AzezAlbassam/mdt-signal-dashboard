// CPU profile: inclusive time per named page function during load and during one sort / one filter clear.
const { chromium } = require('playwright'); const lib = require('./lib.cjs')
function summarize(profile, names) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n])); const self = new Map()
  const dt = profile.timeDeltas; profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (dt[i] ?? 0) / 1000))
  const parent = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const incl = {}; const selfBy = {}
  for (const [id, t] of self) { const seen = new Set(); let cur = id; const leaf = byId.get(id).callFrame.functionName || '(anon)'; selfBy[leaf] = (selfBy[leaf] ?? 0) + t; while (cur != null) { const fn = byId.get(cur).callFrame.functionName || '(anon)'; if (!seen.has(fn)) { seen.add(fn); incl[fn] = (incl[fn] ?? 0) + t } cur = parent.get(cur) } }
  const total = [...self.values()].reduce((a, b) => a + b, 0)
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${Math.round(v)}`).join('  ')
  return { total: Math.round(total), idle: Math.round(selfBy['(idle)'] ?? 0), incl: names.map((n) => `${n}:${Math.round(incl[n] ?? 0)}`).join('  '), topSelf: top(selfBy, 14) }
}
;(async () => {
  const NAMES = ['compute', 'render', 'rowHtml', 'visible', 'sortValue', 'detail', 'scoreAt', 'fairValuesAt', 'expectationsAt', 'projectAt', 'snowflake', 'snowSvg', 'ehsScore', 'liveFairValues', 'weakFair', 'peNow', 'peg', 'listSvr', 'svrShown', 'preProfit', 'parseFundamentals', 'closesOf', 'loadCollection', 'rdcfFor', 'liveContext', 'multiplesAt', 'upside', 'expCell', 'scoreCell', 'starBtn', 'gYears']
  const p = await lib.open({ w: 390, h: 844, settle: 0, qs: 'hold=1' })
  // hold=1 is ignored by the stub; profile a reload instead so the profiler is on from the start
  const c = await p.context().newCDPSession(p); await c.send('Profiler.enable'); await c.send('Profiler.setSamplingInterval', { interval: 200 }); await c.send('Profiler.start')
  await p.reload(); await p.waitForFunction(() => /آخر تحديث/.test(document.getElementById('status')?.textContent ?? ''), null, { timeout: 60000 }); await p.waitForTimeout(600)
  let prof = (await c.send('Profiler.stop')).profile; console.log('LOAD', JSON.stringify(summarize(prof, NAMES), null, 1))
  for (const [name, fn] of [['SORT by score', () => { const s = document.getElementById('sortSel'); s.value = 'score:-1'; s.dispatchEvent(new Event('change', { bubbles: true })); void document.body.offsetHeight }], ['FILTER clear (full list)', () => { const f = document.getElementById('filter'); f.value = 'zz'; f.dispatchEvent(new Event('input', { bubbles: true })); f.value = ''; f.dispatchEvent(new Event('input', { bubbles: true })); void document.body.offsetHeight }], ['STAR toggle', () => { document.querySelector('#rows tr.row .star').click(); void document.body.offsetHeight }]]) {
    await c.send('Profiler.start'); await p.evaluate(fn); await p.waitForTimeout(700); prof = (await c.send('Profiler.stop')).profile; console.log(name, JSON.stringify(summarize(prof, NAMES), null, 1))
  }
  // layout/paint split for one full render through tracing counters
  const m0 = await c.send('Performance.enable').then(() => c.send('Performance.getMetrics'))
  await p.evaluate(() => { const s = document.getElementById('sortSel'); s.value = 'upside:-1'; s.dispatchEvent(new Event('change', { bubbles: true })) }); await p.waitForTimeout(1200)
  const m1 = await c.send('Performance.getMetrics'); const g = (m, k) => m.metrics.find((x) => x.name === k).value
  console.log('one sort, engine split (ms): script', Math.round(1000 * (g(m1, 'ScriptDuration') - g(m0, 'ScriptDuration'))), 'layout', Math.round(1000 * (g(m1, 'LayoutDuration') - g(m0, 'LayoutDuration'))), 'recalcStyle', Math.round(1000 * (g(m1, 'RecalcStyleDuration') - g(m0, 'RecalcStyleDuration'))), 'nodes', g(m1, 'Nodes'), 'heapMB', Math.round(g(m1, 'JSHeapUsedSize') / 1e6))
  await lib.close()
})()
