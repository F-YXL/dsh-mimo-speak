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
/** Characters that end a spoken sentence. */
const SENTENCE_END = '。！？!?；;…\n';
/** Longest tolerated chunk before a sentence is hard-split. */
function clampChunkChars(value) {
    if (!Number.isFinite(value))
        return 120;
    return Math.min(1000, Math.max(20, Math.round(value)));
}
/**
 * Hard-split one over-long sentence at punctuation seams, preferring the
 * second half of the budget so the tail of each chunk stays natural.
 * @param piece - one sentence that exceeds the chunk budget.
 * @param limit - chunk size in characters.
 * @returns the sentence broken into budget-sized pieces.
 */
function hardSplit(piece, limit) {
    const parts = [];
    let rest = piece;
    while (rest.length > limit) {
        let cut = -1;
        const floor = Math.floor(limit * 0.5);
        for (let index = Math.min(limit, rest.length - 1); index > floor; index -= 1) {
            const char = rest.charAt(index);
            if (char === ' ' || char === '\n' || char === ',' || char === '，' || char === '、') {
                cut = index + 1;
                break;
            }
        }
        if (cut <= 0)
            cut = limit;
        parts.push(rest.slice(0, cut));
        rest = rest.slice(cut);
    }
    if (rest.length > 0)
        parts.push(rest);
    return parts;
}
/**
 * Split normalized speakable text into ordered chunks at sentence boundaries.
 *
 * @param text - plain text, already stripped of Markdown by the Host's
 * normalizer; this function only partitions it for playback.
 * @param chunkChars - target chunk size in characters.
 * @returns speakable chunks, each non-empty and at most `chunkChars` long
 * except when a single unbroken sentence must be hard-split.
 */
export function splitForSpeech(text, chunkChars) {
    const trimmed = (text ?? '').trim();
    if (trimmed.length === 0)
        return [];
    const limit = clampChunkChars(chunkChars);
    const sentences = [];
    let buffer = '';
    for (let index = 0; index < trimmed.length; index += 1) {
        const char = trimmed.charAt(index);
        buffer += char;
        if (SENTENCE_END.indexOf(char) >= 0) {
            sentences.push(buffer);
            buffer = '';
        }
    }
    if (buffer.length > 0)
        sentences.push(buffer);
    const chunks = [];
    let current = '';
    for (const sentence of sentences) {
        if (sentence.trim().length === 0)
            continue;
        if (sentence.length > limit) {
            if (current.trim().length > 0) {
                chunks.push(current.trim());
                current = '';
            }
            for (const part of hardSplit(sentence, limit)) {
                if (part.trim().length > 0)
                    chunks.push(part.trim());
            }
            continue;
        }
        if (current.length + sentence.length > limit && current.trim().length > 0) {
            chunks.push(current.trim());
            current = '';
        }
        current += sentence;
    }
    if (current.trim().length > 0)
        chunks.push(current.trim());
    return chunks.filter(chunk => chunk.length > 0);
}
//# sourceMappingURL=split-speech.js.map