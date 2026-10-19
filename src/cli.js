import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULTS, renderSnap } from './render.js'
import { configPath, describePrefs, loadPrefs, resetPrefs, savePrefs } from './prefs.js'
import { BACKGROUNDS, THEMES, resolveBackground } from './themes.js'
import { findTranscript, lastAssistantMessage } from './transcript.js'

const HELP = `Usage: node snap.mjs <file.md | -> [options]
       node snap.mjs --last [--session <id>] [options]

Turns markdown into a styled, CodeSnap-like image. Use "-" to read stdin,
or --last to snap Claude's previous reply in a Claude Code session.

Images go to $MARKDOWN_SNAP_DIR, or ~/Pictures/markdown-snaps (~/markdown-snaps
when there is no Pictures folder), named <title>-<date>-<time>.png.

Input
      --last              Use Claude's last reply from the session transcript
      --session <id>      Session to read with --last (default: newest for this folder)

Output
  -o, --out <path>        Exact output file (overrides the folder and name)
      --out-dir <dir>     Folder to save in (default: see above)
      --open              Open the image in the default viewer afterwards
  -t, --theme <name>      ${Object.keys(THEMES).join(' | ')} (default: ${DEFAULTS.theme})
  -b, --bg, --background  ${Object.keys(BACKGROUNDS).join(' | ')} (default: ${DEFAULTS.background}),
                          or a color "#1e1e2e", colors "#ff7e5f,#feb47b", or a CSS gradient
  -w, --width <px>        Window width (default: ${DEFAULTS.width})
      --padding <px>      Space around the window (default: ${DEFAULTS.padding})
      --font-size <px>    Base font size (default: ${DEFAULTS.fontSize})
      --radius <px>       Window corner radius (default: ${DEFAULTS.radius})
      --title <text>      Window title (default: input file name, or the output name for stdin)
      --format <png|jpeg> Output format (default: from --out extension, else png)
      --scale <1-4>       Pixel ratio (default: ${DEFAULTS.scale})
      --quality <1-100>   JPEG quality (default: ${DEFAULTS.quality})
      --no-chrome         Hide the window bar and its dots
      --no-shadow         No drop shadow
      --no-fit            Keep the width even if a table is wider (it gets cut off)
      --chrome, --shadow  Turn the window bar / shadow back on over a saved default

Saved defaults (stored in ~/.config/markdown-snap/config.json)
      --config            Show the saved defaults ("not set" before the first save)
      --save-defaults     Save this run's style options as the defaults; works
                          without an input to only save
      --reset-defaults    Forget the saved defaults
  -h, --help              Show this help
`

const ALIASES = { o: 'out', t: 'theme', b: 'bg', background: 'bg', w: 'width', h: 'help' }
const NUMERIC = new Set(['width', 'padding', 'font-size', 'radius', 'scale', 'quality'])
const FLAGS = new Set(['help', 'no-chrome', 'no-shadow', 'no-fit', 'chrome', 'shadow', 'last', 'open', 'config', 'save-defaults', 'reset-defaults'])

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-' || !a.startsWith('-')) {
      args._.push(a)
      continue
    }
    let [key, value] = a.replace(/^--?/, '').split(/=(.*)/s)
    key = ALIASES[key] ?? key
    if (FLAGS.has(key)) {
      args[key] = true
      continue
    }
    if (value === undefined) value = argv[++i]
    if (value === undefined) throw new Error(`Missing value for --${key}`)
    if (NUMERIC.has(key)) {
      const n = Number(value)
      if (!Number.isFinite(n) || n < 0) throw new Error(`--${key} needs a positive number, got "${value}"`)
      args[key] = n
    } else args[key] = value
  }
  return args
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function defaultOutDir() {
  if (process.env.MARKDOWN_SNAP_DIR) return resolve(process.env.MARKDOWN_SNAP_DIR)
  const pictures = join(homedir(), 'Pictures')
  return existsSync(pictures) ? join(pictures, 'markdown-snaps') : join(homedir(), 'markdown-snaps')
}

function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

const slugify = (name) =>
  name
    .replace(/\.(md|markdown|txt)$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'snap'

/** Never overwrite: add -2, -3... when the name is taken. */
function uniquePath(file) {
  if (!existsSync(file)) return file
  const ext = extname(file)
  const stem = file.slice(0, -ext.length)
  for (let n = 2; ; n++) if (!existsSync(`${stem}-${n}${ext}`)) return `${stem}-${n}${ext}`
}

function openFile(file) {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [file]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]] : ['xdg-open', [file]]
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref()
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.config) {
    const prefs = loadPrefs()
    process.stdout.write(`Config: ${configPath()}\nSaved defaults: ${prefs ? describePrefs(prefs) || '(empty)' : 'not set'}\n`)
    return
  }
  if (args['reset-defaults']) {
    resetPrefs()
    process.stdout.write(`Saved defaults cleared (${configPath()}).\n`)
    return
  }

  // Style options given on this run; anything left out falls back to the
  // saved defaults, then to the built-in ones.
  const given = {
    background: args.bg,
    theme: args.theme,
    width: args.width,
    padding: args.padding,
    fontSize: args['font-size'],
    radius: args.radius,
    scale: args.scale === undefined ? undefined : Math.min(4, Math.max(1, args.scale)),
    chrome: args['no-chrome'] ? false : args.chrome ? true : undefined,
    shadow: args['no-shadow'] ? false : args.shadow ? true : undefined,
  }
  for (const k of Object.keys(given)) if (given[k] === undefined) delete given[k]
  if (given.background !== undefined) resolveBackground(given.background)
  if (given.theme !== undefined && !(given.theme in THEMES))
    throw new Error(`Unknown theme "${given.theme}". Choose one of: ${Object.keys(THEMES).join(', ')}`)

  const prefs = loadPrefs()
  const style = { ...prefs, ...given }
  const hasInput = args._.length > 0 || args.last

  if (args['save-defaults']) {
    const saved = savePrefs(style)
    process.stdout.write(`Saved defaults: ${describePrefs(saved)} (${configPath()})\n`)
    if (!hasInput) return
  }

  if (args.help || !hasInput) {
    process.stdout.write(HELP)
    process.exit(args.help ? 0 : 1)
  }

  const input = args.last ? null : args._[0]
  let markdown
  let source
  if (args.last) {
    const transcript = findTranscript(args.session)
    markdown = lastAssistantMessage(transcript)
    source = `Claude's last reply (${basename(transcript)})`
  } else {
    markdown = input === '-' ? await readStdin() : readFileSync(input, 'utf8')
  }
  if (!markdown.trim()) throw new Error('The markdown is empty.')

  const outExt = args.out ? extname(args.out).slice(1).toLowerCase() : ''
  const format = (args.format ?? (['jpg', 'jpeg'].includes(outExt) ? 'jpeg' : 'png')).toLowerCase()
  if (!['png', 'jpeg', 'jpg'].includes(format)) throw new Error(`--format must be png or jpeg, got "${format}"`)
  const ext = format === 'png' ? 'png' : 'jpg'

  const title =
    args.title ??
    (args.last
      ? 'claude-reply.md'
      : input === '-'
        ? args.out
          ? `${basename(args.out, extname(args.out))}.md`
          : 'snap.md'
        : basename(input))

  let out
  if (args.out) out = resolve(args.out)
  else {
    const dir = args['out-dir'] ? resolve(args['out-dir']) : defaultOutDir()
    out = uniquePath(join(dir, `${slugify(title)}-${timestamp()}.${ext}`))
  }
  mkdirSync(dirname(out), { recursive: true })

  const assetsDir = fileURLToPath(new URL('../assets/', import.meta.url))
  const result = await renderSnap(
    markdown,
    {
      ...style,
      title,
      format,
      quality: args.quality === undefined ? undefined : Math.min(100, Math.max(1, Math.round(args.quality))),
      fit: !args['no-fit'],
    },
    assetsDir,
  )
  writeFileSync(out, result.buffer)

  const lines = [`Saved ${out} (${result.width}x${result.height} ${result.format.toUpperCase()})`]
  if (source) lines.push(`Source: ${source}`)
  if (!prefs && !args['save-defaults'])
    lines.push('Note: no saved defaults yet, so the built-in look was used. Save one with --save-defaults.')
  if (result.widenedTo) lines.push(`Note: widened the window to ${result.widenedTo}px to fit a table.`)
  if (result.clippedTable) lines.push(`Warning: a table is ${result.clippedTable}px wide and was cut off (drop --no-fit or raise --width).`)
  if (result.missingGlyphs.length)
    lines.push(
      `Warning: these characters can't be drawn correctly (not in the bundled fonts, or right-to-left text) and may show as boxes or scrambled: ${result.missingGlyphs.slice(0, 20).join(' ')}`,
    )
  process.stdout.write(lines.join('\n') + '\n')
  if (args.open) openFile(out)
}

main().catch((err) => {
  if (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EROFS') {
    process.stderr.write(
      `markdown-snap: no permission to write ${err.path ?? 'the file'}. ` +
        'If this runs in a sandbox, save inside the workspace instead, e.g. --out-dir ./snaps\n',
    )
    process.exit(1)
  }
  process.stderr.write(`markdown-snap: ${err.message}\n`)
  process.exit(1)
})
