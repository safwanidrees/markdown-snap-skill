import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import opentype from 'opentype.js'
import { graphemes } from './emoji.js'

// Each face ships as two subsets: basic Latin and extended Latin (accents,
// Central/Eastern European letters). Satori only falls back across the
// families listed in fontFamily, so the extended subset gets its own family
// name (see SANS and MONO). measure() falls back the same way.
// Symbols Math and Symbols 2 fill in arrows, math and marks such as
// → ≈ ★ ✓ ✗ that the Latin subsets leave out.
export const SANS = 'Inter, Inter Ext, Symbols Math, Symbols 2'
export const MONO = 'Mono, Mono Ext, Symbols Math, Symbols 2'

const SYMBOL_FACES = [
  ['Symbols Math', 'noto-sans-math-latin-400-normal.woff'],
  ['Symbols 2', 'noto-sans-symbols-2-symbols-400-normal.woff'],
]

/** Emoji images take 1em plus 0.05em of space on each side. */
export const EMOJI_WIDTH = 1.1
const FACES = [
  ['Inter', 'inter', 400, 'normal'],
  ['Inter', 'inter', 400, 'italic'],
  ['Inter', 'inter', 600, 'normal'],
  ['Inter', 'inter', 700, 'normal'],
  ['Inter', 'inter', 700, 'italic'],
  ['Mono', 'jetbrains-mono', 400, 'normal'],
  ['Mono', 'jetbrains-mono', 400, 'italic'],
  ['Mono', 'jetbrains-mono', 700, 'normal'],
]

/** @param {{ has: (g: string) => boolean }} emoji */
export function loadFonts(assetsDir, emoji) {
  const satoriFonts = []
  const faces = []
  for (const [name, file, weight, style] of FACES) {
    for (const subset of ['latin', 'latin-ext']) {
      const buf = readFileSync(join(assetsDir, 'fonts', `${file}-${subset}-${weight}-${style}.woff`))
      satoriFonts.push({ name: subset === 'latin' ? name : `${name} Ext`, data: buf, weight, style })
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      faces.push({ name, weight, style, font: opentype.parse(ab) })
    }
  }

  const symbols = []
  for (const [name, file] of SYMBOL_FACES) {
    const buf = readFileSync(join(assetsDir, 'fonts', file))
    satoriFonts.push({ name, data: buf, weight: 400, style: 'normal' })
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    const face = { name, weight: 400, style: 'normal', font: opentype.parse(ab) }
    faces.push(face)
    symbols.push(face)
  }

  const pick = (name, weight, style) => {
    const same = faces.filter((f) => f.name === name && f.style === style)
    const closest = Math.min(...same.map((f) => Math.abs(f.weight - weight)))
    return same.filter((f) => Math.abs(f.weight - weight) === closest)
  }

  const inFonts = (ch) => faces.some((f) => f.font.charToGlyphIndex(ch) > 0)

  // Characters Unicode shows as emoji by default (⏳ ✅ 🚀) are always emoji.
  // Text-style symbols such as © or ↔ stay text when a font has them, unless
  // written with the emoji selector (FE0F) or as part of a sequence.
  const drawnAsEmoji = (g) =>
    emoji.has(g) && (/\p{Emoji_Presentation}/u.test(g) || [...g].length > 1 || !inFonts(g))

  /** Width in px of `text` set in the given face, with glyph fallback. */
  function measure(text, { mono = false, weight = 400, italic = false, size }) {
    const candidates = [...pick(mono ? 'Mono' : 'Inter', weight, italic ? 'italic' : 'normal'), ...symbols]
    let units = 0
    for (const g of graphemes(text)) {
      if (drawnAsEmoji(g)) {
        units += EMOJI_WIDTH
        continue
      }
      for (const ch of g) {
        const face = candidates.find((f) => f.font.charToGlyphIndex(ch) > 0) ?? candidates[0]
        units += (face.font.charToGlyph(ch).advanceWidth ?? 0) / face.font.unitsPerEm
      }
    }
    return units * size
  }

  /**
   * Characters that won't come out right: not in the fonts and not a known
   * emoji, or right-to-left scripts, which Satori lays out unjoined and in
   * reverse even where a font happens to have the letters.
   */
  function missingGlyphs(text) {
    const missing = new Set()
    for (const g of graphemes(text)) {
      if (/^\s+$/.test(g) || drawnAsEmoji(g)) continue
      if (/[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}]/u.test(g)) {
        missing.add(g)
        continue
      }
      for (const ch of g) {
        if (/[\s\u200d\ufe0f]/.test(ch)) continue
        if (!inFonts(ch)) missing.add(g)
      }
    }
    return [...missing]
  }

  return { satoriFonts, measure, missingGlyphs, drawnAsEmoji }
}
