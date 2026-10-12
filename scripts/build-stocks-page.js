// Builds pages/stocks.html from pages/stocks.template.html by inlining engine/fairvalue.js
// and engine/score.js, so the page computes the score with exactly the tested code. Each
// module runs in its own scope and hands its exports to the page, like an ES module would.
//   node scripts/build-stocks-page.js
import fs from 'node:fs'

function inline(file) {
  const src = fs.readFileSync(file, 'utf8')
  const names = [...src.matchAll(/^export (?:const|function|async function) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1])
  const body = src
    .split('\n')
    .filter((l) => !/^import .* from /.test(l))
    .map((l) => l.replace(/^export (const|function|async function)/, '$1'))
    .join('\n')
  return `// ---- ${file}\nconst { ${names.join(', ')} } = (() => {\n${body}\nreturn { ${names.join(', ')} }\n})()\n`
}

const engine = ['engine/fairvalue.js', 'engine/score.js'].map(inline).join('\n')
const page = fs.readFileSync('pages/stocks.template.html', 'utf8').replace('/*ENGINE*/', () => engine)
fs.writeFileSync('pages/stocks.html', page)
console.log(`pages/stocks.html: ${page.length} bytes`)
