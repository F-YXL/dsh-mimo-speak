/**
 * Pre-push privacy gate.
 *
 * Scans every **git-tracked** file — that is, exactly the set that would be
 * published — for credentials, absolute home paths, e-mail addresses and any
 * personal marker you listed locally. Nothing here knows who you are: the
 * personal marker list lives in `.privacy-markers`, which is git-ignored, so
 * the guard itself never leaks the strings it guards against.
 *
 * Usage:
 *   node scripts/check-privacy.mjs              # files only (safe for CI)
 *   node scripts/check-privacy.mjs --history    # also audit commit identities
 *   node scripts/check-privacy.mjs --verbose    # print every hit, not just the first 20
 *
 * Exit code: 0 clean, 1 findings, 2 the scan itself failed.
 *
 * A line containing the literal token `privacy-scan:allow` is skipped. Use it
 * only for deliberate fixtures (sample keys in a test), never for a real value.
 *
 * `.privacy-markers` format, one entry per line, `#` starts a comment:
 *   keyword     matched with word boundaries, case-insensitive   (e.g. a handle)
 *   *substring  matched anywhere, case-insensitive               (e.g. a hostname)
 * @module dsh-mimo-speak/scripts/check-privacy
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repository root, derived from this file's location. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Generic rules that hold for any open-source repository. Each one is a global
 * regular expression and a stable id the output and the tests key on.
 */
export const RULES = [
  {
    id: 'home-path',
    // /Users/<name>, /home/<name>, C:\Users\<name> — a real machine's layout.
    pattern: /(?:\/Users\/|\/home\/|[A-Za-z]:\\+Users\\+)([A-Za-z0-9._-]+)/g,
    message: 'absolute home directory path',
    /** Paths that are conventionally not personal. */
    allow: match => /^(shared|runner|user|username|your-name|example|<)/.test(match),
  },
  {
    id: 'email',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    message: 'e-mail address',
    allow: match => /@(?:users\.noreply\.github\.com|noreply\.github\.com|example\.(?:com|org|net)|example|test\.invalid)$/i.test(match),
  },
  {
    id: 'openai-key',
    pattern: /\bsk-[A-Za-z0-9_-]{16,}/g,
    message: 'OpenAI-style API key',
  },
  {
    id: 'github-token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g,
    message: 'GitHub token',
  },
  {
    id: 'aws-key',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    message: 'AWS access key id',
  },
  {
    id: 'google-key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    message: 'Google API key',
  },
  {
    id: 'slack-token',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
    message: 'Slack token',
  },
  {
    id: 'private-key',
    pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g,
    message: 'private key block',
  },
  {
    id: 'bearer-token',
    pattern: /\bBearer\s+[A-Za-z0-9._-]{24,}/g,
    message: 'hard-coded bearer token',
  },
  {
    id: 'assigned-secret',
    // `apiKey: "…"`, `token = '…'`, `password: "…"` with a literal value.
    pattern: /(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*(['"`])([^'"`\n]{12,})\1/gi,
    message: 'hard-coded credential assignment',
    allow: match => /(?:process\.env|REDACTED|placeholder|your[-_]|<)/i.test(match),
  },
]

/**
 * Read the optional local marker list.
 * @param root - repository root.
 * @returns plain keywords (word-boundary matched) and raw substrings.
 */
export function readMarkers(root = ROOT) {
  const path = join(root, '.privacy-markers')
  if (!existsSync(path)) return { keywords: [], substrings: [] }
  const keywords = []
  const substrings = []
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    if (line.startsWith('*')) substrings.push(line.slice(1).trim())
    else keywords.push(line)
  }
  return { keywords: keywords.filter(Boolean), substrings: substrings.filter(Boolean) }
}

/** Escape a string for use inside a regular expression. */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build the marker rules from a marker list.
 * @param markers - as returned by {@link readMarkers}.
 * @returns rules in the same shape as {@link RULES}.
 */
export function markerRules(markers) {
  const rules = []
  for (const keyword of markers.keywords) {
    rules.push({
      id: 'personal-marker',
      pattern: new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(keyword)}(?![A-Za-z0-9])`, 'gi'),
      message: `personal marker "${keyword[0]}…"`,
    })
  }
  for (const raw of markers.substrings) {
    // Tolerate a leading '*' (the marker file's substring marker).
    const needle = raw.startsWith('*') ? raw.slice(1) : raw
    if (needle === '') continue
    rules.push({
      id: 'personal-substring',
      pattern: new RegExp(escapeRegExp(needle), 'gi'),
      message: 'personal identifier',
    })
  }
  return rules
}

/**
 * Scan one text blob.
 * @param text - file contents.
 * @param file - repository-relative path, echoed in findings.
 * @param rules - rule set to apply.
 * @returns findings, each with `file`, `line`, `rule`, `message` and a masked `match`.
 */
export function scanText(text, file, rules = RULES) {
  const findings = []
  const lines = text.split('\n')
  const SUPPRESSION = 'privacy-scan:allow'
  for (const rule of rules) {
    rule.pattern.lastIndex = 0
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (line.includes(SUPPRESSION)) continue
      rule.pattern.lastIndex = 0
      let match
      while ((match = rule.pattern.exec(line)) !== null) {
        const value = match[0]
        if (rule.allow?.(value, match)) continue
        findings.push({
          file,
          line: index + 1,
          rule: rule.id,
          message: rule.message,
          match: value.length > 12 ? `${value.slice(0, 4)}…(${value.length} chars)` : value,
        })
        if (match[0] === '') rule.pattern.lastIndex += 1
      }
    }
  }
  return findings
}

/** `true` when a buffer looks like text rather than a binary artefact. */
export function isProbablyText(buffer) {
  const probe = buffer.subarray(0, 8000)
  if (probe.includes(0)) return false
  return !probe.toString('utf8').includes('\uFFFD')
}

/**
 * List tracked files.
 * @param root - repository root.
 * @returns repository-relative paths.
 */
export function trackedFiles(root = ROOT) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
}

/**
 * Scan the whole repository.
 * @param root - repository root.
 * @returns findings across every tracked text file.
 */
export function scanRepo(root = ROOT) {
  const rules = [...RULES, ...markerRules(readMarkers(root))]
  const findings = []
  for (const file of trackedFiles(root)) {
    let buffer
    try {
      buffer = readFileSync(join(root, file))
    } catch {
      continue
    }
    if (!isProbablyText(buffer)) continue
    findings.push(...scanText(buffer.toString('utf8'), file, rules))
  }
  return findings
}

/**
 * Audit commit identities: every author and committer must look like a public
 * handle rather than a personal name + mailbox.
 * @param root - repository root.
 * @returns offending `name <email>` pairs, deduplicated.
 */
export function scanHistory(root = ROOT) {
  const log = execFileSync('git', ['log', '--all', '--format=%an <%ae>%n%cn <%ce>'], {
    cwd: root,
    maxBuffer: 16 * 1024 * 1024,
  }).toString('utf8')
  const identities = [...new Set(log.split('\n').map(line => line.trim()).filter(Boolean))]
  const findings = []
  for (const identity of identities) {
    const email = identity.match(/<([^>]+)>/)?.[1] ?? ''
    const rule = RULES.find(entry => entry.id === 'email')
    const allowed = rule?.allow ? rule.allow(email) : false
    if (!allowed) findings.push({ file: '(git history)', line: 0, rule: 'commit-identity', message: 'commit identity leaks a personal mailbox', match: identity })
  }
  return findings
}

/** Print findings in a `file:line  rule  message` shape and return the exit code. */
function report(findings, verbose) {
  if (findings.length === 0) {
    console.log('check-privacy: clean — no credentials, home paths, e-mails or personal markers in tracked files.')
    return 0
  }
  const shown = verbose ? findings : findings.slice(0, 20)
  for (const finding of shown) {
    console.error(`  ${finding.file}:${finding.line}  [${finding.rule}] ${finding.message}  ${finding.match}`)
  }
  const hidden = findings.length - shown.length
  console.error(`\ncheck-privacy: ${findings.length} finding(s)${hidden > 0 ? `, ${hidden} not shown (use --verbose)` : ''}.`)
  return 1
}

/* istanbul ignore next -- CLI wiring, exercised by tests through the exports above */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Set(process.argv.slice(2))
  try {
    const findings = scanRepo(ROOT)
    if (args.has('--history')) findings.push(...scanHistory(ROOT))
    process.exitCode = report(findings, args.has('--verbose'))
  } catch (error) {
    console.error(`check-privacy: scan failed — ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 2
  }
}
