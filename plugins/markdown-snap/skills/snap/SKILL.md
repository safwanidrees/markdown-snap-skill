---
name: snap
description: Turn markdown into a polished, CodeSnap-style image (PNG or JPEG) with a gradient background, macOS window frame, syntax-highlighted code and tables. Use when the user asks to snap, screenshot, export or "make an image" of markdown, a README, notes, a table, a code block, or text from the chat.
license: MIT
compatibility: Needs Node.js 18 or newer. Everything else (layout engine, fonts, image encoder) is bundled; nothing is downloaded or installed.
allowed-tools:
  - Bash(node "${CLAUDE_SKILL_DIR}/scripts/snap.mjs" *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/snap.mjs *)
  - Read(~/Pictures/markdown-snaps/**)
  - Read(~/markdown-snaps/**)
---

# Markdown Snap

Render markdown into a shareable image with the bundled script. It works
offline and needs only Node.js.

**The script** is `scripts/snap.mjs` inside this skill's folder (the folder
that contains this SKILL.md). Claude Code writes that folder's path in for
`${CLAUDE_SKILL_DIR}` below. In other agents (Codex, Cursor, Copilot...),
where `${CLAUDE_SKILL_DIR}` or `${CLAUDE_SESSION_ID}` appears literally, use
this skill folder's absolute path instead and skip anything marked
*Claude Code only*.

Arguments passed to this skill, if any: $ARGUMENTS

## Steps

0. **First snap: ask for their look.** Run
   `node "${CLAUDE_SKILL_DIR}/scripts/snap.mjs" --config`. If it prints
   `Saved defaults: not set`, ask the user before making the image (skip a
   question whose answer is already in their request). Use your
   ask-the-user tool with both questions in one call (AskUserQuestion in
   Claude Code); if you have no such tool, ask both in one short chat message
   and wait for the reply:
   - "Which background do you want for your snaps?" (header "Background"):
     **Grape gradient (Recommended)** `grape`, **Ocean gradient** `ocean`,
     **Transparent** `none`, **Midnight** `midnight`. The automatic "Other"
     answer can be any preset name, a color like `#1e1e2e`, or two colors
     like `#ff7e5f,#feb47b`.
   - "Which window theme?" (header "Theme"): **Dark (Recommended)** `dark`,
     **Light** `light`, **Dracula** `dracula`, **Nord** `nord` ("Other" also
     accepts `paper`).

   Then make the snap with their answers plus `--save-defaults`, and tell
   them in one line that these are now their defaults and they can say
   "change my default background to …" anytime. If you can't ask questions
   (for example in a non-interactive run), use the built-in look and don't
   save anything. If saving fails because the agent's sandbox can't write to
   `~/.config`, snap with their choices anyway and say they'll be asked again.
   Once defaults exist, skip this step.

   **Changing defaults later:** "change my default background to ocean" →
   `node "${CLAUDE_SKILL_DIR}/scripts/snap.mjs" --bg ocean --save-defaults`
   (no input needed; options you don't pass stay as saved). "Forget my
   defaults" → `--reset-defaults`. A style named for one image only ("snap
   this with a mint background") is a one-off: pass it without
   `--save-defaults`.

1. **Get the markdown.**
   - **Your previous reply** ("snap your last message", "make an image of that
     answer"): *Claude Code only:* use `--last --session ${CLAUDE_SESSION_ID}`,
     which reads the exact text of your last finished reply from the session
     transcript. In other agents, or if `--last` fails, pipe your previous
     reply on stdin, copied verbatim: don't summarize or reformat it.
   - **A file path:** pass it directly.
   - **Text from the conversation or a selection:** pipe it on stdin with `-`.
     Keep the user's markdown exactly as written.
2. **Leave the output path alone unless asked.** Images are saved to one
   folder, `$MARKDOWN_SNAP_DIR` or else `~/Pictures/markdown-snaps`, named
   `<title>-<date>-<time>.png`, and never overwrite each other. Use
   `-o <file>` only when the user names a file or location, or `--out-dir`
   for a folder. Add `--open` when the user wants to see the image. If the
   agent's sandbox blocks writing there, rerun with `--out-dir ./snaps` (inside
   the workspace) and say where the image went.
3. **Run the script** as one command exactly in these forms: quote the script
   path, and don't prefix it with `cd` or chain it with `&&` (in Claude Code
   this matches the skill's pre-approved command, so there's no permission
   prompt).

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/snap.mjs" README.md -t dracula -b ocean
   ```

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/snap.mjs" --last --session ${CLAUDE_SESSION_ID} -t light
   ```

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/snap.mjs" - --title "Q3 results" <<'MD'
   | Region | Revenue |
   | ------ | ------: |
   | North  |  $1.2M  |
   MD
   ```
4. **Look at the result.** If you can view images (the Read tool in Claude
   Code), open the saved image and check it rendered as intended before
   reporting back.
5. **Report** the full saved path and size, plus any `Note:` or `Warning:`
   lines the script printed (for example characters the fonts can't draw).

If `node` is missing, tell the user to install Node.js 18+ from nodejs.org.
Don't try to install anything yourself.

## Options

| Option | Values | Default |
| --- | --- | --- |
| `-t, --theme` | `light` `dark` `dracula` `nord` `paper` | `dark` |
| `-b, --bg` | preset: `candy` `grape` `ocean` `mint` `sunset` `peach` `aurora` `midnight` `slate` `none` (transparent); or one color `"#1e1e2e"` (solid), several colors `"#ff7e5f,#feb47b"` (diagonal gradient), or a CSS `linear-gradient(...)` / `radial-gradient(...)` | `grape` |
| `-w, --width` | window width in px | `720` |
| `--padding` | space around the window in px | `64` |
| `--font-size` | base font size in px | `15` |
| `--radius` | corner radius in px | `12` |
| `--last` | *Claude Code only:* snap your previous reply (with `--session ${CLAUDE_SESSION_ID}`) | |
| `-o, --out` | exact output file | |
| `--out-dir` | folder to save in | `~/Pictures/markdown-snaps` |
| `--open` | open the image afterwards | |
| `--config` / `--save-defaults` / `--reset-defaults` | show / save this run's style as defaults / forget them | |
| `--title` | window title text | file name, `claude-reply.md` or `snap.md` |
| `--format` | `png` `jpeg` (also inferred from `-o file.jpg`) | `png` |
| `--scale` | pixel ratio 1-4 | `2` |
| `--quality` | JPEG quality 1-100 | `92` |
| `--no-chrome` | hide the window bar and dots | |
| `--no-shadow` | no drop shadow | |
| `--no-fit` | don't widen the window for wide tables | |

Map plain requests to options: "light mode" → `-t light`; "transparent" or
"remove the background" → `-b none` (PNG only, JPEG gets a white background);
"just the window, no border" → `-b none --padding 0`; a named color such as
"navy background" → its hex, `-b "#1b2a4a"`; "orange to pink" →
`-b "#ff7e5f,#ff5c8a"` (always quote color values); "for a slide" or "big" →
`--font-size 18 --scale 3`; "no window" → `--no-chrome`; "small file" →
`-o name.jpg --quality 85`.

## What renders

Headings, paragraphs with **bold**, *italic*, ~~strike~~, `code` and links,
bullet, numbered and task lists (nested), block quotes, rules, fenced code
with syntax highlighting (about 35 common languages), and GitHub tables with
column alignment. Tables never wrap; the window widens to fit the widest one
unless `--no-fit` is set.

Emoji (✅ 🚀 🇵🇰 👋🏽), arrows and symbols (→ ≈ ★ ✓) and Latin with accents
(é, ß, Ł) all render.

Limits: remote images appear as their `[alt text]` (no network access);
scripts such as Chinese, Hindi or Cyrillic show as boxes, and right-to-left
text (Arabic, Urdu, Hebrew) comes out unjoined and reversed. The script prints
a `Warning:` for both; pass it on to the user.
