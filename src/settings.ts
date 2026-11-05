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
export const MIMOSPEAK_NAMESPACE = 'mimo-speak'

/**
 * Key this plugin's configuration card registers under on the Plugins page's
 * `plugins.bundle.config` keyed slot: the bundle's npm package name, which is
 * the keying convention the Plugins page fixes for bundle-owned configuration
 * (the page dispatches with `entryKey: pkg.name`).
 */
export const MIMOSPEAK_PACKAGE_KEY = 'dsh-mimo-speak'

/** Route prefix owned by this plugin on `ctx.webServer`. */
export const MIMOSPEAK_API_PREFIX = '/api/mimo-speak'

/** `GET` route reporting the resolved engine configuration without secrets. */
export const MIMOSPEAK_STATUS_PATH = `${MIMOSPEAK_API_PREFIX}/status`

/** `POST` route synthesizing one text into WAV audio. */
export const MIMOSPEAK_SYNTHESIZE_PATH = `${MIMOSPEAK_API_PREFIX}/synthesize`

/** `POST` route streaming one text as raw PCM chunks (SSE). */
export const MIMOSPEAK_SYNTHESIZE_STREAM_PATH = `${MIMOSPEAK_API_PREFIX}/synthesize-stream`

/** `POST` route running a short round-trip health check against the engine. */
export const MIMOSPEAK_TEST_PATH = `${MIMOSPEAK_API_PREFIX}/test`
/** POST text → a short spoken summary (used by the brief read scope). */
export const MIMOSPEAK_SUMMARY_PATH = `${MIMOSPEAK_API_PREFIX}/summary`

/** MiMo platform endpoint base; `/chat/completions` is appended. */
export const DEFAULT_BASE_URL = 'https://api.xiaomimimo.com/v1'

/** MiMo TTS model id. */
export const DEFAULT_MODEL = 'mimo-v2.5-tts'

/** Preset voice used when no clone sample is configured. */
export const DEFAULT_VOICE = 'mimo_default'

/**
 * Credential reference naming the MiMo API key inside the host credentials
 * store; the literal key itself never lands in a configuration file.
 */
export const DEFAULT_CREDENTIAL_REF = 'MIMO_API_KEY'

/** Longest text one synthesis accepts, in characters. */
export const DEFAULT_MAX_CHARS = 2000

/** Longest single playback chunk, in characters (pipeline building block). */
export const DEFAULT_CHUNK_CHARS = 120

/** Upper bound on one upstream round-trip, in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 60_000

/** PCM stream constants: MiMo streams 24 kHz / 16-bit / mono PCM. */
export const PCM_SAMPLE_RATE = 24_000
export const PCM_CHANNELS = 1
export const PCM_BYTES_PER_SAMPLE = 2

/** Fallback engine selection: no fallback, or Microsoft Edge TTS. */
export type FallbackEngine = 'none' | 'edge'
export const DEFAULT_FALLBACK_ENGINE: FallbackEngine = 'none'

/** Default Edge-TTS voice (the user's preferred Xiaoxiao). */
export const DEFAULT_EDGE_VOICE = 'zh-CN-XiaoxiaoNeural'

/** Read-scope modes: only prose, everything, or prose plus short code. */
export type ReadScope = 'text' | 'all' | 'smart' | 'brief'
export const DEFAULT_READ_SCOPE: ReadScope = 'smart'

/** Sentence highlighting defaults to on; users can turn it off. */
export const DEFAULT_HIGHLIGHT = true

/**
 * The progress bar is off by default: the play/pause control is what the user
 * reaches for, and the seekable track costs most of the panel's width for
 * little gain on short replies.
 */
export const DEFAULT_PROGRESS_BAR = false
/** Stop reading as soon as something opens the microphone (avoids self-echo). */
export const DEFAULT_MUTE_WHILE_RECORDING = true

/**
 * The resolved settings section, as the settings form projects it. The API
 * key is referenced, never stored: `apiKeyEnv` names a credential in the
 * host credentials store, and its presence is reported only through
 * {@link TtsStatusView}.
 */
export interface TtsSettings {
  /** Credential reference naming the MiMo API key in the credentials store. */
  apiKeyEnv?: string | undefined
  /** Endpoint base; blank inherits {@link DEFAULT_BASE_URL}. */
  baseUrl?: string | undefined
  /** Model id; blank inherits {@link DEFAULT_MODEL}. */
  model?: string | undefined
  /** Preset voice name; blank inherits {@link DEFAULT_VOICE}. */
  voice?: string | undefined
  /** Host-local WAV used as the voice-clone reference; blank uses the preset voice. */
  voiceSamplePath?: string | undefined
  /** Default speaking-style phrase prepended as `<style>…</style>`. */
  style?: string | undefined
  /** Longest accepted text, in characters. */
  maxChars?: number | undefined
  /** Longest single playback chunk, in characters. */
  chunkChars?: number | undefined
  /** Upper bound on one upstream round-trip, in milliseconds. */
  timeoutMs?: number | undefined
  /** Read each newly finalized assistant reply aloud automatically. */
  autoRead?: boolean | undefined
  /** Fallback engine used when MiMo synthesis fails. */
  fallbackEngine?: FallbackEngine | undefined
  /** Edge-TTS voice used by the fallback engine. */
  edgeVoice?: string | undefined
  /** Which parts of a reply are read aloud. */
  readScope?: ReadScope | undefined
  /** Highlight the sentence being read inside the message. */
  highlight?: boolean | undefined
  /** Show the seekable progress bar in the floating player. */
  progressBar?: boolean | undefined
  muteWhileRecording?: boolean | undefined
}

/** What `GET /api/mimo-speak/status` reports; safe to show in the UI verbatim. */
export interface TtsStatusView {
  /** Whether the Host resolves a non-empty API key. */
  configured: boolean
  /** Effective model id. */
  model: string
  /** Effective preset voice. */
  voice: string
  /** Whether the configured voice-clone sample is present on the Host. */
  hasVoiceSample: boolean
  /** Effective endpoint base. */
  baseUrl: string
  /** Whether newly finalized assistant replies are read aloud automatically. */
  autoRead: boolean
  /** Total character budget the Host accepts per reply. */
  maxChars: number
  /** Longest single playback chunk, in characters. */
  chunkChars: number
  /** Fallback engine selection. */
  fallbackEngine: FallbackEngine
  /** Edge-TTS voice used by the fallback engine. */
  edgeVoice: string
  /** Which parts of a reply are read aloud. */
  readScope: ReadScope
  /** Whether the sentence being read is highlighted in the message. */
  highlight: boolean
  /** Whether the floating player shows a progress bar. */
  progressBar: boolean
  muteWhileRecording: boolean
}

/** Failure codes the synthesize route returns; the browser maps them to copy. */
export type TtsErrorCode =
  | 'bad-request'
  | 'not-configured'
  | 'text-too-long'
  | 'voice-sample-unreadable'
  | 'timeout'
  | 'upstream-error'
  | 'invalid-audio'

/** JSON error body returned by this plugin's routes. */
export interface TtsErrorBody {
  error: {
    code: TtsErrorCode
    /** Provider- or host-supplied detail; safe to show, never contains secrets. */
    message: string
    /** Upstream HTTP status, when the provider returned one. */
    upstreamStatus?: number | undefined
    /** Upstream `param` field (MiMo's only actionable error hint). */
    param?: string | undefined
  }
}

/** JSON body returned by the test route on success. */
export interface TtsTestResult {
  ok: true
  /** Which engine answered: `mimo` or `edge`. */
  engine: 'mimo' | 'edge'
  /** Milliseconds from request start to the first audio byte. */
  latencyMs: number
  /** Bytes of audio produced (decoded, after base64). */
  audioBytes: number
  voice: string
  model?: string | undefined
}

/** JSON body returned by `POST /api/mimo-speak/summary`. */
export interface TtsSummaryResult {
  /** One or two sentences, ready to speak. */
  summary: string
}

/** JSON body accepted by `POST /api/mimo-speak/synthesize`. */
export interface TtsSynthesizeRequest {
  /** Text to speak. Markdown is normalized Host-side before synthesis. */
  text: string
  /** Style override (e.g. `开心`, `语速慢`); blank inherits the configured default. */
  style?: string | undefined
  /** Preset-voice override; blank inherits the configured default. */
  voice?: string | undefined
}

/** Sample sentence the settings page's audition button speaks. */
export const AUDITION_TEXT = '你好，这是 MiMo 语音合成的试听效果。'

/** Route prefix for persisted speech history (list / create / file). */
export const MIMOSPEAK_RECORDINGS_PATH = `${MIMOSPEAK_API_PREFIX}/recordings`

/**
 * Response header carrying the new recording identity. Its value is the
 * base64 encoding of `JSON.stringify({ recId, verId })` so it survives the
 * `audio/wav` body that the synthesize route streams back.
 */
export const MIMOSPEAK_RECORDING_HEADER = 'x-mimo-speak-recording'

/** One synthesized version of a recorded text. */
export interface TtsRecordingVersion {
  /** Stable version id (uuid). */
  id: string
  /** ISO timestamp of when this version was synthesized. */
  createdAt: string
  /** Style phrase used for this version, or null when neutral. */
  style: string | null
  /** Preset voice used for this version, or null when default. */
  voice: string | null
  /** Model id used for this version. */
  model: string
}

/** One recorded text and all its synthesized versions. */
export interface TtsRecording {
  /** Stable recording-node id (uuid). */
  id: string
  /** The spoken text; also the grouping key for versions. */
  text: string
  /** ISO timestamp of the first version. */
  createdAt: string
  /** Newest version first. */
  versions: TtsRecordingVersion[]
}

/** The recordings index returned to the browser. */
export interface TtsRecordingsIndex {
  /** Recorded texts, newest first. */
  entries: TtsRecording[]
}
