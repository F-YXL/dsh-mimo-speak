/**
 * Sentence highlighting for the speak entry.
 *
 * While a chunk plays, the sentence it came from is tinted inside the message
 * bubble. The highlighter walks the message's text nodes once, indexes their
 * letters/digits (a normalization that survives Markdown and inline styles),
 * and maps each chunk text back to DOM ranges through the CSS Custom
 * Highlight API — so no DOM is mutated and scroll position never jumps.
 *
 * When the API is unavailable the highlighter silently no-ops.
 * @module dsh-mimo-speak/client/highlight
 */
/**
 * Locate the message bubble containing the speak button, by walking up from
 * the button until an ancestor's text carries the opening of the spoken text.
 * @param fromEl - the action row element (or any descendant of the bubble).
 * @param probeText - the speakable text whose opening identifies the bubble.
 * @returns the closest matching ancestor, or null.
 */
export declare function findMessageContainer(fromEl: Element | null, probeText: string): Element | null;
/** Highlight one sentence of one message while it plays. */
export declare class SentenceHighlighter {
    private readonly container;
    private readonly token;
    private readonly nodes;
    private readonly map;
    private key;
    /** Text length the index was built from; a re-render invalidates it. */
    private indexedSignature;
    constructor(container: Element | null);
    /** Whether any highlight can actually be painted. */
    get supported(): boolean;
    /** Index the message's text nodes, rebuilding when the text changed. */
    private index;
    /**
     * Paint the sentence `text` onto the message, searching from the key offset
     * `from` so repeated phrases highlight their later occurrence.
     * @param text - one chunk (a substring of the message).
     * @param from - key offset to search from.
     * @returns the key offset just past the painted range (feed it back next).
     */
    show(text: string, from: number): number;
    /** Remove the painted sentence, unless another instance owns it now. */
    clear(): void;
}
