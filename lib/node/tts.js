/**
 * MiMo TTS engine client.
 *
 * Speaks text through the MiMo platform's OpenAI-shaped `/chat/completions`
 * endpoint with an `audio` output block: the request carries the text as an
 * assistant message (optionally prefixed with a `<style>…</style>` phrase), and
 * the response carries base64 audio in `choices[0].message.audio.data`. Voice
 * cloning targets `mimo-v2.5-tts-voiceclone` and puts the reference clip into
 * `audio.voice` as a `data:audio/wav;base64,…` URI. Raw PCM responses are
 * wrapped as WAV so the browser can seek.
 * @module dsh-mimo-speak/tts
 */
import { readFile } from 'node:fs/promises';
import { clampText, toSpeakableText } from "./normalize.js";
import { isRiffWav, wrapPcmAsWav } from "./wav.js";
import { DEFAULT_BASE_URL, DEFAULT_CLONE_MODEL, DEFAULT_MAX_CHARS, DEFAULT_MODEL, DEFAULT_TIMEOUT_MS, DEFAULT_VOICE, } from "./settings.js";
/** A synthesis failure carrying a stable, UI-mappable code. */
export class TtsError extends Error {
    code;
    cause;
    upstreamStatus;
    upstreamParam;
    /**
     * @param code - stable failure code returned to the browser.
     * @param message - human-readable detail; never contains secrets.
     * @param cause - upstream failure, when one raised this error.
     * @param upstreamStatus - provider HTTP status, when one was returned.
     * @param upstreamParam - provider `param` hint, when one was returned.
     */
    constructor(code, message, cause, upstreamStatus, upstreamParam) {
        super(message);
        this.code = code;
        this.cause = cause;
        this.upstreamStatus = upstreamStatus;
        this.upstreamParam = upstreamParam;
        this.name = 'TtsError';
    }
}
const nodeDeps = {
    fetch: (...args) => globalThis.fetch(...args),
    readVoiceSample: async (path) => new Uint8Array(await readFile(path)),
};
/**
 * Resolve a settings section into the engine configuration a synthesis runs
 * with. Defaults live here rather than at the use site, so every caller sees
 * fully defaulted values (the schema defaults are for the settings form).
 * @param section - the resolved settings section (fields may be blank).
 * @returns the engine configuration for one synthesis.
 */
export function resolveEngineConfig(section) {
    return {
        apiKey: (section.apiKey ?? '').trim(),
        baseUrl: (section.baseUrl ?? '').trim() || DEFAULT_BASE_URL,
        model: (section.model ?? '').trim() || DEFAULT_MODEL,
        voice: (section.voice ?? '').trim() || DEFAULT_VOICE,
        voiceSamplePath: (section.voiceSamplePath ?? '').trim(),
        style: (section.style ?? '').trim(),
        maxChars: typeof section.maxChars === 'number' && section.maxChars > 0
            ? Math.floor(section.maxChars)
            : DEFAULT_MAX_CHARS,
        timeoutMs: typeof section.timeoutMs === 'number' && section.timeoutMs > 0
            ? Math.floor(section.timeoutMs)
            : DEFAULT_TIMEOUT_MS,
    };
}
/**
 * Synthesize one text into WAV audio.
 *
 * The text is normalized first (Markdown decoration is never spoken), then
 * clamped to the configured budget — a long reply speaks its opening rather
 * than being refused.
 * @param config - resolved engine configuration.
 * @param request - text and optional style/voice overrides.
 * @param deps - transport and filesystem seam; defaults to real `fetch`/`fs`.
 * @returns a complete WAV file.
 * @throws {TtsError} when the request is unusable or the provider fails.
 */
export async function synthesizeSpeech(config, request, deps = nodeDeps) {
    if (config.apiKey === '') {
        throw new TtsError('not-configured', 'No MiMo API key is configured; add the credential in the credentials store and reference it in Settings → 语音合成.');
    }
    const speakable = clampText(toSpeakableText(request.text ?? ''), config.maxChars);
    if (speakable === '') {
        throw new TtsError('bad-request', 'The message carries no speakable text.');
    }
    const style = (request.style ?? '').trim() || config.style;
    const content = style === '' ? speakable : `<style>${style}</style>${speakable}`;
    const voice = (request.voice ?? '').trim() || config.voice;
    let audio;
    let model = config.model;
    if (config.voiceSamplePath !== '') {
        let sample;
        try {
            sample = await deps.readVoiceSample(config.voiceSamplePath);
        }
        catch (cause) {
            throw new TtsError('voice-sample-unreadable', `The voice-clone sample at ${config.voiceSamplePath} could not be read.`, cause);
        }
        model = DEFAULT_CLONE_MODEL;
        if (!isRiffWav(sample)) {
            throw new TtsError('voice-sample-unreadable', `The voice-clone sample at ${config.voiceSamplePath} is not a WAV file.`);
        }
        audio = {
            format: 'wav',
            voice: `data:audio/wav;base64,${Buffer.from(sample).toString('base64')}`,
        };
    }
    else {
        audio = { format: 'wav', voice };
    }
    const payload = {
        model,
        audio,
        messages: [{ role: 'assistant', content }],
    };
    const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    let response;
    try {
        response = await deps.fetch(endpoint, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'api-key': config.apiKey,
                'user-agent': 'dsh-mimo-speak/0.1.0',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(config.timeoutMs),
        });
    }
    catch (cause) {
        const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
        throw new TtsError(timedOut ? 'timeout' : 'upstream-error', timedOut
            ? `MiMo TTS did not answer within ${config.timeoutMs} ms.`
            : `MiMo TTS could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`, cause);
    }
    if (!response.ok) {
        const raw = await response.text().catch(() => '');
        let param;
        let detail = raw.slice(0, 300);
        try {
            const parsed = JSON.parse(raw);
            if (typeof parsed?.param === 'string' && parsed.param !== '') {
                param = parsed.param;
                detail = `param: ${parsed.param}`;
            }
            else if (typeof parsed?.message === 'string') {
                detail = parsed.message.slice(0, 300);
            }
        }
        catch {
            // Not JSON; keep the raw excerpt.
        }
        throw new TtsError('upstream-error', `MiMo TTS returned HTTP ${response.status}${detail === '' ? '' : `: ${detail}`}`, undefined, response.status, param);
    }
    let body;
    try {
        body = await response.json();
    }
    catch (cause) {
        throw new TtsError('invalid-audio', 'MiMo TTS returned a response that is not JSON.', cause);
    }
    const data = decodeAudioData(body);
    if (isRiffWav(data))
        return data;
    return wrapPcmAsWav(data);
}
/**
 * Pull the base64 audio block out of the provider response.
 * @param body - parsed `chat.completion` response.
 * @returns decoded audio bytes (WAV or raw PCM).
 * @throws {TtsError} when the response carries an error or no audio block.
 */
function decodeAudioData(body) {
    const root = body;
    if (root === null || typeof root !== 'object') {
        throw new TtsError('invalid-audio', 'MiMo TTS returned an empty response.');
    }
    if (root.error !== undefined && root.error !== null) {
        const detail = typeof root.error === 'object' && 'message' in root.error
            ? String(root.error.message)
            : JSON.stringify(root.error);
        throw new TtsError('upstream-error', `MiMo TTS reported an error: ${detail.slice(0, 300)}`);
    }
    const encoded = root.choices?.[0]?.message?.audio?.data;
    if (typeof encoded !== 'string' || encoded === '') {
        throw new TtsError('invalid-audio', 'MiMo TTS returned no audio block in choices[0].message.audio.data.');
    }
    const data = new Uint8Array(Buffer.from(encoded, 'base64'));
    if (data.length === 0)
        throw new TtsError('invalid-audio', 'MiMo TTS returned an empty audio block.');
    return data;
}
/**
 * Stream one text as raw 24 kHz / 16-bit / mono PCM chunks.
 *
 * MiMo's `chat/completions` endpoint accepts `stream: true`; audio then
 * arrives incrementally in `choices[0].delta.audio.data` base64 chunks of a
 * single PCM stream (no headers), so the browser can start playing after the
 * first chunk instead of waiting for the whole utterance.
 *
 * Voice cloning is intentionally unsupported here: the streamed contract was
 * only validated for preset voices, so callers with a clone sample must use
 * the non-streaming path.
 * @param config - resolved engine configuration.
 * @param request - text and optional style/voice overrides.
 * @param deps - transport seam; defaults to real `fetch`.
 * @param onChunk - invoked once per decoded PCM chunk, in arrival order.
 * @returns streaming statistics once the stream completes.
 * @throws {TtsError} when the request is unusable or the provider fails.
 */
export async function streamSpeechPcm(config, request, deps = nodeDeps, onChunk) {
    if (config.apiKey === '') {
        throw new TtsError('not-configured', 'No MiMo API key is configured; add the credential in the credentials store and reference it in Settings → 语音合成.');
    }
    if (config.voiceSamplePath !== '') {
        throw new TtsError('bad-request', 'Streaming synthesis works with preset voices only; clear the voice-clone sample to enable it.');
    }
    const speakable = clampText(toSpeakableText(request.text ?? ''), config.maxChars);
    if (speakable === '') {
        throw new TtsError('bad-request', 'The message carries no speakable text.');
    }
    const style = (request.style ?? '').trim() || config.style;
    const content = style === '' ? speakable : `<style>${style}</style>${speakable}`;
    const voice = (request.voice ?? '').trim() || config.voice;
    const payload = {
        model: config.model,
        stream: true,
        audio: { format: 'pcm', voice },
        messages: [{ role: 'assistant', content }],
    };
    const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const startedAt = Date.now();
    let response;
    try {
        response = await deps.fetch(endpoint, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'api-key': config.apiKey,
                'user-agent': 'dsh-mimo-speak/0.1.0',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(config.timeoutMs),
        });
    }
    catch (cause) {
        const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
        throw new TtsError(timedOut ? 'timeout' : 'upstream-error', timedOut
            ? `MiMo TTS did not answer within ${config.timeoutMs} ms.`
            : `MiMo TTS could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`, cause);
    }
    if (!response.ok || response.body === null) {
        const raw = await response.text().catch(() => '');
        let param;
        let detail = raw.slice(0, 300);
        try {
            const parsed = JSON.parse(raw);
            if (typeof parsed?.param === 'string' && parsed.param !== '') {
                param = parsed.param;
                detail = `param: ${parsed.param}`;
            }
            else if (typeof parsed?.message === 'string') {
                detail = parsed.message.slice(0, 300);
            }
        }
        catch {
            // Not JSON; keep the raw excerpt.
        }
        throw new TtsError('upstream-error', `MiMo TTS returned HTTP ${response.status}${detail === '' ? '' : `: ${detail}`}`, undefined, response.status, param);
    }
    const decoder = new TextDecoder();
    let buffer = '';
    let firstChunkMs = null;
    let totalBytes = 0;
    let chunks = 0;
    const reader = response.body.getReader();
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            let newlineAt = buffer.indexOf('\n');
            while (newlineAt !== -1) {
                const line = buffer.slice(0, newlineAt).trim();
                buffer = buffer.slice(newlineAt + 1);
                newlineAt = buffer.indexOf('\n');
                if (!line.startsWith('data:'))
                    continue;
                const payloadText = line.slice(5).trim();
                if (payloadText === '' || payloadText === '[DONE]')
                    continue;
                let parsed;
                try {
                    parsed = JSON.parse(payloadText);
                }
                catch {
                    continue;
                }
                const delta = parsed.choices?.[0]?.delta;
                const encoded = delta?.audio?.data;
                if (typeof encoded !== 'string' || encoded === '')
                    continue;
                const pcm = new Uint8Array(Buffer.from(encoded, 'base64'));
                if (pcm.length === 0)
                    continue;
                if (firstChunkMs === null)
                    firstChunkMs = Date.now() - startedAt;
                totalBytes += pcm.length;
                chunks += 1;
                onChunk(pcm);
            }
        }
    }
    catch (cause) {
        if (cause instanceof TtsError)
            throw cause;
        throw new TtsError('upstream-error', `MiMo TTS stream broke before completion: ${cause instanceof Error ? cause.message : String(cause)}`, cause);
    }
    finally {
        reader.releaseLock();
    }
    if (firstChunkMs === null) {
        throw new TtsError('invalid-audio', 'MiMo TTS stream ended without any audio chunk.');
    }
    return { firstChunkMs, totalBytes, chunks };
}
//# sourceMappingURL=tts.js.map