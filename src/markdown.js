import { lexer } from 'marked'
import { looksLikeEmoji, graphemes } from './emoji.js'
import { EMOJI_WIDTH, MONO } from './fonts.js'
import { highlightLines, tokenStyle } from './highlight.js'

// Satori lays out with flexbox only, so every block below is a flex box and
// running text is split into one span per word inside a wrapping row.

const h = (type, style, children) => ({ type, props: { style, children } })

// The mono font draws ligatures (`=>` as an arrow, `!=` as a slashed equals)
// and Satori can't switch them off. A ligature can't form across two text
// runs, so give each operator character its own span.
const OPERATOR = /([=!<>&|+\-*/:.~^%?#]+)/
const splitCode = (text) =>
  text
    .split(/(?<=\s)/)
    .flatMap((piece) => piece.split(OPERATOR).flatMap((part, i) => (i % 2 ? [...part] : [part])))
    .filter(Boolean)

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'" }
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (m) => ENTITIES[m])

/**
 * @typedef {{ theme: any, fs: number, measure: Function, maxTableWidth: number }} Ctx
 */

/** Parse markdown and return the content nodes. Updates ctx.maxTableWidth. */
export function renderMarkdown(markdown, ctx) {
  return blocks(lexer(markdown), ctx)
}

// ---------- Inline ----------

/** Flatten inline tokens into styled text runs. */
function runs(tokens = [], fmt = {}) {
  const out = []
  for (const t of tokens) {
    switch (t.type) {
      case 'text':
        if (t.tokens?.length) out.push(...runs(t.tokens, fmt))
        else out.push({ ...fmt, text: decode(t.text) })
        break
      case 'escape':
        out.push({ ...fmt, text: decode(t.text) })
        break
      case 'strong':
        out.push(...runs(t.tokens, { ...fmt, bold: true }))
        break
      case 'em':
        out.push(...runs(t.tokens, { ...fmt, italic: true }))
        break
      case 'del':
        out.push(...runs(t.tokens, { ...fmt, strike: true }))
        break
      case 'link':
        out.push(...runs(t.tokens, { ...fmt, link: true }))
        break
      case 'codespan':
        out.push({ ...fmt, code: true, text: decode(t.text) })
        break
      case 'br':
        out.push({ br: true })
        break
      case 'image':
        // Fetching remote images would need the network; show the alt text instead.
        out.push({ ...fmt, muted: true, text: `[${t.text || 'image'}]` })
        break
      default:
        if (t.tokens?.length) out.push(...runs(t.tokens, fmt))
        else if (t.text) out.push({ ...fmt, text: decode(t.text) })
    }
  }
  return out
}

function runStyle(run, ctx, size) {
  const { theme } = ctx
  const style = {}
  if (run.bold) style.fontWeight = 700
  if (run.italic) style.fontStyle = 'italic'
  if (run.strike) style.textDecoration = 'line-through'
  if (run.link) style.color = theme.link
  if (run.muted || run.strike) style.color = theme.muted
  if (run.code) {
    Object.assign(style, {
      fontFamily: MONO,
      fontSize: size * 0.85,
      padding: `0 ${Math.round(size * 0.4)}px`,
      borderRadius: 6,
      backgroundColor: theme.codeBg,
    })
  }
  return style
}

/** Spans for a run list. `wrap: false` keeps each run on one line (table cells). */
function inline(list, ctx, size, { wrap = true } = {}) {
  const nodes = []
  for (const run of list) {
    if (run.br) {
      nodes.push(h('div', { display: 'flex', width: '100%', height: 0 }, []))
      continue
    }
    const style = runStyle(run, ctx, size)
    const text = run.code ? run.text : run.text.replace(/\s*\n\s*/g, ' ')
    if (run.code) {
      // Long code (paths, commands) wraps at spaces and operators like "/"
      // instead of running past the window; table cells keep it on one line.
      const box = wrap ? { flexWrap: 'wrap', maxWidth: '100%' } : {}
      const codeSize = size * 0.85
      nodes.push(
        h('div', { display: 'flex', alignItems: 'baseline', ...box, ...style }, splitCode(text).flatMap((p) => textNodes(p, {}, codeSize, ctx))),
      )
      continue
    }
    if (!wrap) {
      nodes.push(...textNodes(text, style, size, ctx))
      continue
    }
    for (const piece of text.split(/(?<=\s)/)) {
      if (piece) nodes.push(...textNodes(piece, style, size, ctx))
    }
  }
  return nodes
}

function textWidth(list, ctx, size, weight = 400) {
  let w = 0
  for (const run of list) {
    if (run.br || !run.text) continue
    const runSize = run.code ? size * 0.85 : size
    w += ctx.measure(run.text, { mono: run.code, weight: run.bold ? 700 : weight, italic: run.italic, size: runSize })
    if (run.code) w += 2 * Math.round(size * 0.4)
  }
  return w
}

/**
 * Nodes for one piece of text. Emoji become images placed right here, so the
 * layout and the width measured for tables always agree.
 */
function textNodes(text, style, size, ctx) {
  if (!looksLikeEmoji(text)) return [h('span', { whiteSpace: 'pre', ...style }, text)]
  const out = []
  let buf = ''
  const flush = () => {
    if (buf) out.push(h('span', { whiteSpace: 'pre', ...style }, buf))
    buf = ''
  }
  for (const g of graphemes(text)) {
    const src = ctx.emojiImage(g)
    if (!src) {
      buf += g
      continue
    }
    flush()
    const s = Math.round(size)
    const gap = (size * (EMOJI_WIDTH - 1)) / 2
    out.push({
      type: 'img',
      props: { src, width: s, height: s, // Baseline alignment puts the image's bottom on the text baseline;
      // lift it so it sits like a glyph, with a little below the line.
      style: { margin: `0 ${gap}px`, position: 'relative', top: -Math.round(size * 0.14) } },
    })
  }
  flush()
  return out
}

const paragraph = (tokens, ctx, size, extra = {}) =>
  h('div', { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', ...extra }, inline(runs(tokens), ctx, size))

// ---------- Blocks ----------

const HEADING_SIZE = { 1: 2, 2: 1.5, 3: 1.25, 4: 1, 5: 0.875, 6: 0.85 }

function blocks(tokens, ctx) {
  const items = tokens.filter((t) => t.type !== 'space' && t.type !== 'def')
  return items.map((t, i) => {
    const node = block(t, ctx)
    const first = i === 0
    const last = i === items.length - 1
    const { fs } = ctx
    const spacing =
      t.type === 'heading'
        ? { marginTop: first ? 0 : Math.round(fs * 1.6), marginBottom: last ? 0 : Math.round(fs * 0.8) }
        : { marginBottom: last ? 0 : fs }
    node.props.style = { ...node.props.style, ...spacing }
    return node
  })
}

function block(t, ctx) {
  const { theme, fs } = ctx
  switch (t.type) {
    case 'heading': {
      const size = Math.round(fs * HEADING_SIZE[t.depth])
      const ruled = t.depth <= 2 ? { paddingBottom: Math.round(size * 0.3), borderBottom: `1px solid ${theme.border}` } : {}
      return paragraph(t.tokens, ctx, size, {
        fontSize: size,
        fontWeight: 600,
        lineHeight: 1.25,
        color: t.depth >= 5 ? theme.muted : theme.fg,
        ...ruled,
      })
    }
    case 'paragraph':
      return paragraph(t.tokens, ctx, fs)
    case 'code':
      return codeBlock(t.text, t.lang, ctx)
    case 'blockquote':
      return h(
        'div',
        {
          display: 'flex',
          flexDirection: 'column',
          paddingLeft: fs,
          borderLeft: `${Math.round(fs * 0.25)}px solid ${theme.border}`,
          color: theme.muted,
        },
        blocks(t.tokens, ctx),
      )
    case 'list':
      return list(t, ctx)
    case 'table':
      return table(t, ctx)
    case 'hr':
      return h('div', { display: 'flex', height: Math.round(fs * 0.25), backgroundColor: theme.border, margin: `${fs}px 0` }, [])
    case 'html':
      return h('div', { display: 'flex', flexWrap: 'wrap', color: theme.muted, fontFamily: MONO, fontSize: fs * 0.85 }, inline([{ text: t.text.trim(), code: false }], ctx, fs))
    default:
      return t.tokens ? paragraph(t.tokens, ctx, fs) : h('div', { display: 'flex' }, decode(t.text ?? ''))
  }
}

function codeBlock(code, lang, ctx) {
  const { theme, fs } = ctx
  const lines = highlightLines(code, lang).map((segs) => {
    const spans = []
    for (const seg of segs) {
      const style = tokenStyle(seg.classes, theme.tk)
      for (const piece of splitCode(seg.text)) spans.push(...textNodes(piece, style, fs * 0.85, ctx))
    }
    if (!spans.length) spans.push(h('span', { whiteSpace: 'pre' }, ' '))
    return h('div', { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline' }, spans)
  })
  return h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      padding: 16,
      borderRadius: 8,
      backgroundColor: theme.codeBg,
      fontFamily: MONO,
      fontSize: fs * 0.85,
      lineHeight: 1.5,
    },
    lines,
  )
}

function checkbox(checked, size, theme) {
  const s = Math.round(size)
  const svg = checked
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="3.5" fill="${theme.link}"/><path d="M4 8.2l2.6 2.6L12 5.4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect x="0.75" y="0.75" width="14.5" height="14.5" rx="3" fill="none" stroke="${theme.muted}" stroke-width="1.5"/></svg>`
  return { type: 'img', props: { src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, width: s, height: s } }
}

function list(t, ctx) {
  const { theme, fs } = ctx
  const lineBox = Math.round(fs * 1.65)
  const start = typeof t.start === 'number' ? t.start : 1
  const items = t.items.map((item, i) => {
    let marker
    if (item.task) marker = checkbox(item.checked, fs * 0.95, theme)
    else if (t.ordered) marker = h('span', {}, `${start + i}.`)
    else {
      const dot = Math.max(4, Math.round(fs * 0.36))
      marker = h('div', { display: 'flex', width: dot, height: dot, borderRadius: dot, backgroundColor: theme.fg }, [])
    }

    const children = item.tokens
      .filter((c) => c.type !== 'space' && c.type !== 'checkbox')
      .map((c, j) => {
        const node = c.type === 'text' ? paragraph(c.tokens ?? [{ type: 'text', text: c.text }], ctx, fs) : block(c, ctx)
        if (j > 0) node.props.style = { ...node.props.style, marginTop: Math.round(fs * 0.35) }
        return node
      })

    return h('div', { display: 'flex', marginTop: i > 0 ? Math.round(fs * 0.25) : 0 }, [
      h(
        'div',
        {
          display: 'flex',
          width: Math.round(fs * 1.6),
          height: lineBox,
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: item.task ? 'flex-start' : 'flex-end',
          paddingRight: item.task ? 0 : Math.round(fs * 0.55),
        },
        [marker],
      ),
      h('div', { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }, children),
    ])
  })
  return h('div', { display: 'flex', flexDirection: 'column', paddingLeft: Math.round(fs * 0.4) }, items)
}

const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' }

function table(t, ctx) {
  const { theme, fs } = ctx
  const padX = 13
  const padY = 6
  const header = t.header.map((cell) => runs(cell.tokens).map((r) => ({ ...r, bold: true })))
  const body = t.rows.map((row) => row.map((cell) => runs(cell.tokens)))
  const cols = header.length

  // Cells never wrap, so a column is as wide as its widest cell.
  const widths = Array.from({ length: cols }, (_, c) => {
    const cells = [header[c], ...body.map((row) => row[c] ?? [])]
    return Math.ceil(Math.max(...cells.map((cell) => textWidth(cell, ctx, fs)))) + padX * 2 + 2
  })
  const rowHeight = Math.round(fs * 1.5) + padY * 2 + 1

  const row = (cells, index, isHeader) =>
    h(
      'div',
      { display: 'flex', backgroundColor: !isHeader && index % 2 === 1 ? theme.codeBg : 'transparent' },
      cells.map((cell, c) =>
        h(
          'div',
          {
            display: 'flex',
            alignItems: 'center',
            justifyContent: JUSTIFY[t.align[c]] ?? 'flex-start',
            width: widths[c],
            height: rowHeight,
            padding: `0 ${padX}px`,
            borderRight: `1px solid ${theme.border}`,
            borderBottom: `1px solid ${theme.border}`,
            fontWeight: isHeader ? 600 : 400,
            lineHeight: 1.5,
            flexShrink: 0,
          },
          inline(cell ?? [], ctx, fs, { wrap: false }),
        ),
      ),
    )

  const total = widths.reduce((a, b) => a + b, 0) + 1
  ctx.maxTableWidth = Math.max(ctx.maxTableWidth, total)
  return h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      width: total,
      flexShrink: 0,
      borderTop: `1px solid ${theme.border}`,
      borderLeft: `1px solid ${theme.border}`,
    },
    [row(header, 0, true), ...body.map((cells, i) => row(cells, i, false))],
  )
}
