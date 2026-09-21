import { chromium } from 'playwright-core'
const SP = process.env.SP
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } })
await p.goto('file://' + SP + '/v3/slides.html', { waitUntil: 'networkidle' })
const els = await p.$$('.s')
for (let i = 0; i < els.length; i++) {
  await els[i].screenshot({ path: `${SP}/v3/slide${String(i).padStart(2, '0')}.png` })
}
console.log(els.length, 'slides')
await b.close()
