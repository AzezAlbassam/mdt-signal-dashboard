const { open, shot, close } = require('./lib.cjs')
const info = async (p, tag) => console.log(tag, '| status:', JSON.stringify(await p.textContent('#status')), '| notice:', await p.$eval('#notice', (n) => (n.hidden ? '(hidden)' : n.className + ': ' + n.textContent)), '| rows:', await p.$$eval('#rows tr.row', (r) => r.length), '| skel:', await p.$$eval('#rows .skel', (r) => r.length), '| first:', (await p.$eval('#rows tr', (r) => r.innerText.replace(/\s+/g, ' ').slice(0, 110)).catch(() => '')), '| logs', p.logs.slice(0, 2))
const toRows = (p) => p.evaluate(() => { const r = document.querySelector('#rows tr'); scrollTo(0, r.getBoundingClientRect().top + scrollY - 120) })
;(async () => {
  let p
  // 1 loading
  p = await open({ w: 390, h: 844, qs: 'delay=2500&dbdelay=1500', settle: 0 })
  await p.waitForTimeout(700); await info(p, 'load@0.7s'); await shot(p, 'state-loading-a-390')
  await p.waitForTimeout(1800); await info(p, 'load@2.5s'); await toRows(p); await shot(p, 'state-loading-b-390')
  await p.waitForTimeout(2500); await info(p, 'load@5s'); await shot(p, 'state-loading-c-390')
  await p.waitForTimeout(4000); await info(p, 'load@9s'); await p.context().close()
  // 2 errors
  for (const f of ['quota', 'unavailable', 'tool', 'reauth']) { p = await open({ w: 390, h: 844, qs: 'fail=' + f, settle: 4500 }); await info(p, 'fail=' + f); await shot(p, `state-fail-${f}-390`); await toRows(p); await shot(p, `state-fail-${f}-390-rows`); await p.context().close() }
  p = await open({ w: 390, h: 844, qs: 'failpart=1', settle: 3500 }); await info(p, 'failpart'); await shot(p, 'state-failpart-390'); await p.context().close()
  p = await open({ w: 1440, h: 900, qs: 'fail=quota', settle: 4500 }); await info(p, 'fail=quota 1440'); await shot(p, 'state-fail-quota-1440'); await p.context().close()
  // 3 outside claude.ai
  for (const f of ['noclaude', 'nomcp', 'nodb']) { p = await open({ w: 390, h: 844, qs: f + '=1', settle: 3000 }); await info(p, f); await shot(p, `state-${f}-390`); await p.context().close() }
  // 4 empty
  p = await open({ w: 390, h: 844, qs: 'emptyfav=1', settle: 2500 }); await p.click('#tab-fav'); await p.waitForTimeout(500); await info(p, 'emptyfav'); await shot(p, 'state-fav-empty-390')
  await p.click('#tab-us'); await p.waitForTimeout(300); await p.$eval('#rows tr.row[data-sym="NASDAQ:AAPL"] .star', (b) => { b.scrollIntoView({ block: 'center' }); b.click() }); await p.waitForTimeout(400)
  await p.click('#tab-fav'); await p.waitForTimeout(500); await info(p, 'fav after star'); await shot(p, 'state-fav-one-390'); await p.context().close()
  p = await open({ w: 390, h: 844, qs: 'emptylists=1', settle: 2500 }); await info(p, 'emptylists'); await shot(p, 'state-emptylist-390'); await p.context().close()
  // 5 no-data stocks
  p = await open({ w: 390, h: 844, qs: 'extra=NASDAQ:NOPE&nocache=NASDAQ:AAON', settle: 3500 })
  await p.evaluate(() => { document.querySelector('#sortSel').value = ''; }); await info(p, 'extra NOPE')
  await p.$eval('#rows tr.row[data-sym="NASDAQ:NOPE"]', (r) => { r.scrollIntoView({ block: 'start' }); scrollBy(0, -20); r.click() }); await p.waitForTimeout(800); await shot(p, 'state-unknown-symbol-390')
  await p.$eval('#rows tr.row[data-sym="NASDAQ:NOPE"]', (r) => r.click())
  await p.$eval('#rows tr.row[data-sym="NASDAQ:AAON"]', (r) => { r.scrollIntoView({ block: 'start' }); scrollBy(0, -20); r.click() }); await p.waitForTimeout(800); await shot(p, 'state-nofundamentals-390')
  console.log('AAON panel text:', (await p.$eval('#rows tr.detail', (d) => d.innerText.replace(/\s+/g, ' ').slice(0, 400)).catch(() => 'none'))); await p.context().close()
  // 6 news fail + hist fail (loss-maker)
  p = await open({ w: 390, h: 844, qs: 'newsfail=1&nohist=1', settle: 2500 })
  await p.$eval('#rows tr.row[data-sym="NASDAQ:LCID"]', (r) => { r.scrollIntoView(); r.click() }); await p.waitForTimeout(1500)
  console.log('LCID svr box:', await p.$eval('#rows tr.detail .svr', (d) => d.innerText.replace(/\s+/g, ' ').slice(0, 200)).catch(() => 'none'), '| news:', await p.$eval('#rows tr.detail', (d) => { const i = d.innerText.indexOf('آخر الأخبار'); return d.innerText.slice(i, i + 160).replace(/\s+/g, ' ') }))
  await p.$eval('#rows tr.detail .svr', (d) => d.scrollIntoView({ block: 'center' })); await shot(p, 'state-svr-news-fail-390'); await p.context().close()
  await close()
})()
