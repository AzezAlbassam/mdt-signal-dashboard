// The page's own functions (pages/stocks.app.js), cut out by name with brace matching and evaluated
// against the real engine, so unit tests check exactly the code the page runs (from the audit's probes).
import fs from 'node:fs'
import * as E from '../../engine/fairvalue.js'

const src = fs.readFileSync(new URL('../../pages/stocks.app.js', import.meta.url), 'utf8')
function cut(name) {
  const re = new RegExp(`\\n  (?:async function ${name}\\(|function ${name}\\(|const ${name} = )`)
  const i = src.search(re)
  if (i < 0) throw new Error('no ' + name)
  const lineEnd = src.indexOf('\n', i + 1)
  const first = src.slice(i + 1, lineEnd)
  if (first.trimStart().startsWith('const') && !first.trimEnd().endsWith('{')) return first
  let d = 0
  let j = src.indexOf('{', i)
  for (; j < src.length; j += 1) { if (src[j] === '{') d += 1; else if (src[j] === '}') { d -= 1; if (d === 0) break } }
  return src.slice(i + 1, j + 1)
}

/** pageFns(['analysts', 'liveDcf']) → those functions, with the engine's exports and `extra` in scope. */
export function pageFns(names, extra = {}) {
  const scope = { ...E, ...extra }
  const body = names.map(cut).join('\n') + `\nreturn { ${names.join(', ')} }`
  return new Function(...Object.keys(scope), body)(...Object.values(scope))
}
