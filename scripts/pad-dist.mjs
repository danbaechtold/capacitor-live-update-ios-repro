// Pads dist/ with deterministic filler files so manifest uploads mirror a
// production-scale SPA (~180 files, ~4 MB). Content is derived only from the
// file index, so repeated builds produce byte-identical filler — a re-upload
// after a marker change is then a true partial/delta update (2-3 changed
// files out of ~180), like a real app release.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'dist', 'pad')
const FILES = 180
const LINES = 400 // ~22 KB per file -> ~4 MB total

mkdirSync(OUT, { recursive: true })
for (let i = 0; i < FILES; i++) {
  const lines = []
  for (let l = 0; l < LINES; l++) {
    lines.push(`export const pad_${i}_${l} = "${String(i).padStart(3, '0')}-${String(l).padStart(4, '0')}".repeat(4);`)
  }
  writeFileSync(join(OUT, `pad-${String(i).padStart(3, '0')}.js`), lines.join('\n') + '\n')
}
console.log(`padded dist with ${FILES} deterministic files`)
