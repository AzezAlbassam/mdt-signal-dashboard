import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const SP = process.env.SP
const FPS = 20
const SECS = [15, 14, 15, 14]   // one per case
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } })
await p.goto('file://' + SP + '/v3/anim.built.html', { waitUntil: 'networkidle' })
const el = await p.$('#stage')
for (let ci = 0; ci < SECS.length; ci++) {
  const dir = `${SP}/v3/frames/c${ci}`
  mkdirSync(dir, { recursive: true })
  const total = SECS[ci] * FPS
  for (let f = 0; f < total; f++) {
    await p.evaluate(([ci, t]) => window.render(ci, t), [ci, f / (total - 1)])
    await el.screenshot({ path: `${dir}/${String(f).padStart(4, '0')}.png` })
  }
  console.log('case', ci, total, 'frames')
}
await b.close()
