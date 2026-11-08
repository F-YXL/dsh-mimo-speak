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
import { RULES, isProbablyText, markerRules, scanText } from '../scripts/check-privacy.mjs'

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
  ['assigned-secret', fake('const apiKey = "', 'abcdefghijklmnopqrst', '"')],
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
  assert.equal(findings.length, 1)
  assert.equal(findings[0].line, 2)
})
