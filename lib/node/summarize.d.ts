/**
 * Model-written spoken summary for brief read-aloud.
 *
 * A mechanical "one sentence per paragraph" rule is predictable but stiff: it
 * picks whichever sentence happens to come first, which is often a preamble
 * rather than the point. A brief read-aloud should be *summarized*, then
 * spoken — one or two sentences that carry the conclusion.
 *
 * This module asks the model the user already has configured (through the
 * harness `llm` service) for that summary. It is a best-effort extra step: any
 * missing service, missing selection or provider failure returns `undefined`,
 * and the caller falls back to the offline extractive rule.
 * @module dsh-mimo-speak/summarize
 */
import type { Context } from '@deepseek-ai/cordis';
/**
 * Turn model output into something worth speaking.
 * @param raw - the assembled model text.
 * @returns at most two sentences, without decoration.
 */
export declare function polishSummary(raw: string): string;
/**
 * Ask the configured model for a spoken summary.
 * @param ctx - host context carrying the `llm` service.
 * @param text - the reply text to condense.
 * @param signal - aborts the request when the reader stops.
 * @returns the summary, or undefined when no model answered.
 */
export declare function summarizeForSpeech(ctx: Context, text: string, signal?: AbortSignal): Promise<string | undefined>;
