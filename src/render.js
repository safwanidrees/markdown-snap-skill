import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Resvg, initWasm } from '@resvg/resvg-wasm'
import jpeg from 'jpeg-js'
import satori from 'satori'
import { createEmoji } from './emoji.js'
import { SANS, loadFonts } from './fonts.js'
import { renderMarkdown } from './markdown.js'
import { THEMES, resolveBackground } from './themes.js'

export const DEFAULTS = {
  theme: 'dark',
  background: 'grape',
  width: 720,
  padding: 64,
  fontSize: 15,
  radius: 12,
  chrome: true,
  shadow: true,
  fit: true,
  title: 'README.md',
  format: 'png',
  scale: 2,
  quality: 92,
}

const CONTENT_PAD_X = 32
const h = (type, style, children) => ({ type, props: { style, children } })

/**
 * A soft drop shadow made of stacked translucent rounded rectangles. A real
 * CSS box-shadow becomes an SVG blur filter, which resvg takes seconds to
 * rasterize at 2x (and crashes on with a negative spread).
 */
function shadowLayers(radius, { offsetY = 18, blur = 40, steps = 18, opacity = 0.5 } = {}) {
  const alpha = 1 - Math.pow(1 - opacity, 1 / steps)
  return Array.from({ length: steps }, (_, i) => {
    const spread = Math.round((blur * (i + 1)) / steps)
    return h(
      'div',
      {
        display: 'flex',
        position: 'absolute',
        top: offsetY - spread * 0.6,
        bottom: -offsetY - spread,
        left: -spread * 0.8,
        right: -spread * 0.8,
        borderRadius: radius + spread,
        backgroundColor: `rgba(0, 0, 0, ${alpha.toFixed(4)})`,
      },
      [],
    )
  })
}

let fontsCache
let emojiCache
let wasmReady

/**
 * Render markdown to an image buffer.
 * @param {string} markdown
 * @param {Partial<typeof DEFAULTS>} options
 * @param {string} assetsDir folder holding resvg.wasm and fonts/
 */
export async function renderSnap(markdown, options, assetsDir) {
  const given = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined))
  const o = { ...DEFAULTS, ...given }
  const theme = THEMES[o.theme]
  if (!theme) throw new Error(`Unknown theme "${o.theme}". Choose one of: ${Object.keys(THEMES).join(', ')}`)
  const background = resolveBackground(o.background)

  emojiCache ??= createEmoji(assetsDir)
  fontsCache ??= loadFonts(assetsDir, emojiCache)
  wasmReady ??= initWasm(readFileSync(join(assetsDir, 'resvg.wasm')))
  await wasmReady

  const emojiImage = (g) => (fontsCache.drawnAsEmoji(g) ? emojiCache.image(g) : null)
  const ctx = { theme, fs: o.fontSize, measure: fontsCache.measure, emojiImage, maxTableWidth: 0 }
  const content = renderMarkdown(markdown, ctx)

  // A table never wraps, so grow the window to fit the widest one.
  const needed = Math.ceil(ctx.maxTableWidth + CONTENT_PAD_X * 2 + 2)
  const widened = o.fit && needed > o.width
  const windowWidth = widened ? needed : o.width

  const dot = (color) => h('div', { display: 'flex', width: 12, height: 12, borderRadius: 6, backgroundColor: color }, [])
  const bar = h(
    'div',
    {
      display: 'flex',
      alignItems: 'center',
      height: 40,
      padding: '0 16px',
      backgroundColor: theme.bar,
      borderBottom: `1px solid ${theme.border}`,
    },
    [
      h('div', { display: 'flex', width: 52, gap: 8 }, [dot('#ff5f57'), dot('#febc2e'), dot('#28c840')]),
      h('div', { display: 'flex', flex: 1, justifyContent: 'center', color: theme.muted, fontSize: 13 }, o.title || ' '),
      h('div', { display: 'flex', width: 52 }, []),
    ],
  )

  const windowNode = h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      width: windowWidth,
      borderRadius: o.radius,
      overflow: 'hidden',
      backgroundColor: theme.bg,
      border: `1px solid ${theme.border}`,
    },
    [
      ...(o.chrome ? [bar] : []),
      h(
        'div',
        {
          display: 'flex',
          flexDirection: 'column',
          padding: `28px ${CONTENT_PAD_X}px 32px`,
          color: theme.fg,
          fontFamily: SANS,
          fontSize: o.fontSize,
          lineHeight: 1.65,
        },
        content,
      ),
    ],
  )

  const root = h(
    'div',
    { display: 'flex', fontFamily: SANS, padding: o.padding, ...(background ? { backgroundImage: background } : {}) },
    [h('div', { display: 'flex', position: 'relative' }, [...(o.shadow ? shadowLayers(o.radius) : []), windowNode])],
  )

  const svg = await satori(root, {
    width: windowWidth + o.padding * 2,
    fonts: fontsCache.satoriFonts,
    // Emoji are placed as images while laying out text; this only catches any
    // Satori still finds, and keeps symbols the fonts have (©, ↔) as text.
    loadAdditionalAsset: async (code, segment) => (code === 'emoji' && emojiImage(segment)) || [],
  })

  const jpegOut = o.format === 'jpeg' || o.format === 'jpg'
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: o.scale },
    // JPEG has no transparency, so a transparent background becomes white.
    ...(jpegOut ? { background: '#ffffff' } : {}),
  })
  const image = resvg.render()
  const buffer = jpegOut
    ? jpeg.encode({ data: image.pixels, width: image.width, height: image.height }, o.quality).data
    : image.asPng()

  return {
    buffer,
    width: image.width,
    height: image.height,
    format: jpegOut ? 'jpeg' : 'png',
    widenedTo: widened ? windowWidth : null,
    clippedTable: !o.fit && needed > o.width ? needed : null,
    missingGlyphs: fontsCache.missingGlyphs(markdown),
  }
}
