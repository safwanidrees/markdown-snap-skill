// Renders the examples through the built bundle and checks each output is a
// real image of the expected format, then exercises --last and saved
// defaults. Run after `npm run build`. Everything is written to test-output/.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SNAP = 'plugins/markdown-snap/skills/snap/scripts/snap.mjs'
rmSync('test-output', { recursive: true, force: true })
mkdirSync('test-output', { recursive: true })
// Never read or touch the developer's own saved look.
process.env.MARKDOWN_SNAP_CONFIG = resolve('test-output/config.json')

const cases = [
  [['examples/sample.md', '-o', 'test-output/sample.png'], 'png', null],
  [['examples/table.md', '-t', 'light', '-b', 'ocean', '-o', 'test-output/table.png'], 'png', /widened the window/],
  [['examples/table.md', '--no-fit', '-o', 'test-output/clipped.png'], 'png', /was cut off/],
  [['examples/code.md', '-t', 'dracula', '-b', 'none', '-o', 'test-output/code.jpg'], 'jpeg', null],
  [['examples/code.md', '-b', '#ff7e5f,#feb47b', '-o', 'test-output/custom-bg.png'], 'png', null],
  [['examples/code.md', '-b', '#1e1e2e', '--padding', '0', '-o', 'test-output/solid.png'], 'png', null],
]

let failed = 0
for (const [args, format, expectOut] of cases) {
  const out = execFileSync('node', [SNAP, ...args], { encoding: 'utf8' })
  const file = readFileSync(args[args.indexOf('-o') + 1])
  const isPng = file.subarray(1, 4).toString() === 'PNG'
  const isJpeg = file[0] === 0xff && file[1] === 0xd8
  const ok = (format === 'png' ? isPng : isJpeg) && (!expectOut || expectOut.test(out))
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${args.join(' ')}`)
  if (!ok) failed++
}

for (const bad of [['missing.md'], ['examples/sample.md', '-t', 'neon'], ['examples/sample.md', '-b', 'notacolor']]) {
  try {
    execFileSync('node', [SNAP, ...bad], { stdio: 'pipe' })
    console.log(`FAIL expected an error: ${bad.join(' ')}`)
    failed++
  } catch {
    console.log(`ok   errors on: ${bad.join(' ')}`)
  }
}

// Emoji and symbols draw without warnings; right-to-left text still warns.
const snapText = (md) =>
  execFileSync('node', [SNAP, '-', '-o', 'test-output/text.png', '--scale', '1'], { input: md, encoding: 'utf8' })
for (const [name, md, expectWarning] of [
  ['emoji, flags, skin tones, ZWJ and keycaps', 'Done ✅ 🚀 👋🏽 🇵🇰 👨‍👩‍👧 ❤️ 1️⃣\n\n| ✅ | 🎉 |\n|---|---|\n| `✅` | ok |', false],
  ['arrows and symbols', 'a → b ↔ c ≈ ≠ ≤ ≥ ★ ✓ ✔ ✗ © ™', false],
  ['emoji the symbol fonts also contain (⏳ ⌛ ⌚)', '⏳ Started ⌛ ⌚', false],
  ['right-to-left text warns', 'سلام', true],
]) {
  const warned = /can't be drawn correctly/.test(snapText(md))
  const ok = warned === expectWarning
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
  if (!ok) failed++
}

// --last: read the previous reply from a fake Claude Code transcript.
const config = resolve('test-output/claude-config')
const outDir = resolve('test-output/snaps')
rmSync(config, { recursive: true, force: true })
rmSync(outDir, { recursive: true, force: true })
mkdirSync(join(config, 'projects', 'demo'), { recursive: true })
const line = (o) => JSON.stringify(o)
writeFileSync(
  join(config, 'projects', 'demo', 'session-1.jsonl'),
  [
    line({ type: 'user', message: { role: 'user', content: 'give me a table' } }),
    line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Let me check.' }, { type: 'tool_use', id: 't1', name: 'Read', input: {} }] } }),
    line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } }),
    line({ type: 'assistant', message: { content: [{ type: 'text', text: '# Final answer\n\n| a | b |\n|---|---|\n| 1 | 2 |' }] } }),
    line({ type: 'user', message: { role: 'user', content: 'snap your last message' } }),
    line({ type: 'user', isMeta: true, message: { content: [{ type: 'text', text: 'Base directory for this skill: ...' }] } }),
  ].join('\n'),
)
const env = { ...process.env, CLAUDE_CONFIG_DIR: config, MARKDOWN_SNAP_DIR: outDir, MARKDOWN_SNAP_CONFIG: join(config, 'snap.json') }
for (let run = 0; run < 2; run++) {
  const out = execFileSync('node', [SNAP, '--last', '--session', 'session-1', '--scale', '1'], { encoding: 'utf8', env })
  const ok = /Source: Claude's last reply/.test(out)
  console.log(`${ok ? 'ok  ' : 'FAIL'} --last run ${run + 1}`)
  if (!ok) failed++
}
const saved = readdirSync(outDir)
const unique = saved.length === 2 && saved.every((f) => /^claude-reply-\d{4}-\d{2}-\d{2}-\d{6}(-2)?\.png$/.test(f))
console.log(`${unique ? 'ok  ' : 'FAIL'} two snaps saved under distinct names: ${saved.join(', ')}`)
if (!unique) failed++

// Saved defaults: not set, then saved, then used, then cleared.
const run = (...a) => execFileSync('node', [SNAP, ...a], { encoding: 'utf8', env })
const checks = [
  ['not set before saving', () => /Saved defaults: not set/.test(run('--config'))],
  ['save without an input', () => /background=ocean, theme=light/.test(run('--bg', 'ocean', '-t', 'light', '--save-defaults'))],
  ['first-run note gone once saved', () => !/no saved defaults/.test(run('examples/code.md', '--scale', '1'))],
  ['one-off override leaves defaults', () => (run('examples/code.md', '-b', 'mint', '--scale', '1'), /background=ocean/.test(run('--config')))],
  ['reset clears them', () => (run('--reset-defaults'), /not set/.test(run('--config')))],
]
for (const [name, check] of checks) {
  const ok = check()
  console.log(`${ok ? 'ok  ' : 'FAIL'} defaults: ${name}`)
  if (!ok) failed++
}

process.exit(failed ? 1 : 0)
