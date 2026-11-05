/**
 * MiMo TTS engine client.
 *
 * Speaks text through the MiMo platform's OpenAI-shaped `/chat/completions`
 * endpoint with an `audio` output block: the request carries the text as an
 * assistant message (optionally prefixed with a `<style>…</style>` phrase), and
 * the response carries base64 audio in `choices[0].message.audio.data`. Voice
 * cloning swaps the preset `audio.voice` for an `audio.voice_audio` reference
 * clip. Raw PCM responses are wrapped as WAV so the browser can seek.
 * @module dsh-mimo-speak/tts
 */
import type { TtsErrorCode } from './settings.ts';
/** A synthesis failure carrying a stable, UI-mappable code. */
export declare class TtsError extends Error {
    readonly code: TtsErrorCode;
    readonly cause?: unknown | undefined;
    readonly upstreamStatus?: number | undefined;
    readonly upstreamParam?: string | undefined;
    /**
     * @param code - stable failure code returned to the browser.
     * @param message - human-readable detail; never contains secrets.
     * @param cause - upstream failure, when one raised this error.
     * @param upstreamStatus - provider HTTP status, when one was returned.
     * @param upstreamParam - provider `param` hint, when one was returned.
     */
    constructor(code: TtsErrorCode, message: string, cause?: unknown | undefined, upstreamStatus?: number | undefined, upstreamParam?: string | undefined);
}
/** Engine configuration resolved from the plugin's settings section. */
export interface TtsEngineConfig {
    /** Literal MiMo API key; the request authenticates with `api-key` header. */
    apiKey: string;
    /** Endpoint base; `/chat/completions` is appended. */
    baseUrl: string;
    /** Model id. */
    model: string;
    /** Preset voice used when no clone sample applies. */
    voice: string;
    /** Host-local WAV used as the voice-clone reference; empty uses the preset voice. */
    voiceSamplePath: string;
    /** Default style phrase prepended as `<style>…</style>`; empty speaks neutrally. */
    style: string;
    /** Longest accepted text, in characters. */
    maxChars: number;
    /** Upper bound on one upstream round-trip, in milliseconds. */
    timeoutMs: number;
}
/** One synthesis request as the route accepts it. */
export interface TtsSynthesis {
    /** Raw text; normalized to speakable text before synthesis. */
    text: string;
    /** Style override; falls back to the configured default. */
    style?: string | undefined;
    /** Preset-voice override; falls back to the configured default. */
    voice?: string | undefined;
}
/** Injection seam for tests: transport and voice-sample loading. */
export interface TtsEngineDeps {
    /** `fetch` compatible transport. */
    fetch: typeof fetch;
    /** Reads the voice-clone reference clip from the Host filesystem. */
    readVoiceSample: (path: string) => Promise<Uint8Array>;
}
/**
 * Resolve a settings section into the engine configuration a synthesis runs
 * with. Defaults live here rather than at the use site, so every caller sees
 * fully defaulted values (the schema defaults are for the settings form).
 * @param section - the resolved settings section (fields may be blank).
 * @returns the engine configuration for one synthesis.
 */
export declare function resolveEngineConfig(section: {
    apiKey?: string | undefined;
    baseUrl?: string | undefined;
    model?: string | undefined;
    voice?: string | undefined;
    voiceSamplePath?: string | undefined;
    style?: string | undefined;
    maxChars?: number | undefined;
    timeoutMs?: number | undefined;
}): TtsEngineConfig;
/**
 * Synthesize one text into WAV audio.
 *
 * The text is normalized first (Markdown decoration is never spoken), then
 * clamped to the configured budget — a long reply speaks its opening rather
 * than being refused.
 * @param config - resolved engine configuration.
 * @param request - text and optional style/voice overrides.
 * @param deps - transport and filesystem seam; defaults to real `fetch`/`fs`.
 * @returns a complete WAV file.
 * @throws {TtsError} when the request is unusable or the provider fails.
 */
export declare function synthesizeSpeech(config: TtsEngineConfig, request: TtsSynthesis, deps?: TtsEngineDeps): Promise<Uint8Array>;
/** Statistics a streaming synthesis reports back to its caller. */
export interface TtsStreamStats {
    /** Milliseconds from request start to the first PCM chunk. */
    firstChunkMs: number;
    /** Total decoded PCM bytes streamed. */
    totalBytes: number;
    /** Number of PCM chunks streamed. */
    chunks: number;
}
/**
 * Stream one text as raw 24 kHz / 16-bit / mono PCM chunks.
 *
 * MiMo's `chat/completions` endpoint accepts `stream: true`; audio then
 * arrives incrementally in `choices[0].delta.audio.data` base64 chunks of a
 * single PCM stream (no headers), so the browser can start playing after the
 * first chunk instead of waiting for the whole utterance.
 *
 * Voice cloning is intentionally unsupported here: the streamed contract was
 * only validated for preset voices, so callers with a clone sample must use
 * the non-streaming path.
 * @param config - resolved engine configuration.
 * @param request - text and optional style/voice overrides.
 * @param deps - transport seam; defaults to real `fetch`.
 * @param onChunk - invoked once per decoded PCM chunk, in arrival order.
 * @returns streaming statistics once the stream completes.
 * @throws {TtsError} when the request is unusable or the provider fails.
 */
export declare function streamSpeechPcm(config: TtsEngineConfig, request: TtsSynthesis, deps: TtsEngineDeps | undefined, onChunk: (pcm: Uint8Array) => void): Promise<TtsStreamStats>;
