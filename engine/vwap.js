// Session VWAP and its band width — PROTOCOL-study15.md §2.
//
// TradingView's built-in definition: VWAP = Σ v·src / Σ v from the session's first bar, and
// the "Standard Deviation" band width σ = sqrt(Σ v·(src − VWAP)² / Σ v). Each value reads the
// bars up to and including its own, never a later one.

export const hlc3 = (b) => (b.h + b.l + b.c) / 3

/**
 * @param bars session bars in order, the first one is the anchor
 * @param src price of a bar (default hlc3)
 * @param weight weight of a bar (default its volume; () => 1 gives the equal-weight control)
 * @returns [{ vwap, sd }] one per bar; null while the weights still sum to 0
 */
export function sessionVwap(bars, { src = hlc3, weight = (b) => b.v } = {}) {
  let w = 0, s1 = 0, s2 = 0
  const ref = bars.length ? src(bars[0]) : 0 // shift so the squares stay small
  return bars.map((b) => {
    const v = weight(b) || 0
    const p = src(b) - ref
    w += v; s1 += v * p; s2 += v * p * p
    if (w <= 0) return null
    const m = s1 / w
    return { vwap: ref + m, sd: Math.sqrt(Math.max(0, s2 / w - m * m)) }
  })
}
