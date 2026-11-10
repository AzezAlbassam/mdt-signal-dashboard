// Browser check for pages/tweets.html (audit plan step 3: 5.1 feedback, 5.2 inbox, 5.5 X preview):
//   NODE_PATH=$(npm root -g) node test/pages/tweets-check.cjs
// Loads the page with a fake window.claude (db, assets) and asserts what it shows and writes.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { chromium } = require('playwright')

const file = path.join(os.tmpdir(), 'tweets-check.html')
fs.writeFileSync(file, `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>${fs.readFileSync(path.join(__dirname, '../../pages/tweets.html'), 'utf8')}</body></html>`)
const today = new Date().toISOString().slice(0, 10)
const para = (n) => Array.from({ length: n }, (_, i) => `سطر رقم ${i + 1} فيه كلام عن السوق والأسهم 📈`).join('\n')
const long = `${para(4)}\n\n${para(4)}\n\n${para(4)}\n\nhttps://www.tradingview.com/chart/?symbol=NASDAQ%3AMU`

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(({ today, long }) => {
    const store = { [`tweets/${today}`]: { date: today, text: long, family: 'market', status: 'draft' }, 'meta/ideas': { ideas: [] } }
    const listeners = {}
    window.__store = store; window.__writes = []; window.__uploads = []
    const snapOf = (p) => ({ id: p.split('/').pop(), exists: p in store, data: () => store[p] })
    const coll = (c) => ({
      doc: (id) => db.doc(`${c}/${id}`),
      add: async (d) => { const p = `${c}/x${Object.keys(store).length}`; window.__writes.push(['add', p, d]); store[p] = d; notify(p); return db.doc(p) },
      onSnapshot: (next) => { const fire = () => next({ docs: Object.keys(store).filter((k) => k.startsWith(c + '/')).map(snapOf) }); (listeners[c] ??= []).push(fire); setTimeout(fire, 0); return () => {} },
    })
    const notify = (p) => { const c = p.split('/')[0]; (listeners[c] ?? []).forEach((f) => setTimeout(f, 0)); (listeners[p] ?? []).forEach((f) => setTimeout(() => f(snapOf(p)), 0)) }
    const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' ? merge(o[k], v) : v; return o }
    const db = {
      doc: (p) => ({
        get: async () => snapOf(p),
        update: async (d) => { if (!(p in store)) throw { code: 'invalid_argument' }; window.__writes.push(['update', p, JSON.parse(JSON.stringify(d))]); store[p] = merge(store[p], d); notify(p) },
        delete: async () => { window.__writes.push(['delete', p]); delete store[p]; notify(p) },
        onSnapshot: (next) => { (listeners[p] ??= []).push(next); setTimeout(() => next(snapOf(p)), 0); return () => {} },
      }),
      collection: coll,
    }
    const assets = { upload: async (blob) => { window.__uploads.push(blob.size); return { id: 'a'.repeat(32), url: '/_blob/' + 'a'.repeat(32), sizeBytes: blob.size, contentType: blob.type } }, delete: async () => {} }
    window.claude = { use: async (n) => ({ db, assets })[n] ?? null }
    navigator.clipboard.writeText = async (t) => { window.__copied = t }
  }, { today, long })
  await page.goto('file://' + file)
  await page.waitForTimeout(800)
  const r = {}
  const ok = []
  const check = (name, cond, info) => { ok.push([name, !!cond]); console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}: ${info}`) }

  // 5.5: one long post, X's count, the cut marker after 280, copy without the marker
  r.count = await page.$eval('.tw .foot .count:last-of-type', (n) => n.textContent)
  r.cut = await page.$$eval('.tw .body .cut', (n) => n.length)
  const xLen = await page.evaluate((t) => {
    const cp = (c) => (c <= 4351 || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247) ? 1 : 2)
    const [text, url] = [t.replace(/https?:\/\/\S+/, ''), 23]
    return [...new Intl.Segmenter().segment(text)].reduce((a, g) => a + (/\p{Extended_Pictographic}/u.test(g.segment) ? 2 : [...g.segment].reduce((s, ch) => s + cp(ch.codePointAt(0)), 0)), 0) + url
  }, long)
  check('count', r.count.includes(String(xLen)) && r.cut === 1, `"${r.count}", independent count ${xLen}, cut markers ${r.cut}`)
  await page.click('.tw [data-copy]')
  r.copied = await page.evaluate(() => window.__copied)
  check('copy', r.copied === long, `copied ${r.copied?.length} chars, same as the text: ${r.copied === long}`)

  // 5.5: thread switch → parts of at most 280, saved on the doc
  await page.click(`[data-format="${today}|thread"]`)
  await page.waitForTimeout(300)
  r.parts = await page.$$eval('.tw .body', (b) => b.length)
  r.over = await page.$$eval('.tw .count.over', (b) => b.length)
  r.format = await page.evaluate((d) => window.__store['tweets/' + d].format, today)
  check('thread', r.parts > 1 && r.over === 0 && r.format === 'thread', `${r.parts} parts, ${r.over} over 280, saved format ${r.format}`)
  await page.click(`[data-format="${today}|post"]`)
  await page.waitForTimeout(300)

  // 5.1: thumb down, two reasons, a note typed before a redraw survives, rewrite request
  await page.click(`[data-vote="${today}|down"]`)
  await page.waitForTimeout(200)
  await page.click(`[data-why="${today}|الطول"]`)
  await page.waitForTimeout(200)
  await page.fill(`textarea[data-note="${today}"]`, 'طويلة شوي')
  await page.click(`[data-why="${today}|الأسلوب"]`) // redraws; the note is read before
  await page.waitForTimeout(200)
  await page.click(`[data-rewrite="${today}"]`)
  await page.waitForTimeout(300)
  r.fb = await page.evaluate((d) => window.__store['tweets/' + d].feedback, today)
  check('feedback', r.fb?.vote === 'down' && r.fb.reasons.join() === 'الطول,الأسلوب' && r.fb.note === 'طويلة شوي' && r.fb.rewrite === true, JSON.stringify(r.fb))

  // 5.2: inbox with a screenshot
  await page.fill('#ideaText', 'فكرة: الكهرباء والذكاء الاصطناعي')
  await page.setInputFiles('#ideaFile', { name: 'shot.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') })
  await page.click('#ideaSend')
  await page.waitForTimeout(400)
  r.inbox = await page.evaluate(() => Object.entries(window.__store).filter(([k]) => k.startsWith('inbox/')).map(([, v]) => v))
  r.shown = await page.$$eval('#inboxList li', (l) => l.map((x) => x.innerText.replace(/\s+/g, ' ')))
  check('inbox', r.inbox.length === 1 && r.inbox[0].src?.startsWith('/_blob/') && r.inbox[0].status === 'new' && r.shown.length === 1, `${JSON.stringify(r.inbox[0])} · shown ${JSON.stringify(r.shown)}`)

  // tweets item 6: once posted, the numbers after 48 hours are saved and summarised by idea family
  await page.click(`[data-post="${today}"]`); await page.waitForTimeout(300)
  await page.fill(`[data-perf="${today}|url"]`, 'https://x.com/AzizzUnited/status/1'); await page.fill(`[data-perf="${today}|views"]`, '12000'); await page.fill(`[data-perf="${today}|likes"]`, '340')
  await page.click(`[data-perfsave="${today}"]`); await page.waitForTimeout(300)
  r.perf = await page.evaluate((d) => window.__store['tweets/' + d].perf, today)
  r.worked = await page.$eval('#workedRows', (t) => t.innerText.replace(/\s+/g, ' '))
  check('worked', r.perf?.views === 12000 && r.perf?.likes === 340 && /قراءة السوق 1 12,000 340/.test(r.worked), `${JSON.stringify(r.perf)} · ${r.worked}`)
  r.width = await page.evaluate(() => document.documentElement.scrollWidth)
  check('layout', r.width <= 390 && !errors.length, `scrollWidth ${r.width}, page errors ${JSON.stringify(errors)}`)
  await page.screenshot({ path: path.join(os.tmpdir(), 'tweets-check.png'), fullPage: true })
  await browser.close()
  const failed = ok.filter(([, x]) => !x).length
  console.log(failed ? `${failed} failed` : 'all ok')
  process.exit(failed ? 1 : 0)
})()
