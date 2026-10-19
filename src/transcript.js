import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Claude Code keeps each session as JSON lines in
// ~/.claude/projects/<project folder>/<session id>.jsonl. The format is
// internal, so everything here is defensive and fails with a clear message.

const projectsDir = () => join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects')

/** Find the transcript file for a session id, or the newest one for `cwd`. */
export function findTranscript(sessionId, cwd = process.cwd()) {
  const root = projectsDir()
  if (!existsSync(root)) throw new Error(`No Claude Code transcripts found in ${root}.`)
  const projects = readdirSync(root).map((name) => join(root, name))

  if (sessionId) {
    for (const dir of projects) {
      const file = join(dir, `${sessionId}.jsonl`)
      if (existsSync(file)) return file
    }
    throw new Error(`No transcript found for session ${sessionId}.`)
  }

  // Claude Code names the folder after the working directory with every
  // non-alphanumeric character replaced by "-".
  const dir = join(root, cwd.replace(/[^a-zA-Z0-9]/g, '-'))
  if (!existsSync(dir)) throw new Error(`No transcripts for ${cwd}. Pass --session <id>.`)
  const newest = readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ file: join(dir, f), time: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time)[0]
  if (!newest) throw new Error(`No transcripts for ${cwd}.`)
  return newest.file
}

const isToolResult = (content) => Array.isArray(content) && content.some((c) => c?.type === 'tool_result')

/** A prompt the person actually typed (not a tool result or injected skill text). */
const isHumanPrompt = (entry) =>
  entry.type === 'user' && !entry.isMeta && !entry.isSidechain && !isToolResult(entry.message?.content)

/**
 * The last reply Claude finished before the current prompt: the text after
 * Claude's final tool call in the previous turn, which is what the person
 * read as "the message".
 */
export function lastAssistantMessage(file) {
  const entries = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      entries.push(JSON.parse(line))
    } catch {
      // A partially written last line is fine to skip.
    }
  }

  // Skip back past the prompt that asked for this snap.
  let i = entries.length - 1
  while (i >= 0 && !isHumanPrompt(entries[i])) i--
  i--

  const texts = []
  for (; i >= 0; i--) {
    const e = entries[i]
    if (e.isSidechain) continue
    if (e.type === 'user') {
      if (texts.length || isHumanPrompt(e)) break
      continue
    }
    if (e.type !== 'assistant') continue
    const content = e.message?.content
    if (!Array.isArray(content)) continue
    if (content.some((c) => c?.type === 'tool_use')) {
      if (texts.length) break
      continue
    }
    for (let j = content.length - 1; j >= 0; j--) {
      if (content[j]?.type === 'text' && content[j].text?.trim()) texts.unshift(content[j].text.trim())
    }
  }

  if (!texts.length) throw new Error('Could not find a previous Claude reply in this session.')
  return texts.join('\n\n')
}
