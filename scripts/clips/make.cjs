// A clip from a JSON spec (audit plan 5.4): scenes drawn by scenes.html, frames piped into ffmpeg, a beatbox
// loop from beatbox.py (synthesised, so the rights are the user's) muxed in.
//   node scripts/clips/make.cjs <spec.json> <out.mp4> [--preview]   (--preview: 4 PNG frames next to out, no video)
// Spec (spec.example.json): { handle, source, footer, beat: 'bounce'|'boombap'|'lofi'|'trap'|null, fps,
//   scenes: [ { kind: 'race', seconds, title, subtitle, start: 'YYYY-MM', unit, rebase, series: [{ ticker, name, values }],
//                periods: [{ from, to }] },
//             { kind: 'scoreboard', seconds, title, subtitle, items: [{ label, winner }], legend: [..], colors },
//             { kind: 'bars', seconds, title, subtitle, unit, decimals, bars: [{ label, value }], note } ] }
// Every number must come from TradingView (or FRED) fetched for the post, and be in the post's facts.
const { chromium } = require('playwright')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn, spawnSync } = require('child_process')

const [specPath, out, flag] = process.argv.slice(2)
if (!specPath || !out) { console.error('usage: node make.cjs <spec.json> <out.mp4> [--preview]'); process.exit(2) }
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))
// checks that catch a bad spec before a minute of rendering
for (const sc of spec.scenes ?? []) {
  if (!['race', 'scoreboard', 'bars'].includes(sc.kind) || !(sc.seconds > 0)) throw new Error(`bad scene ${JSON.stringify(sc).slice(0, 80)}`)
  if (sc.kind === 'race') {
    const n = sc.series?.[0]?.values?.length
    if (!n || sc.series.some((x) => x.values.length !== n || x.values.some((v) => !(v > 0)) || !/^[A-Z0-9.&]+$/.test(x.ticker))) throw new Error('race: series need equal-length positive values and an English ticker')
    if (!/^\d{4}-\d{2}$/.test(sc.start ?? '')) throw new Error('race: start must be YYYY-MM')
  }
  if (sc.kind === 'bars' && !sc.bars?.every((b) => Number.isFinite(b.value))) throw new Error('bars: every bar needs a number')
}
const dir = __dirname
;(async () => {
  const b = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined })
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.addInitScript((s) => { window.SPEC = s }, spec)
  await p.goto('file://' + path.join(dir, 'scenes.html'))
  await p.evaluate(() => Promise.all(['800 40px "Noto Kufi Arabic"', '600 24px "IBM Plex Sans Arabic"', '500 20px "IBM Plex Sans Arabic"', '600 22px "IBM Plex Mono"', '500 16px "IBM Plex Mono"'].map((f) => document.fonts.load(f, 'أب$1')).concat(document.fonts.ready)))
  const frames = await p.evaluate(() => window.FRAMES)
  const fps = spec.fps ?? 25
  const grab = async (f) => Buffer.from((await p.evaluate((f) => { window.draw(f); return document.getElementById('c').toDataURL('image/png') }, f)).split(',')[1], 'base64')
  if (flag === '--preview') {
    for (const k of [0.15, 0.4, 0.65, 0.9]) fs.writeFileSync(out.replace(/\.mp4$/, '') + `-${Math.round(k * 100)}.png`, await grab(Math.floor(k * frames)))
  } else {
    const silent = path.join(os.tmpdir(), `clip-${process.pid}.mp4`)
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', spec.beat ? silent : out])
    for (let f = 0; f < frames; f += 1) { if (!ff.stdin.write(await grab(f))) await new Promise((ok) => ff.stdin.once('drain', ok)) }
    ff.stdin.end()
    await new Promise((ok) => ff.on('close', ok))
    if (spec.beat) {
      const wav = path.join(os.tmpdir(), `beat-${process.pid}.wav`)
      const r = spawnSync('python3', ['-I', path.join(dir, 'beatbox.py'), String(frames / fps), wav, spec.beat], { encoding: 'utf8' })
      if (r.status !== 0) throw new Error(r.stderr)
      const m = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', out])
      if (m.status !== 0) throw new Error(String(m.stderr))
      fs.rmSync(silent); fs.rmSync(wav)
    }
  }
  console.log(JSON.stringify({ out, frames, seconds: frames / fps, errors: errs }))
  await b.close()
  if (errs.length) process.exit(1)
})()
