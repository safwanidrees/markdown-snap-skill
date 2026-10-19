// Bundles src/ into one self-contained script inside the skill folder and
// copies the WASM + fonts next to it, so installing the plugin needs no
// `npm install` and nothing is downloaded at run time.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { build } from 'esbuild'

const SKILL = 'plugins/markdown-snap/skills/snap'
const FONTS = `${SKILL}/assets/fonts`

rmSync(`${SKILL}/scripts`, { recursive: true, force: true })
rmSync(`${SKILL}/assets`, { recursive: true, force: true })
mkdirSync(FONTS, { recursive: true })

const result = await build({
  metafile: true,
  entryPoints: ['src/cli.js'],
  outfile: `${SKILL}/scripts/snap.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  minify: !process.env.DEBUG,
  legalComments: 'none',
  // CommonJS dependencies call require(), and harfbuzzjs (used by Satori)
  // loads hb.wasm from __dirname, which ES modules don't define.
  banner: {
    js: [
      "import { createRequire as __snapRequire } from 'node:module';",
      "import { dirname as __snapDirname } from 'node:path';",
      "import { fileURLToPath as __snapToPath } from 'node:url';",
      'const require = __snapRequire(import.meta.url);',
      'const __filename = __snapToPath(import.meta.url);',
      'const __dirname = __snapDirname(__filename);',
    ].join(' '),
  },
})

copyFileSync('node_modules/harfbuzzjs/hb.wasm', `${SKILL}/scripts/hb.wasm`)
copyFileSync('node_modules/@resvg/resvg-wasm/index_bg.wasm', `${SKILL}/assets/resvg.wasm`)
// Packed by scripts/pack-emoji.mjs; committed so builds stay offline and reproducible.
copyFileSync('vendor/emoji.json.gz', `${SKILL}/assets/emoji.json.gz`)

const faces = [
  ['inter', '400-normal'], ['inter', '400-italic'], ['inter', '600-normal'], ['inter', '700-normal'], ['inter', '700-italic'],
  ['jetbrains-mono', '400-normal'], ['jetbrains-mono', '400-italic'], ['jetbrains-mono', '700-normal'],
]
for (const [family, face] of faces) {
  for (const subset of ['latin', 'latin-ext']) {
    const file = `${family}-${subset}-${face}.woff`
    copyFileSync(`node_modules/@fontsource/${family}/files/${file}`, `${FONTS}/${file}`)
  }
}
for (const [family, file] of [
  ['noto-sans-math', 'noto-sans-math-latin-400-normal.woff'],
  ['noto-sans-symbols-2', 'noto-sans-symbols-2-symbols-400-normal.woff'],
]) {
  copyFileSync(`node_modules/@fontsource/${family}/files/${file}`, `${FONTS}/${file}`)
}
copyFileSync('node_modules/@fontsource/noto-sans-math/LICENSE', `${FONTS}/LICENSE-NotoSansMath.txt`)
copyFileSync('node_modules/@fontsource/noto-sans-symbols-2/LICENSE', `${FONTS}/LICENSE-NotoSansSymbols2.txt`)
copyFileSync('node_modules/@fontsource/inter/LICENSE', `${FONTS}/LICENSE-Inter.txt`)
copyFileSync('node_modules/@fontsource/jetbrains-mono/LICENSE', `${FONTS}/LICENSE-JetBrainsMono.txt`)

// License texts for every npm package that ended up in the bundle (plus the
// WASM files copied next to it), so the published skill carries its notices.
const pkgs = new Set(['@resvg/resvg-wasm', 'harfbuzzjs'])
for (const file of Object.keys(result.metafile.inputs)) {
  const m = file.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/g)
  if (m) pkgs.add(m[m.length - 1].replace('node_modules/', ''))
}
const notices = [...pkgs].sort().map((name) => {
  const dir = `node_modules/${name}`
  const { version, license } = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'))
  const licenseFile = readdirSync(dir).find((f) => /^(licen[cs]e|copying)/i.test(f))
  const text = licenseFile ? readFileSync(`${dir}/${licenseFile}`, 'utf8').trim() : `License: ${license}`
  return `${name}@${version} (${license})\n${'-'.repeat(60)}\n${text}\n`
})
const { version: emojiVersion } = JSON.parse(gunzipSync(readFileSync('vendor/emoji.json.gz')).toString('utf8'))
notices.push(
  `Twemoji graphics ${emojiVersion} (CC-BY-4.0)\n${'-'.repeat(60)}\n` +
    'Emoji graphics by Twitter, Inc and other contributors (https://github.com/jdecked/twemoji),\n' +
    'licensed under CC-BY 4.0: https://creativecommons.org/licenses/by/4.0/\n\n' +
    readFileSync('vendor/LICENSE-TWEMOJI-GRAPHICS.txt', 'utf8').trim() + '\n',
)
// Some license files use CRLF; normalize so the output is identical on every OS.
writeFileSync(`${SKILL}/THIRD_PARTY_LICENSES.txt`, notices.join('\n\n').replace(/\r\n?/g, '\n'))
rmSync(`${SKILL}/scripts/snap.mjs.LEGAL.txt`, { force: true })
if (!existsSync(`${SKILL}/SKILL.md`)) throw new Error('SKILL.md is missing')

console.log(`Built ${SKILL} (${pkgs.size} bundled packages)`)
