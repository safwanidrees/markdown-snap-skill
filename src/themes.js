// Same palettes as the Markdown Snap web app, so a snap from the skill and a
// snap from the app look alike.

export const BACKGROUNDS = {
  candy: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  grape: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  ocean: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  mint: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  sunset: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  peach: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
  aurora:
    'radial-gradient(circle at 15% 20%, #7f5af0 0%, rgba(127, 90, 240, 0) 55%), ' +
    'radial-gradient(circle at 85% 10%, #2cb67d 0%, rgba(44, 182, 125, 0) 50%), ' +
    'radial-gradient(circle at 80% 95%, #ff8906 0%, rgba(255, 137, 6, 0) 55%), ' +
    'linear-gradient(#16161a, #16161a)',
  midnight: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  slate: 'linear-gradient(#cbd5e1, #cbd5e1)',
  none: null,
}

const light = {
  bg: '#ffffff', fg: '#1f2328', muted: '#59636e', border: '#d1d9e0', codeBg: '#f6f8fa', link: '#0969da', bar: '#f3f4f6',
  tk: { comment: '#6e7781', keyword: '#cf222e', string: '#0a3069', number: '#0550ae', title: '#8250df', attr: '#0550ae', type: '#953800', del: '#82071e' },
}

const dark = {
  bg: '#0d1117', fg: '#e6edf3', muted: '#9198a1', border: '#30363d', codeBg: '#161b22', link: '#58a6ff', bar: '#161b22',
  tk: { comment: '#8b949e', keyword: '#ff7b72', string: '#a5d6ff', number: '#79c0ff', title: '#d2a8ff', attr: '#79c0ff', type: '#ffa657', del: '#ffa198' },
}

const dracula = {
  bg: '#282a36', fg: '#f8f8f2', muted: '#a4a9c7', border: '#44475a', codeBg: '#21222c', link: '#8be9fd', bar: '#21222c',
  tk: { comment: '#6272a4', keyword: '#ff79c6', string: '#f1fa8c', number: '#bd93f9', title: '#50fa7b', attr: '#8be9fd', type: '#ffb86c', del: '#ff5555' },
}

const nord = {
  bg: '#2e3440', fg: '#d8dee9', muted: '#a3acbd', border: '#434c5e', codeBg: '#3b4252', link: '#88c0d0', bar: '#3b4252',
  tk: { comment: '#7b88a1', keyword: '#81a1c1', string: '#a3be8c', number: '#b48ead', title: '#88c0d0', attr: '#8fbcbb', type: '#ebcb8b', del: '#bf616a' },
}

const paper = {
  bg: '#fbf7ef', fg: '#3b3226', muted: '#7a6c58', border: '#e6dccb', codeBg: '#f3ecdf', link: '#b4532a', bar: '#f3ecdf',
  tk: { comment: '#9a8b74', keyword: '#a3361f', string: '#4f7a28', number: '#8a4fbf', title: '#1f6f8b', attr: '#9a6a12', type: '#b4532a', del: '#a3361f' },
}

export const THEMES = { light, dark, dracula, nord, paper }

const COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\([^()]*\)|transparent)$/i

/**
 * Resolve --bg: a preset name, "none"/"transparent", one CSS color (solid),
 * two or more comma-separated colors (a 135deg gradient), or a full
 * linear-/radial-gradient(). Returns a CSS background-image, or null for none.
 */
export function resolveBackground(value) {
  const v = String(value).trim()
  if (v.toLowerCase() in BACKGROUNDS) return BACKGROUNDS[v.toLowerCase()]
  if (/^(none|transparent)$/i.test(v)) return null
  if (/^(repeating-)?(linear|radial)-gradient\(.*\)$/is.test(v)) return v
  // Split on commas that aren't inside rgb(...)/hsl(...).
  const colors = v.split(/,(?![^(]*\))/).map((c) => c.trim()).filter(Boolean)
  if (colors.length && colors.every((c) => COLOR.test(c))) {
    if (colors.length === 1) return `linear-gradient(${colors[0]}, ${colors[0]})`
    const stops = colors.map((c, i) => `${c} ${Math.round((i / (colors.length - 1)) * 100)}%`)
    return `linear-gradient(135deg, ${stops.join(', ')})`
  }
  throw new Error(
    `Unknown background "${v}". Use a preset (${Object.keys(BACKGROUNDS).join(', ')}), ` +
      'a color like "#1e1e2e", two colors like "#ff7e5f,#feb47b", or a CSS gradient.',
  )
}
