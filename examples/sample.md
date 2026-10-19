# Markdown Snap

Write on the left, see it rendered on the right. Hit **Snap** to turn
your markdown into a shareable image, the way CodeSnap does for code.

## Features

- Live preview with **GitHub Flavored Markdown**
- Syntax highlighting for code blocks
- Export as `PNG` or `JPEG` at 1x, 2x or 3x
- [x] Tables, task lists, strikethrough
- [ ] ~~Boring screenshots~~

> Tip: select part of your text before pressing **Snap** to export
> only that selection.

## Code

```ts
type Snap = { format: 'png' | 'jpeg'; scale: 1 | 2 | 3 }

export function greet(name: string): string {
  // Template literals work too
  return `Hello, ${name}!`
}
```

## Table

| Shortcut       | Action        |
| -------------- | ------------- |
| `Ctrl/Cmd + B`   | Bold          |
| `Ctrl/Cmd + I`   | Italic        |
| `Ctrl/Cmd + K`   | Insert link   |
| `Tab`          | Indent        |
