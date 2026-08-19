import fs from 'fs'
import path from 'path'

const src = 'src'
function walk(d, a = []) {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n)
    if (fs.statSync(p).isDirectory()) walk(p, a)
    else if (/\.(ts|vue|js)$/.test(n)) a.push(p)
  }
  return a
}
function resolve(from, spec) {
  const base = path.normalize(path.join(path.dirname(from), spec))
  for (const t of [
    base,
    base + '.ts',
    base + '.js',
    base + '.vue',
    path.join(base, 'index.ts'),
  ]) {
    if (fs.existsSync(t) && fs.statSync(t).isFile()) return t
  }
  return null
}
const bad = []
for (const f of walk(src)) {
  const text = fs.readFileSync(f, 'utf8')
  const re =
    /from\s+['"](\.[^'"]+)['"]|import\s*\(\s*['"](\.[^'"]+)['"]|require\s*\(\s*['"](\.[^'"]+)['"]/g
  let m
  while ((m = re.exec(text))) {
    const spec = m[1] || m[2] || m[3]
    if (!resolve(f, spec)) bad.push(f + ': ' + spec)
  }
}
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('all relative imports resolve')
