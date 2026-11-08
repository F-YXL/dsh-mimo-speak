/**
 * Microsoft Edge TTS (readaloud) fallback engine.
 *
 * Edge's browser TTS is keyless, but its auth handshake changes often (the
 * token endpoint retired in 2026 and the WebSocket moved to a Sec-MS-GEC v2
 * handshake). Rather than chase that protocol here, this module shells out to
 * the maintained `edge-tts` CLI when it is installed, and reports a clear
 * error otherwise. The CLI tracks Microsoft's changes upstream.
 * @module dsh-mimo-speak/edge-tts
 */

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { DEFAULT_EDGE_VOICE } from './settings.ts'
import { TtsError } from './tts.ts'

const execFileAsync = promisify(execFile)

/**
 * Well-known locations of the `edge-tts` executable, in lookup order. The
 * pipx install (`~/.local/bin`) is listed explicitly: the desktop Host is
 * launched by launchd and usually does not inherit the shell's PATH, so a
 * `which` probe alone would miss an installed CLI.
 */
const CANDIDATE_BINARIES = [
  'edge-tts',
  join(homedir(), '.local', 'bin', 'edge-tts'),
  join(homedir(), '.local', 'pipx', 'venvs', 'edge-tts', 'bin', 'edge-tts'),
  '/opt/homebrew/bin/edge-tts',
  '/usr/local/bin/edge-tts',
  '/usr/bin/edge-tts',
]

/** Resolved CLI path, cached: probing spawns a process, so do it once. */
let located: string | null = null

/** Resolve an Edge voice, defaulting to {@link DEFAULT_EDGE_VOICE}. */
export function resolveEdgeVoice(voice: string | undefined): string {
  return (voice ?? '').trim() || DEFAULT_EDGE_VOICE
}

/** Find the first `edge-tts` binary the shell would actually run. */
async function locateEdgeTts(): Promise<string> {
  if (located !== null) return located
  for (const candidate of CANDIDATE_BINARIES) {
    if (candidate.includes('/')) {
      try {
        await execFileAsync(candidate, ['--version'])
        located = candidate
        return candidate
      } catch {
        continue
      }
    }
    // A bare name: ask the shell where it lives.
    try {
      const { stdout } = await execFileAsync('which', [candidate])
      const resolved = stdout.trim()
      if (resolved !== '') {
        located = resolved
        return resolved
      }
    } catch {
      continue
    }
  }
  throw new TtsError('upstream-error', 'Edge fallback needs the `edge-tts` CLI. Install it with: pipx install edge-tts (or brew install edge-tts).')
}

/**
 * Synthesize one text with Edge TTS.
 * @param text - plain text to speak.
 * @param voice - Edge voice name (e.g. `zh-CN-XiaoxiaoNeural`).
 * @param timeoutMs - upper bound on the whole round-trip.
 * @returns complete MP3 bytes.
 * @throws {TtsError} when the CLI is missing or the synthesis fails.
 */
export async function synthesizeEdge(
  text: string,
  voice: string | undefined,
  timeoutMs: number,
): Promise<Uint8Array> {
  if (text.trim() === '') {
    throw new TtsError('bad-request', 'Edge TTS received no speakable text.')
  }
  const binary = await locateEdgeTts()
  const dir = await mkdtemp(join(tmpdir(), 'dsh-mimo-edge-'))
  const textPath = join(dir, 'input.txt')
  const mediaPath = join(dir, 'out.mp3')
  try {
    await writeFile(textPath, text, 'utf8')
    await execFileAsync(binary, [
      '--voice', resolveEdgeVoice(voice),
      '--file', textPath,
      '--write-media', mediaPath,
    ], { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 })
    const mp3 = await readFile(mediaPath)
    if (mp3.length === 0) {
      throw new TtsError('invalid-audio', 'Edge TTS produced no audio.')
    }
    return new Uint8Array(mp3)
  } catch (cause) {
    if (cause instanceof TtsError) throw cause
    const message = cause instanceof Error ? cause.message : String(cause)
    if (message.includes('ETIMEDOUT') || message.includes('timed out')) {
      throw new TtsError('timeout', `Edge TTS did not finish within ${timeoutMs} ms.`, cause)
    }
    throw new TtsError('upstream-error', `Edge TTS failed: ${message.slice(0, 300)}`, cause)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
