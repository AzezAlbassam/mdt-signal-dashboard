// "التحليل الرقمي" — the numeric-analysis rule as @zero_en3kas published it, free and in full,
// on 2023-12-24 and 2023-12-25.
//
// The whole rule is three lines of arithmetic:
//   step  = digitSum(anchorLow) × 45
//   level = anchorLow + step, repeated
// with the step divided by 10 or 100 for cheaper instruments.
//
// The 45 is fixed. He describes the family as "مشتقة من التحليل الفلكي" — derived from
// astrological analysis — and 45° is one eighth of a 360° circle, which is where his
// worked example's step of 360 comes from (digit sum 8 × 45 = 360).
//
// Nothing here is fitted to data. It is his formula, transcribed.

const MULTIPLIER = 45

// Floating-point tidy-up: the ladder is repeated addition, which accumulates binary error
// (0.1 + 0.2 style). Prices are never meaningful past ~8 decimals, so snap there.
const tidy = (n) => Math.round(n * 1e8) / 1e8

/**
 * Digit sum of the integer part of a price — "مجموع القاع".
 * Single pass, no reduction to a digital root: 4606 → 16, not 7.
 */
export function digitSum(value) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`digitSum needs a finite number, got ${value}`)
  }
  if (value < 0) {
    throw new RangeError(`digitSum needs a non-negative number, got ${value}`)
  }
  let sum = 0
  for (const ch of String(Math.floor(value))) {
    sum += Number(ch)
  }
  return sum
}

/**
 * The divisor implied by "واقسم على ١٠ او ١٠٠ حسب سعر السهم او العمله".
 *
 * He names the two divisors but never states the cut-off. This is the reading his own
 * examples support: a four-digit index takes the raw step, a three-digit stock takes
 * step/10, and anything cheaper takes step/100. It is an inference, not his words —
 * see METHOD.md. Override it with an explicit `scale` when you disagree.
 */
export function resolveScale(price) {
  if (!Number.isFinite(price) || price <= 0) {
    throw new RangeError(`resolveScale needs a positive price, got ${price}`)
  }
  if (price >= 1000) return 1
  if (price >= 100) return 10
  return 100
}

/**
 * The step: ( مجموع القاع * ٤٥ ).
 * `scale` divides it; pass `autoScale` to derive the divisor from the anchor's magnitude.
 */
export function numericStep(anchor, { scale = 1, autoScale = false } = {}) {
  const divisor = autoScale ? resolveScale(anchor) : scale
  return tidy((digitSum(anchor) * MULTIPLIER) / divisor)
}

/**
 * The ladder: "نضيف ٣٦٠ للقاع مرتين" — add the step to the anchor, repeatedly.
 *
 * The anchor is the wave extreme he picks by eye; it is NOT returned as a level.
 * `direction: 'down'` mirrors the ladder below a wave peak.
 */
export function numericLevels({
  anchor,
  count = 2,
  direction = 'up',
  scale = 1,
  autoScale = false,
} = {}) {
  if (!Number.isInteger(count)) {
    throw new TypeError(`count must be an integer, got ${count}`)
  }
  if (count < 1) {
    throw new RangeError(`count must be positive, got ${count}`)
  }
  if (direction !== 'up' && direction !== 'down') {
    throw new RangeError(`direction must be 'up' or 'down', got ${direction}`)
  }

  const step = numericStep(anchor, { scale, autoScale })
  const sign = direction === 'up' ? 1 : -1

  const levels = []
  for (let rung = 1; rung <= count; rung += 1) {
    levels.push(tidy(anchor + sign * step * rung))
  }
  return levels
}
