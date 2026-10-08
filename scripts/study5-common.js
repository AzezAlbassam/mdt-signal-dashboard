// Shared pooling for study 5 search and confirmation (returns in %, not R).
export function pool(syms, key, { group = null, periods = ['I', 'II'] } = {}) {
  const [, , ex, fl] = key.split('|')
  let n = 0, wins = 0, sum = 0, base = 0, baseWins = 0, exSum = 0, exN = 0
  const parts = []
  const all = []
  for (const x of syms) {
    if (group && x.group !== group) continue
    const tr = x.trades[key]
    if (!tr) continue
    for (const p of periods) {
      const t = tr[p]
      const b = x.base[`${ex}|${fl}`][p]
      if (!t.ret.length || !b.ret.length) continue
      n += t.ret.length
      let bs = 0
      for (const v of b.ret) bs += v
      base += t.ret.length * (bs / b.ret.length)
      baseWins += t.ret.length * (b.wins / b.ret.length)
      for (let j = 0; j < t.ret.length; j += 1) {
        sum += t.ret[j]; all.push(t.ret[j])
        if (t.ret[j] > 0) wins += 1
        if (Number.isFinite(t.excess[j])) { exSum += t.excess[j]; exN += 1 }
      }
      parts.push([t.ret.length, b.ret])
    }
  }
  all.sort((a, b) => a - b)
  return { n, win: n ? wins / n : NaN, baseWin: n ? baseWins / n : NaN, mean: n ? sum / n : NaN, median: n ? all[n >> 1] : NaN, edge: n ? (sum - base) / n : NaN, excessSpy: exN ? exSum / exN : NaN, parts }
}

export function permutationP(stat, rng, draws = 2000) {
  let ge = 0
  for (let d = 0; d < draws; d += 1) {
    let s = 0
    for (const [k, R] of stat.parts) for (let j = 0; j < k; j += 1) s += R[Math.floor(rng() * R.length)]
    if (s / stat.n >= stat.mean) ge += 1
  }
  return (ge + 1) / (draws + 1)
}
