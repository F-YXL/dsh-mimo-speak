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
/** Entries kept before the oldest are revoked. */
const CACHE_CAP = 60;
const cache = new Map();
const order = [];
/**
 * Build the cache key for one chunk.
 * @param signature - how the current configuration sounds.
 * @param text - the chunk text.
 * @returns a key that changes whenever the sound or the words do.
 */
export function speechCacheKey(signature, text) {
    return [
        signature.voice, signature.model, signature.style, signature.baseUrl,
        signature.edgeVoice, String(signature.maxChars), text,
    ].join('\u0000');
}
/**
 * Look one chunk up.
 * @param key - from `speechCacheKey`.
 * @returns the cached audio, when present.
 */
export function cachedSpeech(key) {
    return cache.get(key);
}
/**
 * Store one chunk, dropping the oldest entries past the cap.
 * @param key - from `speechCacheKey`.
 * @param value - the object URL and its engine.
 */
export function cacheSpeech(key, value) {
    if (cache.has(key))
        return;
    cache.set(key, value);
    order.push(key);
    while (order.length > CACHE_CAP) {
        const oldest = order.shift();
        if (oldest === undefined)
            break;
        const stale = cache.get(oldest);
        cache.delete(oldest);
        if (stale !== undefined)
            URL.revokeObjectURL(stale.url);
    }
}
/**
 * Drop every cached chunk.
 *
 * Called after a settings save: the user just asked for different audio, so
 * replaying anything cached under the previous configuration would quietly
 * ignore the change.
 */
export function clearSpeechCache() {
    for (const value of cache.values())
        URL.revokeObjectURL(value.url);
    cache.clear();
    order.length = 0;
}
//# sourceMappingURL=speech-cache.js.map