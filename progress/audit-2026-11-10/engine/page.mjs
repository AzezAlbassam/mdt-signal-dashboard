// The page's own functions, cut out of pages/stocks.app.js by name (brace matching) and evaluated with the real engine.
import fs from 'node:fs'
import { R, E } from './lib.mjs'
const src = fs.readFileSync(`${R}/pages/stocks.app.js`, 'utf8')
function cut(name) {
  const re = new RegExp(`\\n  (?:function ${name}\\(|const ${name} = )`)
  const i = src.search(re); if (i < 0) throw new Error('no ' + name)
  const lineEnd = src.indexOf('\n', i + 1)
  const first = src.slice(i + 1, lineEnd)
  if (first.startsWith('  const') && !first.trimEnd().endsWith('{')) return first
  let d = 0, j = src.indexOf('{', i)
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (d === 0) break } }
  return src.slice(i + 1, j + 1)
}
const names = ['beta5', 'analysts', 'liveDcf', 'liveFairValues']
const body = names.map(cut).join('\n') + `\nreturn { ${names.join(', ')} }`
const { PARAMS, WEIGHTS, METHODS, blendTrimmed, allShares, quoteShares } = E
export const P = new Function('PARAMS', 'WEIGHTS', 'METHODS', 'blendTrimmed', 'allShares', 'quoteShares', body)(PARAMS, WEIGHTS, METHODS, blendTrimmed, allShares, quoteShares)
