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
export type CachedEngine = 'mimo' | 'edge';
/** One cached chunk: its object URL and the engine that answered. */
export interface CachedSpeech {
    url: string;
    engine: CachedEngine;
}
/** Everything that makes the same words sound different. */
export interface SpeechSignature {
    /** Effective preset voice (or clone sample path). */
    voice: string;
    /** Effective model id. */
    model: string;
    /** Style phrase the Host wraps around the text, when set. */
    style: string;
    /** Endpoint base, so switching providers does not reuse audio. */
    baseUrl: string;
    /** Fallback Edge voice, used when MiMo is not the one answering. */
    edgeVoice: string;
    /** Per-request character budget, which can change the truncation point. */
    maxChars: number;
}
/**
 * Build the cache key for one chunk.
 * @param signature - how the current configuration sounds.
 * @param text - the chunk text.
 * @returns a key that changes whenever the sound or the words do.
 */
export declare function speechCacheKey(signature: SpeechSignature, text: string): string;
/**
 * Look one chunk up.
 * @param key - from `speechCacheKey`.
 * @returns the cached audio, when present.
 */
export declare function cachedSpeech(key: string): CachedSpeech | undefined;
/**
 * Store one chunk, dropping the oldest entries past the cap.
 * @param key - from `speechCacheKey`.
 * @param value - the object URL and its engine.
 */
export declare function cacheSpeech(key: string, value: CachedSpeech): void;
/**
 * Drop every cached chunk.
 *
 * Called after a settings save: the user just asked for different audio, so
 * replaying anything cached under the previous configuration would quietly
 * ignore the change.
 */
export declare function clearSpeechCache(): void;
