/**
 * Browser → Host calls for speech synthesis.
 *
 * Both halves share their route vocabulary through `src/settings.ts`; the
 * browser sends text and receives WAV bytes, so the MiMo API key never enters
 * the page. Failures arrive as stable codes the UI maps to localized copy.
 * @module dsh-mimo-speak/client/api
 */
import type { TtsErrorCode, TtsStatusView, TtsSynthesizeRequest, TtsTestResult } from '../settings.ts';
/** A synthesize failure carrying the Host's stable code. */
export declare class TtsClientError extends Error {
    readonly code: TtsErrorCode | 'generic';
    /**
     * @param code - stable failure code; `generic` when the Host gave none.
     * @param message - Host-supplied detail, safe to show.
     */
    constructor(code: TtsErrorCode | 'generic', message: string);
}
/**
 * Read the Host's resolved engine configuration (never secrets).
 * @returns the effective model, voice, endpoint, and key/sample presence.
 */
/** Which engine the Host's audio actually came from. */
export type SpeechEngine = 'mimo' | 'edge';
/**
 * Read the answering engine off an audio response.
 *
 * The Host answers MiMo synthesis as `audio/wav` and the Edge fallback as
 * `audio/mpeg`, so the content type is the honest signal: the client can say
 * "the fallback voice is reading this" instead of switching voices silently.
 * @param blob - the audio response body.
 * @returns the engine that produced it.
 */
export declare function speechEngineOf(blob: Blob): SpeechEngine;
/**
 * Ask the Host for a short spoken summary of one reply.
 *
 * Used by the brief read scope: summarizing first and speaking the summary is
 * what "简要播报" should mean, instead of mechanically picking sentences.
 * @param text - the reply text to condense.
 * @param signal - aborts the request when the reader stops.
 * @returns the summary text.
 */
export declare function requestSummary(text: string, signal?: AbortSignal): Promise<string>;
export declare function fetchTtsStatus(): Promise<TtsStatusView>;
/**
 * Synthesize one text into playable WAV audio.
 * @param request - text and optional style/voice overrides (settings-page
 * audition previews unsaved values through these).
 * @param signal - aborts the request when the reader stops.
 * @returns the WAV payload as a Blob ready for `URL.createObjectURL`.
 * @throws {TtsClientError} when the Host refuses or the transport fails.
 */
export declare function requestSpeech(request: TtsSynthesizeRequest, signal?: AbortSignal): Promise<Blob>;
/** One PCM chunk event off the stream. */
export interface SpeechStreamEvent {
    /** Base64-encoded 24 kHz / 16-bit / mono PCM bytes. */
    pcm?: string;
    /** Terminal event carrying statistics once the stream completes. */
    done?: boolean;
    firstChunkMs?: number;
    chunks?: number;
    /** Terminal failure event; code and message are set. */
    error?: {
        code?: unknown;
        message?: unknown;
        param?: unknown;
    };
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
export declare function requestSpeechStream(request: TtsSynthesizeRequest, onChunk: (pcm: Uint8Array) => void, signal?: AbortSignal): Promise<void>;
/**
 * Run the Host-side round-trip health check.
 * @returns which engine answered, its latency, and its voice.
 * @throws {TtsClientError} when the Host refuses or both engines fail.
 */
export declare function requestSpeechTest(): Promise<TtsTestResult>;
