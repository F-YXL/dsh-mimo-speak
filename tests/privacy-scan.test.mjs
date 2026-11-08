/**
 * The privacy gate has to be right in both directions: it must clear files
 * that are genuinely fine (otherwise it gets switched off), and it must fire
 * on every category of leak it claims to catch. These tests are the
 * known-good / known-bad sample batch; `npm test` runs them before CI ever
 * trusts the scanner.
 *
 * Note: no fixture below is written as a literal token. Every sample is
 * assembled at run time by `fake()`, so this file stays clean for the very
 * scanners it exercises — including GitHub's own push protection, which would
 * otherwise reject a commit containing a `ghp_…`-shaped string.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  RULES, isProbablyText, markerRules, rulesFor, scanHistory, scanRepo, scanText,
} from '../scripts/check-privacy.mjs'

/** Join fragments into a fixture value at run time. */
const fake = (...parts) => parts.join('')

/** A file that must produce zero findings: docs, config and code we do ship. */
const CLEAN = `# dsh-mimo-speak

Read replies aloud. Routes live under /api/mimo-speak/synthesize.
Copyright (c) 2026 F-YXL <170423531+F-YXL@users.noreply.github.com>
Mail the maintainers at someone@example.com — or open an issue.

\`\`\`yaml
- id: mimo-speak
  config:
    apiKey: !!js process.env.MIMO_API_KEY
\`\`\`

Open http://127.0.0.1:3080 and check \`.privacy-markers.example\`.
The key is a placeholder such as your-api-key-here.
`

test('clean file: zero findings', () => {
  assert.deepEqual(scanText(CLEAN, 'CLEAN.md'), [])
})

/** One dirty sample per rule id; each must fire that exact rule. */
const SAMPLES = [
  ['home-path', fake('See /Users/', 'xxx/Documents/project for the checkout.')],
  ['home-path', fake('Checkout lives at C:\\Users\\', 'xxx\\project.')],
  ['email', fake('Contact: per', 'son@', 'corp.example')],
  ['openai-key', fake('MIMO_API_KEY=sk-', 'proj-menhobguffkymdszdqzhcbyv')],
  ['github-token', fake('token gh', 'p_tmczpqqvihejnpgxpndrvbmdry6033551553')],
  ['aws-key', fake('aws_access_key_id = AK', 'IAKQIXODRN1TJFUZHS')],
  ['google-key', fake('key: AI', 'zaSyDummyValueForTestOnly0123456789ab')],
  ['slack-token', fake('xoxb-', '9495712081-fdpkjhobknhc')],
  ['private-key', fake('-----BEGIN RSA ', 'PRIVATE KEY-----')],
  ['bearer-token', fake('Authorization: Bearer ', 'abcdefghijklmnopqrstuvwxyz012345')],
  ['assigned-secret', fake('const apiKey = "', 'abc123def456ghixq1', '"')],
]

for (const [ruleId, sample] of SAMPLES) {
  test(`rule ${ruleId} fires on its own sample`, () => {
    const findings = scanText(sample, 'sample.txt')
    assert.ok(findings.length > 0, `expected a finding for ${ruleId}`)
    assert.ok(
      findings.some(finding => finding.rule === ruleId),
      `expected rule ${ruleId}, got ${findings.map(finding => finding.rule).join(', ')}`,
    )
  })
}

test('line numbers point at the offending line', () => {
  const token = fake('gh', 'p_tmczpqqvihejnpgxpndrvbmdry6033551553')
  const findings = scanText(`line one\nline two\nkey = "${token}"\n`, 'x.txt')
  assert.equal(findings[0].line, 3)
})

test('every rule id in SAMPLES exists in RULES', () => {
  const known = new Set(RULES.map(rule => rule.id))
  for (const [ruleId] of SAMPLES) assert.ok(known.has(ruleId), `unknown rule ${ruleId}`)
})

test('personal markers: keywords respect word boundaries, substrings do not', () => {
  const markers = { keywords: ['jdoe'], substrings: ['*my-laptop-7'] }
  const rules = markerRules(markers)

  // Hyphenated and underscored identifiers still count as the marker.
  assert.equal(scanText('tool name: mimo-tts-jdoe-say', 'a.md', rules).length, 1)
  assert.equal(scanText(fake('owner: jdoe', '@', 'corp.example'), 'a.md', rules).length, 1)
  // A longer word that merely contains the letters must not fire.
  assert.deepEqual(scanText('jdoeXYZ is a different token', 'a.md', rules), [])
  // Substrings match anywhere, including inside a longer identifier.
  assert.equal(scanText('host = my-laptop-7.local', 'a.md', rules).length, 1)
  assert.deepEqual(scanText('host = other-host.local', 'a.md', rules), [])
})

test('an empty marker list adds no rules', () => {
  assert.deepEqual(markerRules({ keywords: [], substrings: [] }), [])
})

test('binary detection keeps the scanner off artefacts', () => {
  assert.equal(isProbablyText(Buffer.from('plain utf8 text, 中文也算文本')), true)
  assert.equal(isProbablyText(Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x01, 0x02])), false)
})

test('a line carrying the suppression token is skipped, neighbours are not', () => {
  const secret = fake('sk-', 'proj-menhobguffkymdszdqzhcbyv')
  const text = `MIMO_API_KEY=${secret}  // privacy-scan:allow\nMIMO_API_KEY=${secret}\n`
  const findings = scanText(text, 'x.txt')
  assert.ok(findings.length >= 1, 'the un-suppressed line must be reported')
  assert.ok(findings.every(f => f.line === 2), 'the suppressed line must never be reported')
})

test('unquoted YAML/ENV assignments are caught, not just quoted ones', () => {
  const samples = [
    fake('apiKey: ', 'live', 'key-abc123456'),
    fake('apiKey: "', 'abc123def456ghi', '"'),
    fake('token: ', 'gh', 'x_0123456789abcdef'),
    fake("password = '", 'hunter2hunter2', "'"),
  ]
  for (const sample of samples) {
    assert.ok(
      scanText(sample, 'x.txt').some(f => f.rule === 'assigned-secret'),
      `expected assigned-secret to fire on ${sample}`,
    )
  }
  // Deliberate non-findings: below the length floor, an env-var reference,
  // a code expression, and an obvious test stub.
  assert.deepEqual(scanText(fake('apiKey: "', 'abc123', '"'), 'x.txt'), [])
  assert.deepEqual(scanText('apiKey: MIMO_API_KEY', 'x.txt'), [])
  assert.deepEqual(scanText('apiKey: this.form.field(API_KEY_CONTROL),', 'x.txt'), [])
  assert.deepEqual(scanText(fake("apiKey: '", 'stub-key', "',"), 'x.txt'), [])
})

test('rulesFor merges the local marker file into the rule set', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mimo-markers-'))
  try {
    writeFileSync(join(dir, '.privacy-markers'), '# local\nzzmarker\n*host-9f3\n')
    const rules = rulesFor(dir)
    assert.ok(rules.length > RULES.length, 'marker rules must be appended')
    assert.equal(scanText('owner: zzmarker', 'x.txt', rules).length, 1)
    assert.equal(scanText('host = host-9f3.local', 'x.txt', rules).length, 1)
    // Without the file there are no marker rules at all.
    assert.equal(rulesFor(join(dir, 'nope')).length, RULES.length)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('scanHistory finds a leak that scanRepo cannot see', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mimo-repo-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  try {
    git('init', '-q')
    writeFileSync(join(dir, 'leak.md'), fake('see /Users/', 'xxx/x\n'))
    git('add', '.')
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'add leak')
    git('rm', '-q', 'leak.md')
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'drop leak')

    assert.deepEqual(scanRepo(dir), [], 'the current tree is clean')
    const findings = scanHistory(dir)
    assert.ok(
      findings.some(f => f.rule === 'home-path'),
      'the deleted blob must still be reported by the history scan',
    )
    assert.ok(
      findings.every(f => f.rule !== 'commit-identity'),
      'an example.com committer identity is allowed',
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
