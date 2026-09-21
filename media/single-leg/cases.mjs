#!/usr/bin/env node
/**
 * The four real months the poster and the video draw, written to stdout as
 * JSON. They are not chosen by hand: each is the extreme of a category the
 * study cares about, pulled straight out of the simulation.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { simulateSingle } from '../../lib/premium.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const S = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/market-long.json'), 'utf8')).sessions

const all = []
for (let start = 0; start < 21; start++) {
  all.push(...simulateSingle(S, {
    hold: 21, widthSigma: 1.25, side: 'call', structure: 'spread', wingSigma: 0.5, start, costPerLeg: 0.05,
  }))
}
const byDate = new Map(all.map((t) => [t.entryDate, t]))
const index = new Map(S.map((s, i) => [s.date, i]))

const CASES = [
  { d: '2020-02-21', label: 'The crash month', sub: 'the side you are not short cannot hurt you',
    lesson: 'The index fell 33 per cent. You were short the <b>call</b>, so none of it reached you. You kept the whole credit — the same 6 per cent as the quietest month of the decade.' },
  { d: '2019-01-14', label: 'Won by a single point', sub: 'the closest call that still paid',
    lesson: 'The index finished within a tenth of a point of your short strike. A cash-settled European option has no assignment and no early exercise: above the strike by any amount is a full loss, below it by any amount is a full win. It closed below.' },
  { d: '2022-07-14', label: 'The full loss', sub: 'a bear-market rally, +13 per cent in a month',
    lesson: 'The index blew through both strikes. You lost the entire maximum — and <b>the entire maximum was a number you knew on the day you opened it.</b> No gap, halt or margin call could make it larger. This happens about once every two and a half years.' },
  { d: '2025-04-21', label: 'A partial loss', sub: 'the V-shaped recovery off the April low',
    lesson: 'The index closed between your two strikes, so the loss was part of the maximum rather than all of it. Seventy per cent of the risk. Most losing months look like this one, not like the month above.' },
]

const out = CASES.map((c) => {
  const t = byDate.get(c.d)
  if (!t) throw new Error(`no trade opened on ${c.d}`)
  const path = S.slice(index.get(t.entryDate), index.get(t.exitDate) + 1)
    .map((s) => ({ d: s.date, o: s.open, h: s.high, l: s.low, c: s.close }))
  return {
    ...c, path, S0: t.S0, S1: t.S1, shortStrike: t.shortStrike, longStrike: t.longStrike,
    move: t.move, credit: t.premiumIn, maxLoss: t.maxLoss, pnl: t.pnl, pnlPctOfRisk: t.pnlPctOfRisk,
    entryDate: t.entryDate, exitDate: t.exitDate, entryVix: t.entryVix, days: t.calendarDays,
    movePct: t.movePct, settlement: t.settlement,
  }
})
process.stdout.write(JSON.stringify(out, null, 1) + '\n')
