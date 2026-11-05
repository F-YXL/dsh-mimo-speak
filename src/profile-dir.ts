/**
 * Profile-aware data directory helpers.
 *
 * Every DSH profile boots inside one harness process, so the active profile
 * name is recoverable without touching cordis: the `DSH_PROFILE` env override,
 * the CLI argv (`dsh --profile web`, `dsh web`), or the plugin's own install
 * location (installed plugins live under `<home>/profiles/<name>/node_modules`,
 * while `link:` checkouts resolve back to the repo and detect nothing). A name
 * only counts when `<home>/profiles/<name>` really exists; otherwise the
 * caller keeps the legacy home-level directory.
 */
import fs from 'node:fs'
import os from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function sanitizeProfileName(name: unknown): string {
  const n = String(name ?? '').trim()
  if (!n || n.startsWith('.') || n.includes('..')) return ''
  if (/[\\/:*?"<>|]/.test(n)) return ''
  return n
}

function profileNameFromArgv(argv: readonly string[]): string {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] ?? '')
    if (arg === '--profile') return String(argv[i + 1] ?? '').trim()
    if (arg.startsWith('--profile=')) return arg.slice('--profile='.length).trim()
    if (i === 0 && arg && !arg.startsWith('-') && arg !== 'plugin') return arg.trim()
  }
  return ''
}

function profileNameFromModuleUrl(moduleUrl: string, profilesDir: string): string {
  try {
    let dir = dirname(fileURLToPath(moduleUrl))
    const expected = resolve(profilesDir).toLowerCase()
    for (;;) {
      const parent = dirname(dir)
      if (parent === dir) break
      if (resolve(parent).toLowerCase() === expected) {
        const name = sanitizeProfileName(basename(dir))
        return name && fs.existsSync(join(profilesDir, name)) ? name : ''
      }
      dir = parent
    }
  } catch {}
  return ''
}

/**
 * The active profile name, or `''` when the process was not booted under a
 * named profile (legacy global home).
 */
export function detectProfileName(options: { moduleUrl?: string } = {}): string {
  const base = String(process.env.DSH_HOME ?? '').trim() || join(os.homedir(), '.dsh')
  const profilesDir = join(base, 'profiles')
  const valid = (name: unknown): string => {
    const n = sanitizeProfileName(name)
    return n && fs.existsSync(join(profilesDir, n)) ? n : ''
  }
  const fromEnv = valid(process.env.DSH_PROFILE)
  if (fromEnv) return fromEnv
  const fromArgv = valid(profileNameFromArgv(process.argv.slice(2)))
  if (fromArgv) return fromArgv
  if (options.moduleUrl) return valid(profileNameFromModuleUrl(options.moduleUrl, profilesDir))
  return ''
}

/**
 * The profile-scoped default for one data directory:
 * `<home>/profiles/<profile>/<dir>`, or `undefined` when no profile is active
 * (the caller keeps its legacy default).
 */
export function profileScopedDefault(dir: string, options: { moduleUrl?: string } = {}): string | undefined {
  const profile = detectProfileName(options)
  if (!profile) return undefined
  const base = String(process.env.DSH_HOME ?? '').trim() || join(os.homedir(), '.dsh')
  return join(base, 'profiles', profile, dir)
}
