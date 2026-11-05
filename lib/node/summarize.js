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
/** Longest reply text handed to the summarizer, in characters. */
const MAX_INPUT_CHARS = 6000;
/** Hard cap on the spoken summary, in characters. */
const MAX_SUMMARY_CHARS = 110;
/** Sentence terminators that end a summary sentence. */
const TERMINATORS = new Set(['。', '！', '？', '；', '!', '?', ';']);
/** How the summary must sound when read aloud. */
const SYSTEM = [
    '你是朗读助手。把用户给你的这段助手回复浓缩成适合「听」的口播摘要。',
    '要求：1–2 句，合计不超过 80 字；只讲结论、关键动作和必要的数字；',
    '不要 Markdown、不要列表、不要代码、不要复述细节；',
    '不要「好的」「以下是」这类开场；直接给内容。',
    '使用与原文相同的语言。',
].join('');
/**
 * Read one service without declaring it as a plugin dependency.
 *
 * The plugin is useful even when nothing else is mounted, so the summary is an
 * optional capability rather than a hard requirement: `reflect.get` resolves a
 * service that exists without the cordis inject contract, and a plain property
 * lookup covers hosts that expose services directly.
 * @param ctx - host context.
 * @param name - service name (`llm`, `agentDefaultModel`).
 * @returns the service, or undefined when it is not mounted.
 */
function serviceOf(ctx, name) {
    try {
        const reflect = ctx.reflect;
        const value = reflect?.get?.(name);
        if (value !== undefined && value !== null)
            return value;
    }
    catch {
        // Not reachable through reflect: try the plain property next.
    }
    try {
        return (ctx[name] ?? undefined);
    }
    catch {
        return undefined;
    }
}
/**
 * Turn model output into something worth speaking.
 * @param raw - the assembled model text.
 * @returns at most two sentences, without decoration.
 */
export function polishSummary(raw) {
    const cleaned = raw
        .replace(/```[\s\S]*?```/gu, '')
        .replace(/(\*\*|__|~~|`)/gu, '')
        .replace(/^[\s#>]*[-+*•·]?\s*/gmu, '')
        .replace(/\s+/gu, ' ')
        .trim();
    if (cleaned === '')
        return '';
    const sentences = [];
    let buffer = '';
    for (const character of cleaned) {
        buffer += character;
        if (TERMINATORS.has(character)) {
            sentences.push(buffer.trim());
            buffer = '';
            if (sentences.length === 2)
                break;
        }
    }
    if (sentences.length === 0 && buffer.trim() !== '')
        sentences.push(buffer.trim());
    const joined = sentences.join('');
    return joined.length <= MAX_SUMMARY_CHARS ? joined : `${joined.slice(0, MAX_SUMMARY_CHARS)}…`;
}
/**
 * Ask the configured model for a spoken summary.
 * @param ctx - host context carrying the `llm` service.
 * @param text - the reply text to condense.
 * @param signal - aborts the request when the reader stops.
 * @returns the summary, or undefined when no model answered.
 */
export async function summarizeForSpeech(ctx, text, signal) {
    const trimmed = text.trim();
    if (trimmed === '')
        return undefined;
    const llm = serviceOf(ctx, 'llm');
    const selection = serviceOf(ctx, 'agentDefaultModel')?.currentSelection?.();
    const provider = selection?.provider;
    const model = selection?.model;
    if (llm?.stream === undefined || provider === undefined || provider === '' || model === undefined || model === '') {
        return undefined;
    }
    let assembled = '';
    try {
        const stream = llm.stream({
            provider,
            model,
            messages: [{
                    role: 'user',
                    content: [{ type: 'text', text: trimmed.slice(0, MAX_INPUT_CHARS) }],
                }],
            system: SYSTEM,
            temperature: 0.3,
            maxTokens: 300,
            ...(signal === undefined ? {} : { signal }),
        });
        for await (const chunk of stream) {
            if (chunk.type === 'text-delta')
                assembled += chunk.text;
        }
    }
    catch {
        // Any provider failure simply means "no summary": the caller stays offline.
        return undefined;
    }
    const summary = polishSummary(assembled);
    return summary === '' ? undefined : summary;
}
//# sourceMappingURL=summarize.js.map