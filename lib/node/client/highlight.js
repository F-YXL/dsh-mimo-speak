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
const STYLE_ID = 'dsh-mimo-speak-highlight-style';
const HIGHLIGHT_NAME = 'dsh-mimo-speak-sentence';
/**
 * The instance that most recently painted. Every instance writes the same
 * highlight name, so a clear() from a stale instance — an older message
 * finishing while the new one speaks — would otherwise wipe the live paint.
 */
let owner = null;
/** Whether the browser supports the CSS Custom Highlight API. */
function highlightSupported() {
    return typeof window !== 'undefined'
        && typeof window.CSS !== 'undefined'
        && window.CSS.highlights !== undefined
        && typeof window.Highlight === 'function';
}
function ensureStyle() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID) !== null)
        return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `::highlight(${HIGHLIGHT_NAME}){background-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#ffc400) 26%,transparent)}`;
    document.head.appendChild(style);
}
/** Keep only letters and digits, case-folded, so matching ignores Markdown. */
function keyChar(char) {
    const code = char.codePointAt(0);
    if (code === undefined)
        return '';
    if ((code >= 0x30 && code <= 0x39) || (code >= 0x61 && code <= 0x7a))
        return char;
    if (code >= 0x41 && code <= 0x5a)
        return char.toLowerCase();
    if (code >= 0x4e00 && code <= 0x9fff)
        return char;
    // Latin letters beyond ASCII, Cyrillic, etc.: keep the normalized glyph.
    if (/\p{L}/u.test(char) || /\p{N}/u.test(char))
        return char.normalize('NFC').toLowerCase();
    return '';
}
/** Build the folded key plus per-key source offsets for one string. */
function keyOf(text) {
    let key = '';
    const at = [];
    for (let index = 0; index < text.length; index += 1) {
        const folded = keyChar(text[index]);
        if (folded === '')
            continue;
        key += folded;
        at.push(index);
    }
    return { key, at };
}
/**
 * Locate the message bubble containing the speak button, by walking up from
 * the button until an ancestor's text carries the opening of the spoken text.
 * @param fromEl - the action row element (or any descendant of the bubble).
 * @param probeText - the speakable text whose opening identifies the bubble.
 * @returns the closest matching ancestor, or null.
 */
export function findMessageContainer(fromEl, probeText) {
    if (fromEl === null || typeof document === 'undefined')
        return null;
    const probe = keyOf(probeText.slice(0, 80)).key.slice(0, 40);
    if (probe === '')
        return null;
    let element = fromEl.parentElement;
    for (let depth = 0; element !== null && depth < 14; depth += 1, element = element.parentElement) {
        const key = keyOf(element.textContent ?? '').key;
        if (key.includes(probe))
            return element;
    }
    return null;
}
/** Highlight one sentence of one message while it plays. */
export class SentenceHighlighter {
    container;
    token = {};
    nodes = [];
    map = [];
    key = '';
    /** Text length the index was built from; a re-render invalidates it. */
    indexedSignature = '';
    constructor(container) {
        this.container = container ?? document.body;
        if (highlightSupported())
            ensureStyle();
    }
    /** Whether any highlight can actually be painted. */
    get supported() {
        return highlightSupported();
    }
    /** Index the message's text nodes, rebuilding when the text changed. */
    index() {
        // Markdown can re-render while a reply settles; rebuild on a length change
        // so ranges never point at a stale text node.
        const signature = `${this.container.textContent?.length ?? -1}`;
        if (this.indexedSignature === signature)
            return;
        this.indexedSignature = signature;
        this.nodes.length = 0;
        this.map.length = 0;
        this.key = '';
        const walker = document.createTreeWalker(this.container, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                const parent = node.parentElement;
                if (parent === null)
                    return NodeFilter.FILTER_REJECT;
                const tag = parent.tagName;
                if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'BUTTON' || tag === 'PRE')
                    return NodeFilter.FILTER_REJECT;
                if (parent.closest('.mimo-speak-root') !== null)
                    return NodeFilter.FILTER_REJECT;
                const value = node.nodeValue ?? '';
                if (value.trim() === '')
                    return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        let node;
        while ((node = walker.nextNode()) !== null) {
            const text = node.nodeValue ?? '';
            const { key, at } = keyOf(text);
            if (key === '')
                continue;
            this.nodes.push({ node: node, text, keyLength: at.length });
            for (let index = 0; index < at.length; index += 1) {
                this.map.push([this.nodes.length - 1, at[index]]);
            }
            this.key += key;
        }
    }
    /**
     * Paint the sentence `text` onto the message, searching from the key offset
     * `from` so repeated phrases highlight their later occurrence.
     * @param text - one chunk (a substring of the message).
     * @param from - key offset to search from.
     * @returns the key offset just past the painted range (feed it back next).
     */
    show(text, from) {
        if (!highlightSupported())
            return from;
        try {
            this.index();
            const { key } = keyOf(text);
            if (key === '' || this.key === '')
                return from;
            let start = this.key.indexOf(key, Math.max(0, from));
            if (start < 0)
                start = this.key.indexOf(key);
            if (start < 0)
                return from;
            const end = start + key.length;
            if (start >= this.map.length || end > this.map.length)
                return from;
            const first = this.map[start];
            const last = this.map[end - 1];
            const range = new Range();
            range.setStart(this.nodes[first[0]].node, first[1]);
            range.setEnd(this.nodes[last[0]].node, last[1] + 1);
            const highlight = new Highlight(range);
            owner = this.token;
            window.CSS.highlights.set(HIGHLIGHT_NAME, highlight);
            return end;
        }
        catch {
            // Painting is decorative: it must never break playback.
            return from;
        }
    }
    /** Remove the painted sentence, unless another instance owns it now. */
    clear() {
        if (!highlightSupported())
            return;
        if (owner !== null && owner !== this.token)
            return;
        owner = null;
        try {
            ;
            window.CSS.highlights.delete(HIGHLIGHT_NAME);
        }
        catch {
            // Nothing painted.
        }
    }
}
//# sourceMappingURL=highlight.js.map