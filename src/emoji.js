import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

// Emoji are drawn as Twemoji SVGs (bundled in assets/emoji.json.gz) because
// the text fonts have no emoji. markdown.js places each one as an image
// while laying out text.

let table

function load(assetsDir) {
  if (!table) {
    const file = join(assetsDir, 'emoji.json.gz')
    table = existsSync(file) ? JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')).emoji : {}
  }
  return table
}

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })

/** Split text into user-perceived characters (so 👍🏽 or 🇵🇰 stay whole). */
export const graphemes = (text) => Array.from(segmenter.segment(text), (s) => s.segment)

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u
export const looksLikeEmoji = (g) => EMOJI.test(g)

const hex = (g) => Array.from(g, (ch) => ch.codePointAt(0).toString(16)).join('-')

/**
 * Twemoji file names are the code points joined by "-", without the FE0F
 * variation selector unless the emoji is a ZWJ sequence.
 */
function svgFor(map, g) {
  const plain = g.includes('\u200d') ? g : g.replace(/\ufe0f/g, '')
  return map[hex(plain)] ?? map[hex(g)] ?? map[hex(g.replace(/\ufe0f/g, ''))]
}

export function createEmoji(assetsDir) {
  // The table is only unpacked the first time a snap actually contains emoji.
  const lookup = (g) => (looksLikeEmoji(g) ? svgFor(load(assetsDir), g) : undefined)
  return {
    has: (g) => lookup(g) !== undefined,
    /** A data: URI for the emoji's SVG, or null. */
    image(g) {
      const svg = lookup(g)
      return svg ? `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` : null
    },
  }
}
