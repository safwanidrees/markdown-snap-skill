import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

// Saved style defaults, so the person picks a look once instead of on every
// snap. Kept outside the plugin folder so they survive plugin updates, and
// shared by the skill and the plain CLI.

/** Style options that can be saved, in the order they're printed. */
export const PREF_KEYS = ['background', 'theme', 'width', 'padding', 'fontSize', 'radius', 'scale', 'chrome', 'shadow']

export function configPath() {
  if (process.env.MARKDOWN_SNAP_CONFIG) return process.env.MARKDOWN_SNAP_CONFIG
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(base, 'markdown-snap', 'config.json')
}

/** Saved defaults, or null when nothing has been saved yet. */
export function loadPrefs() {
  const file = configPath()
  if (!existsSync(file)) return null
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    return Object.fromEntries(PREF_KEYS.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]))
  } catch {
    throw new Error(`Can't read ${file}. Fix it or run with --reset-defaults.`)
  }
}

export function savePrefs(prefs) {
  const file = configPath()
  mkdirSync(dirname(file), { recursive: true })
  const clean = Object.fromEntries(PREF_KEYS.filter((k) => prefs[k] !== undefined).map((k) => [k, prefs[k]]))
  writeFileSync(file, JSON.stringify(clean, null, 2) + '\n')
  return clean
}

export function resetPrefs() {
  rmSync(configPath(), { force: true })
}

export const describePrefs = (prefs) =>
  PREF_KEYS.filter((k) => prefs[k] !== undefined)
    .map((k) => `${k}=${prefs[k]}`)
    .join(', ')
