// Packs the Twemoji SVGs into one gzipped JSON file the skill ships with.
// Run only when updating emoji, not on every build:
//
//   git clone --depth 1 --branch v17.0.3 --filter=blob:none --sparse \
//     https://github.com/jdecked/twemoji.git /tmp/twemoji
//   git -C /tmp/twemoji sparse-checkout set assets/svg
//   node scripts/pack-emoji.mjs /tmp/twemoji v17.0.3
//
// Writes vendor/emoji.json.gz ({ "1f680": "<svg ...>", ... }) and copies the
// graphics license next to it.
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const [src, version] = process.argv.slice(2)
if (!src || !version) {
  console.error('Usage: node scripts/pack-emoji.mjs <twemoji checkout> <version>')
  process.exit(1)
}

const dir = join(src, 'assets', 'svg')
const map = {}
for (const file of readdirSync(dir).sort()) {
  if (!file.endsWith('.svg')) continue
  map[file.slice(0, -4)] = readFileSync(join(dir, file), 'utf8').trim()
}

const json = JSON.stringify({ version, emoji: map })
const packed = gzipSync(json, { level: 9 })
writeFileSync('vendor/emoji.json.gz', packed)
copyFileSync(join(src, 'LICENSE-GRAPHICS'), 'vendor/LICENSE-TWEMOJI-GRAPHICS.txt')
console.log(`Packed ${Object.keys(map).length} emoji (${(json.length / 1e6).toFixed(1)} MB) into ${(packed.length / 1e6).toFixed(2)} MB`)
