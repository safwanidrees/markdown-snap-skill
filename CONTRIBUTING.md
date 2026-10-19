# Contributing

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Reporting a bug

[Open an issue](https://github.com/safwanidrees/markdown-snap-skill/issues/new/choose)
with the markdown you snapped, the command or request you used, what you
expected and what you got. A screenshot of the result helps a lot.

## Setting up

You need Node.js 18 or newer.

```bash
git clone https://github.com/safwanidrees/markdown-snap-skill
cd markdown-snap-skill
npm install
npm run check    # build, then run the tests
```

## How the repo is laid out

| Path | What it is |
| --- | --- |
| `src/` | The source: `cli.js` (arguments, files, defaults), `render.js` (window and image), `markdown.js` (markdown to layout), `emoji.js`, `highlight.js`, `fonts.js`, `themes.js`, `prefs.js`, `transcript.js` |
| `build.mjs` | Bundles `src/` with esbuild and copies the WASM and font files into the skill |
| `plugins/markdown-snap/skills/snap/` | **The skill users install.** Built output plus the hand-written `SKILL.md` |
| `.claude-plugin/marketplace.json`, `plugins/markdown-snap/.claude-plugin/plugin.json` | Claude Code plugin manifests |
| `test/smoke.mjs` | End-to-end tests against the built bundle |
| `vendor/emoji.json.gz` | All Twemoji SVGs packed into one file, made by `scripts/pack-emoji.mjs` (see the comment at its top to update emoji) |
| `examples/`, `docs/images/` | Sample inputs and the README images |

## Making a change

1. Edit files in `src/` (or `SKILL.md` for how agents use the skill).
2. Run `npm run check`. It rebuilds the skill and runs the tests.
3. **Commit the rebuilt `plugins/` folder together with your source change.**
   Users run the bundle straight from the repo, and CI fails if the committed
   bundle doesn't match a fresh build.
4. If your change affects how images look, open a few of the files in
   `test-output/` to check them, and attach a before/after image to the PR.

Things to keep in mind:

- **No new runtime downloads.** The skill must work offline with only Node.js.
  New dependencies are fine if they bundle cleanly.
- **Satori only does flexbox.** Every `div` with more than one child needs
  `display: flex`, and running text is laid out one word per span.
- **Keep `SKILL.md` portable.** Anything that only works in Claude Code (such
  as `${CLAUDE_SESSION_ID}` or `--last`) should be marked "Claude Code only",
  with a fallback for other agents.

If you're using Claude Code, test your changes as a plugin without installing
anything:

```bash
claude --plugin-dir ./plugins/markdown-snap
```

## Releasing (maintainers)

1. Bump `version` in `plugins/markdown-snap/.claude-plugin/plugin.json` and
   `package.json`. Claude Code users only receive an update when this changes.
2. Add the release to `CHANGELOG.md`.
3. Run `npm run check` and `claude plugin validate .`, then commit, tag
   `vX.Y.Z` and push the tag.
