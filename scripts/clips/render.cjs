// node render.cjs preview  → a few key frames as PNGs
// node render.cjs video    → every frame piped into ffmpeg → clip.mp4
const { chromium } = require('playwright')
const fs = require('fs')
const { spawn } = require('child_process')
const dir = __dirname
const mode = process.argv[2] || 'preview'
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined })
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
  const errs = []; p.on('pageerror', (e) => errs.push(e.message))
  await p.addInitScript((d) => { window.DATA = d }, JSON.parse(fs.readFileSync(dir + '/series.json', 'utf8')))
  await p.goto('file://' + dir + '/clip.html')
  await p.evaluate(() => Promise.all(['800 40px "Noto Kufi Arabic"', '600 24px "Noto Kufi Arabic"', '600 24px "IBM Plex Sans Arabic"', '500 20px "IBM Plex Sans Arabic"', '600 22px "IBM Plex Mono"', '500 16px "IBM Plex Mono"'].map((f) => document.fonts.load(f, 'أب$1'))))
  const frames = await p.evaluate(() => window.FRAMES)
  const grab = async (f) => Buffer.from((await p.evaluate((f) => { window.draw(f); return document.getElementById('c').toDataURL('image/png') }, f)).split(',')[1], 'base64')
  if (mode === 'preview') {
    for (const s of [0.2, 5, 11.5, 15.5, 20.5]) fs.writeFileSync(`${dir}/frame-${s}.png`, await grab(Math.round(s * 25)))
  } else {
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '25', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', dir + '/clip.mp4'])
    for (let f = 0; f < frames; f++) { if (!ff.stdin.write(await grab(f))) await new Promise((ok) => ff.stdin.once('drain', ok)) }
    ff.stdin.end(); await new Promise((ok) => ff.on('close', ok))
  }
  console.log({ frames, errs })
  await b.close()
})()
