/**
 * Extractive briefing for long replies.
 *
 * A spoken reply does not need every caveat a written one carries: the point of
 * read-aloud is to know what happened. The rule is deliberately mechanical, so
 * the result is predictable and fits in one sentence:
 *
 * **一段一行，只念每段的第一句；整篇只有一段时念前几句。**
 *
 * Table rows, bare links, code notes and horizontal rules are skipped, because
 * reading them aloud conveys nothing. Nothing is invented and no model is
 * called, so a brief always agrees with the reply it came from.
 * @module dsh-mimo-speak/brief
 */
/**
 * Condense text into its opening points.
 * @param text - speakable plain text (already markdown-normalized).
 * @param limit - soft character budget for the result.
 * @param maxSentences - hard cap on spoken sentences.
 * @param prefix - optional lead-in spoken before the brief (e.g. 「简要播报」).
 * @returns the briefed text; the input itself when it is already short.
 */
export declare function briefText(text: string, limit?: number, maxSentences?: number, prefix?: string): string;
