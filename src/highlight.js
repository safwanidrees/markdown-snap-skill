import { common, createLowlight } from 'lowlight'

const lowlight = createLowlight(common)

/**
 * Split code into lines of colored segments. Unknown or missing languages
 * come back as plain text rather than guessed (auto-detect misfires on short
 * snippets).
 */
export function highlightLines(code, lang) {
  const name = lang?.trim().split(/\s+/)[0].toLowerCase()
  const segments = []
  if (name && lowlight.registered(name)) walk(lowlight.highlight(name, code), [], segments)
  else segments.push({ text: code, classes: [] })

  const lines = [[]]
  for (const seg of segments) {
    seg.text.split('\n').forEach((part, i) => {
      if (i > 0) lines.push([])
      if (part) lines[lines.length - 1].push({ text: part, classes: seg.classes })
    })
  }
  return lines
}

function walk(node, classes, out) {
  if (node.type === 'text') {
    out.push({ text: node.value, classes })
    return
  }
  const own = node.type === 'element' ? (node.properties?.className ?? []) : []
  const next = own.length ? [...classes, ...own.map((c) => String(c).replace(/^hljs-/, ''))] : classes
  for (const child of node.children ?? []) walk(child, next, out)
}

/** Map highlight.js classes (innermost last) to a theme token color. */
export function tokenStyle(classes, tk) {
  for (let i = classes.length - 1; i >= 0; i--) {
    const c = classes[i]
    if (c === 'comment' || c === 'quote') return { color: tk.comment, fontStyle: 'italic' }
    if (c === 'meta') return { color: tk.comment }
    if (c === 'keyword' || c === 'selector-tag' || c === 'doctag') return { color: tk.keyword }
    if (c === 'string' || c === 'regexp' || c === 'addition') return { color: tk.string }
    if (c === 'number' || c === 'literal' || c === 'symbol' || c === 'bullet') return { color: tk.number }
    if (c === 'built_in' || c === 'type' || c === 'class_') return { color: tk.type }
    if (c === 'title' || c === 'section' || c === 'name' || c === 'selector-id' || c === 'selector-class')
      return { color: classes.includes('class_') ? tk.type : tk.title }
    if (['attr', 'attribute', 'property', 'variable', 'template-variable', 'params'].includes(c)) return { color: tk.attr }
    if (c === 'deletion') return { color: tk.del }
  }
  return {}
}
