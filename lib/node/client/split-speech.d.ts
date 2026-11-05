/**
 * Sentence-aligned text splitting for pipelined playback.
 *
 * The browser splits already-normalized speakable text into chunks around a
 * configured size, then synthesizes and plays them back-to-back while the next
 * chunk is still being produced. Splitting at sentence boundaries keeps chunks
 * sounding natural; a sentence longer than the budget is hard-split at a
 * punctuation or whitespace seam.
 * @module dsh-mimo-speak/client/split-speech
 */
/**
 * Split normalized speakable text into ordered chunks at sentence boundaries.
 *
 * @param text - plain text, already stripped of Markdown by the Host's
 * normalizer; this function only partitions it for playback.
 * @param chunkChars - target chunk size in characters.
 * @returns speakable chunks, each non-empty and at most `chunkChars` long
 * except when a single unbroken sentence must be hard-split.
 */
export declare function splitForSpeech(text: string, chunkChars: number): string[];
