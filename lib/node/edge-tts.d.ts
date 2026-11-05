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
/** Resolve an Edge voice, defaulting to the user's preferred Xiaoxiao. */
export declare function resolveEdgeVoice(voice: string | undefined): string;
/**
 * Synthesize one text with Edge TTS.
 * @param text - plain text to speak.
 * @param voice - Edge voice name (e.g. `zh-CN-XiaoxiaoNeural`).
 * @param timeoutMs - upper bound on the whole round-trip.
 * @returns complete MP3 bytes.
 * @throws {TtsError} when the CLI is missing or the synthesis fails.
 */
export declare function synthesizeEdge(text: string, voice: string | undefined, timeoutMs: number): Promise<Uint8Array>;
