// Null models for scoring his rules.
//
// The whole backtest turns on these. A level rule is only interesting if it beats a
// level placed by chance in the same place at the same time — so the null has to match
// the real rule in every respect except the one being tested.

import { digitSum } from './numeric.js'

const tidy = (n) => Math.round(n * 1e8) / 1e8

/** mulberry32 — small, fast, and seeded so every reported number reproduces. */
export function seededRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Displace a level randomly but keep it on the SAME SIDE of its anchor, with the same
 * expected distance: offset ~ Uniform(0, 2 × realOffset).
 *
 * Same side matters. A level overhead and a level underfoot are touched in completely
 * different ways — one waits for a rally, the other is hit on the next bar — so mixing
 * them makes the comparison meaningless.
 */
export function displaceSameDirection(level, random) {
  const offset = level.price - level.reference
  const displaced = level.reference + offset * 2 * random()
  return { price: tidy(displaced), fromIndex: level.fromIndex, reference: level.reference }
}

/**
 * Rebuild his numeric ladder with a different multiplier in place of 45.
 *
 * This is the sharpest available test of his actual claim. Everything is held fixed —
 * the anchor low, the digit sum, the ladder, the scoring — and only the constant he
 * says is meaningful is changed. If 45 is special, 45 should win.
 */
export function reLadder({ anchorLow, fromIndex, rungs = 2 }, multiplier) {
  const step = digitSum(anchorLow) * multiplier
  const out = []
  for (let rung = 1; rung <= rungs; rung += 1) {
    out.push({
      price: tidy(anchorLow + step * rung),
      fromIndex,
      reference: anchorLow,
    })
  }
  return out
}
