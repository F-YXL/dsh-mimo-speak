/**
 * Browser → Host calls for speech synthesis.
 *
 * Both halves share their route vocabulary through `src/settings.ts`; the
 * browser sends text and receives WAV bytes, so the MiMo API key never enters
 * the page. Failures arrive as stable codes the UI maps to localized copy.
 * @module dsh-mimo-speak/client/api
 */

import {
  MIMOSPEAK_RECORDING_HEADER, MIMOSPEAK_RECORDINGS_PATH, MIMOSPEAK_STATUS_PATH, MIMOSPEAK_SUMMARY_PATH, MIMOSPEAK_SYNTHESIZE_PATH, MIMOSPEAK_SYNTHESIZE_STREAM_PATH, MIMOSPEAK_TEST_PATH,
} from '../settings.ts'
import type {
  TtsErrorCode, TtsRecordingsIndex, TtsStatusView, TtsSynthesizeRequest, TtsTestResult,
} from '../settings.ts'

/** A synthesize failure carrying the Host's stable code. */
export class TtsClientError extends Error {
  /**
   * @param code - stable failure code; `generic` when the Host gave none.
   * @param message - Host-supplied detail, safe to show.
   */
  constructor(readonly code: TtsErrorCode | 'generic', message: string) {
    super(message)
    this.name = 'TtsClientError'
  }
}

/**
 * Read the Host's resolved engine configuration (never secrets).
 * @returns the effective model, voice, endpoint, and key/sample presence.
 */
/** Which engine the Host's audio actually came from. */
export type SpeechEngine = 'mimo' | 'edge'

/**
 * Read the answering engine off an audio response.
 *
 * The Host answers MiMo synthesis as `audio/wav` and the Edge fallback as
 * `audio/mpeg`, so the content type is the honest signal: the client can say
 * "the fallback voice is reading this" instead of switching voices silently.
 * @param blob - the audio response body.
 * @returns the engine that produced it.
 */
export function speechEngineOf(blob: Blob): SpeechEngine {
  return blob.type.includes('mpeg') ? 'edge' : 'mimo'
}

/**
 * Ask the Host for a short spoken summary of one reply.
 *
 * Used by the brief read scope: summarizing first and speaking the summary is
 * what "简要播报" should mean, instead of mechanically picking sentences.
 * @param text - the reply text to condense.
 * @param signal - aborts the request when the reader stops.
 * @returns the summary text.
 */
export async function requestSummary(text: string, signal?: AbortSignal): Promise<string> {
  let response: Response
  try {
    response = await fetch(MIMOSPEAK_SUMMARY_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      ...(signal === undefined ? {} : { signal }),
    })
  } catch (cause) {
    throw new TtsClientError('generic', cause instanceof Error ? cause.message : String(cause))
  }
  if (!response.ok) {
    // The Host explains refusals in the shared error envelope.
    let code: TtsErrorCode | 'generic' = 'generic'
    let message = `summary request failed with HTTP ${response.status}`
    try {
      const body = await response.json() as { error?: { code?: unknown; message?: unknown } }
      if (typeof body.error?.code === 'string') code = body.error.code as TtsErrorCode
      if (typeof body.error?.message === 'string') message = body.error.message
    } catch {
      // Non-JSON failure body: keep the generic HTTP message.
    }
    throw new TtsClientError(code, message)
  }
  const body = await response.json() as { summary?: unknown }
  if (typeof body.summary !== 'string' || body.summary.trim() === '') {
    throw new TtsClientError('generic', 'The summary route returned no text.')
  }
  return body.summary.trim()
}

export async function fetchTtsStatus(): Promise<TtsStatusView> {
  const response = await fetch(MIMOSPEAK_STATUS_PATH, { method: 'GET', cache: 'no-store' })
  if (!response.ok) {
    throw new TtsClientError('generic', `status request failed with HTTP ${response.status}`)
  }
  return await response.json() as TtsStatusView
}

/**
 * Synthesize one text into playable WAV audio.
 * @param request - text and optional style/voice overrides (settings-page
 * audition previews unsaved values through these).
 * @param signal - aborts the request when the reader stops.
 * @returns the WAV payload as a Blob ready for `URL.createObjectURL`.
 * @throws {TtsClientError} when the Host refuses or the transport fails.
 */
export async function requestSpeech(request: TtsSynthesizeRequest, signal?: AbortSignal): Promise<Blob> {
  let response: Response
  try {
    response = await fetch(MIMOSPEAK_SYNTHESIZE_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      ...(signal === undefined ? {} : { signal }),
    })
  } catch (error) {
    throw new TtsClientError('generic', error instanceof Error ? error.message : String(error))
  }
  if (response.ok) return await response.blob()
  let code: TtsErrorCode | 'generic' = 'generic'
  let message = `synthesize request failed with HTTP ${response.status}`
  try {
    const body = await response.json() as { error?: { code?: unknown; message?: unknown } }
    if (typeof body.error?.code === 'string') code = body.error.code as TtsErrorCode
    if (typeof body.error?.message === 'string') message = body.error.message
  } catch {
    // Non-JSON failure body: keep the generic HTTP message.
  }
  throw new TtsClientError(code, message)
}

/** One PCM chunk event off the stream. */
export interface SpeechStreamEvent {
  /** Base64-encoded 24 kHz / 16-bit / mono PCM bytes. */
  pcm?: string
  /** Terminal event carrying statistics once the stream completes. */
  done?: boolean
  firstChunkMs?: number
  chunks?: number
  /** Terminal failure event; code and message are set. */
  error?: { code?: unknown; message?: unknown; param?: unknown }
}

/**
 * Stream one text as raw PCM chunks and feed each chunk to `onChunk`.
 *
 * The Host answers with `text/event-stream`; every `data:` line carries one
 * JSON object with either a `pcm` base64 payload, a terminal `done`, or an
 * `error`. The browser decodes and schedules each chunk as it arrives, so the
 * first chunk is playable before the rest of the utterance exists.
 * @param request - text and optional style/voice overrides.
 * @param onChunk - invoked once per decoded PCM chunk, in arrival order.
 * @param signal - aborts the request mid-stream when the reader stops.
 * @returns the terminal stats event.
 * @throws {TtsClientError} when the Host refuses or the transport fails.
 */
export async function requestSpeechStream(
  request: TtsSynthesizeRequest,
  onChunk: (pcm: Uint8Array) => void,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetch(MIMOSPEAK_SYNTHESIZE_STREAM_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      ...(signal === undefined ? {} : { signal }),
    })
  } catch (error) {
    throw new TtsClientError('generic', error instanceof Error ? error.message : String(error))
  }
  if (!response.ok) {
    // A refused stream answers with the same JSON error envelope as
    // /synthesize; dropping it would turn "no API key" into a bare HTTP code.
    let code: TtsErrorCode | 'generic' = 'generic'
    let message = `stream request failed with HTTP ${response.status}`
    try {
      const failure = await response.json() as { error?: { code?: unknown; message?: unknown } }
      if (typeof failure.error?.code === 'string') code = failure.error.code as TtsErrorCode
      if (typeof failure.error?.message === 'string') message = failure.error.message
    } catch {
      // Non-JSON failure body: keep the generic HTTP message.
    }
    throw new TtsClientError(code, message)
  }
  const body = response.body
  if (body === null) {
    throw new TtsClientError('generic', 'stream request returned no body.')
  }
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newlineAt = buffer.indexOf('\n')
      while (newlineAt !== -1) {
        const line = buffer.slice(0, newlineAt).trim()
        buffer = buffer.slice(newlineAt + 1)
        newlineAt = buffer.indexOf('\n')
        if (!line.startsWith('data:')) continue
        const payloadText = line.slice(5).trim()
        if (payloadText === '') continue
        let payload: SpeechStreamEvent
        try {
          payload = JSON.parse(payloadText) as SpeechStreamEvent
        } catch {
          continue
        }
        if (payload.error !== undefined) {
          const code = typeof payload.error.code === 'string' ? payload.error.code as TtsErrorCode : 'generic'
          const message = typeof payload.error.message === 'string' ? payload.error.message : 'stream failed'
          throw new TtsClientError(code, message)
        }
        if (typeof payload.pcm === 'string' && payload.pcm !== '') {
          const binary = atob(payload.pcm)
          const bytes = new Uint8Array(binary.length)
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index)
          }
          onChunk(bytes)
        }
        if (payload.done === true) return
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Run the Host-side round-trip health check.
 * @returns which engine answered, its latency, and its voice.
 * @throws {TtsClientError} when the Host refuses or both engines fail.
 */
export async function requestSpeechTest(): Promise<TtsTestResult> {
  let response: Response
  try {
    response = await fetch(MIMOSPEAK_TEST_PATH, { method: 'POST' })
  } catch (error) {
    throw new TtsClientError('generic', error instanceof Error ? error.message : String(error))
  }
  if (response.ok) return await response.json() as TtsTestResult
  let code: TtsErrorCode | 'generic' = 'generic'
  let message = `test request failed with HTTP ${response.status}`
  try {
    const body = await response.json() as { error?: { code?: unknown; message?: unknown } }
    if (typeof body.error?.code === 'string') code = body.error.code as TtsErrorCode
    if (typeof body.error?.message === 'string') message = body.error.message
  } catch {
    // Non-JSON failure body: keep the generic HTTP message.
  }
  throw new TtsClientError(code, message)
}
export interface RecordingRef {
  /** Recording-node id. */
  recId: string
  /** Version id within that node. */
  verId: string
}

/**
 * List the persisted speech history.
 * @returns the recordings index (empty when none recorded yet).
 */
export async function fetchRecordings(): Promise<TtsRecordingsIndex> {
  const response = await fetch(MIMOSPEAK_RECORDINGS_PATH, { method: 'GET', cache: 'no-store' })
  if (!response.ok) {
    throw new TtsClientError('generic', `recordings request failed with HTTP ${response.status}`)
  }
  return await response.json() as TtsRecordingsIndex
}

/**
 * Synthesize and persist one text, returning both the audio and its identity
 * in history. Used by the speak action so every read-aloud is remembered.
 * @param request - text and optional style/voice overrides.
 * @returns the WAV blob and the new recording reference.
 * @throws {TtsClientError} when the Host refuses or the transport fails.
 */
export async function requestRecording(request: TtsSynthesizeRequest): Promise<{ blob: Blob; ref: RecordingRef }> {
  let response: Response
  try {
    response = await fetch(MIMOSPEAK_RECORDINGS_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
  } catch (error) {
    throw new TtsClientError('generic', error instanceof Error ? error.message : String(error))
  }
  if (response.ok) {
    const blob = await response.blob()
    const header = response.headers.get(MIMOSPEAK_RECORDING_HEADER)
    let ref: RecordingRef = { recId: '', verId: '' }
    if (header !== null) {
      try {
        ref = JSON.parse(atob(header)) as RecordingRef
      } catch {
        // Header malformed: the audio still plays, just without a history ref.
      }
    }
    return { blob, ref }
  }
  let code: TtsErrorCode | 'generic' = 'generic'
  let message = `recording request failed with HTTP ${response.status}`
  try {
    const body = await response.json() as { error?: { code?: unknown; message?: unknown } }
    if (typeof body.error?.code === 'string') code = body.error.code as TtsErrorCode
    if (typeof body.error?.message === 'string') message = body.error.message
  } catch {
    // Non-JSON failure body: keep the generic HTTP message.
  }
  throw new TtsClientError(code, message)
}

/**
 * Re-synthesize a recording's text with the engine's current settings,
 * appending a new version. Earlier versions stay intact for comparison.
 * @param recId - the recording node id.
 * @returns the new version's reference.
 */
export async function resynthesizeRecording(recId: string): Promise<RecordingRef> {
  let response: Response
  try {
    response = await fetch(`${MIMOSPEAK_RECORDINGS_PATH}/resynth?rec=${encodeURIComponent(recId)}`, { method: 'POST' })
  } catch (error) {
    throw new TtsClientError('generic', error instanceof Error ? error.message : String(error))
  }
  if (response.ok) return await response.json() as RecordingRef
  let message = `re-synthesis failed with HTTP ${response.status}`
  try {
    const body = await response.json() as { error?: { message?: unknown } }
    if (typeof body.error?.message === 'string') message = body.error.message
  } catch {
    // Keep the generic HTTP message.
  }
  throw new TtsClientError('generic', message)
}

/**
 * Delete one version from history.
 * @param recId - the recording node id.
 * @param verId - the version id to remove.
 */
export async function deleteRecordingVersion(recId: string, verId: string): Promise<void> {
  const response = await fetch(
    `${MIMOSPEAK_RECORDINGS_PATH}/version?rec=${encodeURIComponent(recId)}&ver=${encodeURIComponent(verId)}`,
    { method: 'DELETE' },
  )
  if (!response.ok && response.status !== 204) {
    throw new TtsClientError('generic', `delete failed with HTTP ${response.status}`)
  }
}

/**
 * The URL serving one version's WAV file.
 * @param recId - the recording node id.
 * @param verId - the version id.
 * @returns an absolute path under the plugin's recordings route.
 */
export function recordingFileUrl(recId: string, verId: string): string {
  return `${MIMOSPEAK_RECORDINGS_PATH}/file?rec=${encodeURIComponent(recId)}&ver=${encodeURIComponent(verId)}`
}
