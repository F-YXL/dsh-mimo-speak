/**
 * Markdown → speakable-text normalization applied Host-side before synthesis.
 *
 * The MiMo TTS endpoint speaks whatever it is given; assistant replies are
 * Markdown, and reading decoration, fences, and URLs aloud is noise. The
 * normalization here is deliberately conservative: it removes presentation
 * markup while keeping the words, and it never invents text.
 * @module dsh-mimo-speak/normalize
 */
/** Replacement spoken for a fenced code block (reading code aloud is noise). */
const CODE_FENCE_NOTE = '代码略。';
/**
 * Convert assistant Markdown into text worth speaking aloud.
 *
 * Removes fenced code (kept as a short spoken note), inline-code markers,
 * heading/list/quote markers, emphasis markers, tables (cells joined with
 * commas), images, HTML tags, and link targets (the anchor text stays).
 * @param markdown - raw assistant reply text.
 * @returns plain text suitable for TTS input.
 */
export function toSpeakableText(markdown) {
    let text = markdown;
    // Fenced code: one spoken note per block, whatever its language.
    text = text.replace(/```[\s\S]*?```/g, `\n${CODE_FENCE_NOTE}\n`);
    text = text.replace(/~~~[\s\S]*?~~~/g, `\n${CODE_FENCE_NOTE}\n`);
    // Inline code keeps its content, loses its ticks.
    text = text.replace(/`([^`\n]*)`/g, '$1');
    // Images: drop entirely (alt text is rarely speakable).
    text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
    // Links keep the anchor text; the URL is never spoken.
    text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    text = text.replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1');
    // Reference definitions and HTML tags.
    text = text.replace(/^\[[^\]]*\]:\s+\S+.*$/gmu, '');
    text = text.replace(/<\/?[a-zA-Z][^>\n]*>/g, '');
    // Headings, bullets, quotes, and horizontal rules.
    text = text.replace(/^#{1,6}\s+/gmu, '');
    text = text.replace(/^\s*(?:[-*+]|\d+[.)])\s+/gmu, '');
    text = text.replace(/^\s*>\s?/gmu, '');
    text = text.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gmu, '\n');
    // Tables: keep cell text in reading order, drop alignment and cell markup.
    text = text.replace(/^\|?[\s:|-]+\|[\s:|-]*$/gmu, '');
    text = text.replace(/\s*\|\s*/g, '，');
    // Emphasis and strikethrough markers only; the words stay.
    text = text.replace(/(\*\*|__|~~)/g, '');
    text = text.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1');
    text = text.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1');
    // Escaped punctuation keeps the punctuation.
    text = text.replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1');
    // Whitespace: collapse runs, trim each line, drop empty lines.
    text = text.replace(/[ \t]+/g, ' ');
    text = text.split('\n').map(line => line.trim()).filter(line => line !== '').join('\n');
    return text.trim();
}
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
export function clampText(text, maxChars) {
    if (text.length <= maxChars)
        return text;
    const prefix = text.slice(0, maxChars);
    const boundary = Math.max(prefix.lastIndexOf('。'), prefix.lastIndexOf('！'), prefix.lastIndexOf('？'), prefix.lastIndexOf('!'), prefix.lastIndexOf('?'), prefix.lastIndexOf('.'));
    return boundary > maxChars / 2 ? prefix.slice(0, boundary + 1) : prefix;
}
//# sourceMappingURL=normalize.js.map