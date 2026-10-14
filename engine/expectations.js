// Study 10 (PROTOCOL-study10.md §2): does the price expect more growth than the company
// delivers, while that growth is slowing? Pure; the stock page uses this same file.
// At month "YYYY-MM" only fiscal years public by then and closes up to then are read.

import { lastUsableFiscalYear, stateAt } from './fairvalue.js'
import { impliedGrowth } from './score.js'

export const GAP = 0.1

export function expectationsAt(funds, closes, month, live = false) {
  const close = closes.get(month)
  const st = stateAt(funds, month, live ? Infinity : undefined)
  if (!(close > 0) || !st) return null
  const gStar = impliedGrowth(st.fcfPS, close)
  if (gStar == null) return null
  const gReal = st.revG ?? st.epsG ?? 0
  const known = funds.filter((f) => f.year <= (live ? Infinity : lastUsableFiscalYear(month)))
  const f0 = known[known.length - 1]
  const f1 = known[known.length - 2]
  const yoy = f0 && f1 && f1.rev > 0 && Number.isFinite(f0.rev) ? f0.rev / f1.rev - 1 : null
  const slowing = yoy != null && st.revG != null && yoy < st.revG
  const gap = gStar - gReal
  const flag = gap >= GAP && slowing ? 'red' : gap <= -GAP && !slowing && yoy > 0 ? 'green' : 'neutral'
  return { gStar, gReal, gap, yoy, revG: st.revG, slowing, flag }
}
