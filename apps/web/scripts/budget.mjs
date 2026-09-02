#!/usr/bin/env node
/**
 * Bundle budget (spec §5.6): initial JS ≤ 450 KB gzip. Measures every JS chunk referenced by
 * dist/index.html (modulepreload + entry) plus the chunks they statically import, i.e. what the
 * browser must download before first render. Fails the build when exceeded.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const dist = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const BUDGET = 450 * 1024

const html = readFileSync(join(dist, 'index.html'), 'utf8')
const initial = new Set(
  [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]),
)
const assets = join(dist, 'assets')
const files = readdirSync(assets).filter((f) => f.endsWith('.js'))

// follow static imports of initial chunks
const seen = new Set()
const queue = [...initial]
while (queue.length) {
  const f = queue.pop()
  if (!f || seen.has(f)) continue
  seen.add(f)
  const src = readFileSync(join(dist, f), 'utf8')
  for (const m of src.matchAll(
    /(?:^|[;\s])import\s*(?:[^'"]*?from\s*)?["']\.\/([^"']+\.js)["']/g,
  )) {
    const dep = `assets/${m[1]}`
    if (!seen.has(dep)) queue.push(dep)
  }
}

let total = 0
const rows = []
for (const f of [...seen].sort()) {
  const gz = gzipSync(readFileSync(join(dist, f))).length
  total += gz
  rows.push({ chunk: f.replace('assets/', ''), gzipKB: (gz / 1024).toFixed(1) })
}
const lazy = files
  .filter((f) => !seen.has(`assets/${f}`))
  .map((f) => ({
    chunk: f,
    gzipKB: (gzipSync(readFileSync(join(assets, f))).length / 1024).toFixed(1),
    lazy: true,
  }))
console.table([...rows, ...lazy])
console.log(
  `initial JS: ${(total / 1024).toFixed(1)} KB gzip (budget ${(BUDGET / 1024).toFixed(0)} KB)`,
)
const css = readdirSync(assets)
  .filter((f) => f.endsWith('.css'))
  .reduce((s, f) => s + statSync(join(assets, f)).size, 0)
console.log(`css: ${(css / 1024).toFixed(1)} KB raw`)
if (total > BUDGET) {
  console.error(`✗ over budget by ${((total - BUDGET) / 1024).toFixed(1)} KB`)
  process.exit(1)
}
console.log('✓ within budget')
