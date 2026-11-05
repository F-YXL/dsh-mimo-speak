/**
 * Replay cache for synthesized speech, keyed by the *sound* of a chunk.
 *
 * Replaying the same passage (the same message again, or overlapping text
 * across replies) should not call the provider twice. But the key must include
 * everything that changes how it sounds — otherwise changing the voice, style
 * or model keeps replaying the old take, and the settings appear to be ignored.
 * `SpeechSignature` is that "how it sounds" fingerprint.
 * @module dsh-mimo-speak/client/speech-cache
 */

/** Which engine produced a cached chunk. */
export type CachedEngine = 'mimo' | 'edge'

/** One cached chunk: its object URL and the engine that answered. */
export interface CachedSpeech {
  url: string
  engine: CachedEngine
}

/** Everything that makes the same words sound different. */
export interface SpeechSignature {
  /** Effective preset voice (or clone sample path). */
  voice: string
  /** Effective model id. */
  model: string
  /** Style phrase the Host wraps around the text, when set. */
  style: string
  /** Endpoint base, so switching providers does not reuse audio. */
  baseUrl: string
  /** Fallback Edge voice, used when MiMo is not the one answering. */
  edgeVoice: string
  /** Per-request character budget, which can change the truncation point. */
  maxChars: number
}

/** Entries kept before the oldest are revoked. */
const CACHE_CAP = 60

const cache = new Map<string, CachedSpeech>()
const order: string[] = []

/**
 * Build the cache key for one chunk.
 * @param signature - how the current configuration sounds.
 * @param text - the chunk text.
 * @returns a key that changes whenever the sound or the words do.
 */
export function speechCacheKey(signature: SpeechSignature, text: string): string {
  return [
    signature.voice, signature.model, signature.style, signature.baseUrl,
    signature.edgeVoice, String(signature.maxChars), text,
  ].join('\u0000')
}

/**
 * Look one chunk up.
 * @param key - from `speechCacheKey`.
 * @returns the cached audio, when present.
 */
export function cachedSpeech(key: string): CachedSpeech | undefined {
  return cache.get(key)
}

/**
 * Store one chunk, dropping the oldest entries past the cap.
 * @param key - from `speechCacheKey`.
 * @param value - the object URL and its engine.
 */
export function cacheSpeech(key: string, value: CachedSpeech): void {
  if (cache.has(key)) return
  cache.set(key, value)
  order.push(key)
  while (order.length > CACHE_CAP) {
    const oldest = order.shift()
    if (oldest === undefined) break
    const stale = cache.get(oldest)
    cache.delete(oldest)
    if (stale !== undefined) URL.revokeObjectURL(stale.url)
  }
}

/**
 * Drop every cached chunk.
 *
 * Called after a settings save: the user just asked for different audio, so
 * replaying anything cached under the previous configuration would quietly
 * ignore the change.
 */
export function clearSpeechCache(): void {
  for (const value of cache.values()) URL.revokeObjectURL(value.url)
  cache.clear()
  order.length = 0
}
