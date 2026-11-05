/**
 * Settings and route vocabulary shared by the Host and browser halves.
 *
 * Both bundles inline this file, so it must stay pure: constants and types
 * only, no Node or DOM APIs. The namespace is the profile entry id the bundle
 * patch inserts (`cordis.patch.yml`), and the route paths are the seam the two
 * halves meet on.
 * @module dsh-mimo-speak/settings
 */
/** Settings namespace: the profile entry id of this plugin's loader row. */
export const MIMOSPEAK_NAMESPACE = 'mimo-speak';
/**
 * Key this plugin's configuration card registers under on the Plugins page's
 * `plugins.bundle.config` keyed slot: the bundle's npm package name, which is
 * the keying convention the Plugins page fixes for bundle-owned configuration
 * (the page dispatches with `entryKey: pkg.name`).
 */
export const MIMOSPEAK_PACKAGE_KEY = 'dsh-mimo-speak';
/** Route prefix owned by this plugin on `ctx.webServer`. */
export const MIMOSPEAK_API_PREFIX = '/api/mimo-speak';
/** `GET` route reporting the resolved engine configuration without secrets. */
export const MIMOSPEAK_STATUS_PATH = `${MIMOSPEAK_API_PREFIX}/status`;
/** `POST` route synthesizing one text into WAV audio. */
export const MIMOSPEAK_SYNTHESIZE_PATH = `${MIMOSPEAK_API_PREFIX}/synthesize`;
/** `POST` route streaming one text as raw PCM chunks (SSE). */
export const MIMOSPEAK_SYNTHESIZE_STREAM_PATH = `${MIMOSPEAK_API_PREFIX}/synthesize-stream`;
/** `POST` route running a short round-trip health check against the engine. */
export const MIMOSPEAK_TEST_PATH = `${MIMOSPEAK_API_PREFIX}/test`;
/** POST text → a short spoken summary (used by the brief read scope). */
export const MIMOSPEAK_SUMMARY_PATH = `${MIMOSPEAK_API_PREFIX}/summary`;
/** MiMo platform endpoint base; `/chat/completions` is appended. */
export const DEFAULT_BASE_URL = 'https://api.xiaomimimo.com/v1';
/** MiMo TTS model id. */
export const DEFAULT_MODEL = 'mimo-v2.5-tts';
/** Preset voice used when no clone sample is configured. */
export const DEFAULT_VOICE = 'mimo_default';
/**
 * Credential reference naming the MiMo API key inside the host credentials
 * store; the literal key itself never lands in a configuration file.
 */
export const DEFAULT_CREDENTIAL_REF = 'MIMO_API_KEY';
/** Longest text one synthesis accepts, in characters. */
export const DEFAULT_MAX_CHARS = 2000;
/** Longest single playback chunk, in characters (pipeline building block). */
export const DEFAULT_CHUNK_CHARS = 120;
/** Upper bound on one upstream round-trip, in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 60_000;
/** PCM stream constants: MiMo streams 24 kHz / 16-bit / mono PCM. */
export const PCM_SAMPLE_RATE = 24_000;
export const PCM_CHANNELS = 1;
export const PCM_BYTES_PER_SAMPLE = 2;
export const DEFAULT_FALLBACK_ENGINE = 'none';
/** Default Edge-TTS voice (the user's preferred Xiaoxiao). */
export const DEFAULT_EDGE_VOICE = 'zh-CN-XiaoxiaoNeural';
export const DEFAULT_READ_SCOPE = 'smart';
/** Sentence highlighting defaults to on; users can turn it off. */
export const DEFAULT_HIGHLIGHT = true;
/**
 * The progress bar is off by default: the play/pause control is what the user
 * reaches for, and the seekable track costs most of the panel's width for
 * little gain on short replies.
 */
export const DEFAULT_PROGRESS_BAR = false;
/** Stop reading as soon as something opens the microphone (avoids self-echo). */
export const DEFAULT_MUTE_WHILE_RECORDING = true;
/** Sample sentence the settings page's audition button speaks. */
export const AUDITION_TEXT = '你好，这是 MiMo 语音合成的试听效果。';
/** Route prefix for persisted speech history (list / create / file). */
export const MIMOSPEAK_RECORDINGS_PATH = `${MIMOSPEAK_API_PREFIX}/recordings`;
/**
 * Response header carrying the new recording identity. Its value is the
 * base64 encoding of `JSON.stringify({ recId, verId })` so it survives the
 * `audio/wav` body that the synthesize route streams back.
 */
export const MIMOSPEAK_RECORDING_HEADER = 'x-mimo-speak-recording';
//# sourceMappingURL=settings.js.map