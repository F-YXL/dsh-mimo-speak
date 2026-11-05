/**
 * Markdown → speakable-text normalization applied Host-side before synthesis.
 *
 * The MiMo TTS endpoint speaks whatever it is given; assistant replies are
 * Markdown, and reading decoration, fences, and URLs aloud is noise. The
 * normalization here is deliberately conservative: it removes presentation
 * markup while keeping the words, and it never invents text.
 * @module dsh-mimo-speak/normalize
 */
/**
 * Convert assistant Markdown into text worth speaking aloud.
 *
 * Removes fenced code (kept as a short spoken note), inline-code markers,
 * heading/list/quote markers, emphasis markers, tables (cells joined with
 * commas), images, HTML tags, and link targets (the anchor text stays).
 * @param markdown - raw assistant reply text.
 * @returns plain text suitable for TTS input.
 */
export declare function toSpeakableText(markdown: string): string;
/**
 * Cut a long text at a sentence boundary near `maxChars`.
 *
 * The synthesize route refuses oversized input; callers that prefer speaking a
 * prefix over refusing outright use this first.
 * @param text - normalized speakable text.
 * @param maxChars - inclusive character budget.
 * @returns the text unchanged when it fits, otherwise a prefix ending at the
 * last sentence boundary inside the budget (or a hard cut when there is none).
 */
export declare function clampText(text: string, maxChars: number): string;
