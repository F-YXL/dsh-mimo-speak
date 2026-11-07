/**
 * MiMo TTS speech synthesis, Host half.
 *
 * The Host answers the browser's synthesis questions (`/api/mimo-speak/status`,
 * `/synthesize`, `/synthesize-stream`, `/test`, `/summary`) and registers the
 * `mimo-tts-say` agent tool that writes WAV files into the session
 * workspace. The API key never leaves the Host — the browser sends text and
 * receives WAV bytes.
 *
 * Settings are ordinary volatile Config fields, so the settings service
 * projects them into the configuration form the browser half renders on its
 * own Plugins-page card (`plugins.bundle.config`); the automatic card is
 * turned off because this plugin contributes that card itself.
 * @module dsh-mimo-speak
 */
import type { Context, Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { FallbackEngine, ReadScope } from './settings.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "mimo-speak";
/** Runtime settings projected into the configuration form. */
export interface Config {
    /** Credential reference naming the MiMo API key in the credentials store. */
    apiKeyEnv: Volatile<string | undefined>;
    /** Endpoint base; `/chat/completions` is appended. */
    baseUrl: Volatile<string | undefined>;
    /** MiMo TTS model id. */
    model: Volatile<string | undefined>;
    /** Preset voice name used when no clone sample is configured. */
    voice: Volatile<string | undefined>;
    /** Host-local WAV (24 kHz / 16-bit / mono, 5–15 s) used as the voice-clone reference. */
    voiceSamplePath: Volatile<string | undefined>;
    /** Default speaking-style phrase (e.g. `开心`, `语速慢`, `东北话`). */
    style: Volatile<string | undefined>;
    /** Longest text one synthesis accepts, in characters. */
    maxChars: Volatile<number>;
    /** Longest single playback chunk, in characters. */
    chunkChars: Volatile<number>;
    /** Upper bound on one upstream round-trip, in milliseconds. */
    timeoutMs: Volatile<number>;
    /** Read each newly finalized assistant reply aloud automatically. */
    autoRead: Volatile<boolean>;
    /** Fallback engine used when MiMo synthesis fails. */
    fallbackEngine: Volatile<FallbackEngine>;
    /** Edge-TTS voice used by the fallback engine. */
    edgeVoice: Volatile<string | undefined>;
    /** Which parts of a reply are read aloud. */
    readScope: Volatile<ReadScope>;
    /** Highlight the sentence being read inside the message. */
    highlight: Volatile<boolean>;
    /** Show the seekable progress bar in the floating player. */
    progressBar: Volatile<boolean>;
    muteWhileRecording: Volatile<boolean>;
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    apiKeyEnv: z<string, string, "volatile-defined">;
    baseUrl: z<string, string, "volatile-defined">;
    model: z<string, string, "volatile-defined">;
    voice: z<string, string, "volatile-defined">;
    voiceSamplePath: z<string, string, "volatile">;
    style: z<string, string, "volatile">;
    maxChars: z<number, number, "volatile-defined">;
    chunkChars: z<number, number, "volatile-defined">;
    timeoutMs: z<number, number, "volatile-defined">;
    autoRead: z<boolean, boolean, "volatile-defined">;
    fallbackEngine: z<"none" | "edge", "none" | "edge", "volatile-defined">;
    edgeVoice: z<string, string, "volatile-defined">;
    readScope: z<"text" | "all" | "smart" | "brief", "text" | "all" | "smart" | "brief", "volatile-defined">;
    highlight: z<boolean, boolean, "volatile-defined">;
    progressBar: z<boolean, boolean, "volatile-defined">;
    muteWhileRecording: z<boolean, boolean, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    apiKeyEnv: z<string, string, "volatile-defined">;
    baseUrl: z<string, string, "volatile-defined">;
    model: z<string, string, "volatile-defined">;
    voice: z<string, string, "volatile-defined">;
    voiceSamplePath: z<string, string, "volatile">;
    style: z<string, string, "volatile">;
    maxChars: z<number, number, "volatile-defined">;
    chunkChars: z<number, number, "volatile-defined">;
    timeoutMs: z<number, number, "volatile-defined">;
    autoRead: z<boolean, boolean, "volatile-defined">;
    fallbackEngine: z<"none" | "edge", "none" | "edge", "volatile-defined">;
    edgeVoice: z<string, string, "volatile-defined">;
    readScope: z<"text" | "all" | "smart" | "brief", "text" | "all" | "smart" | "brief", "volatile-defined">;
    highlight: z<boolean, boolean, "volatile-defined">;
    progressBar: z<boolean, boolean, "volatile-defined">;
    muteWhileRecording: z<boolean, boolean, "volatile-defined">;
}>>, "plain">;
/**
 * Host registration: the settings presentation policy, the agent tool, and
 * the Web routes.
 * @param ctx - plugin context; the routes appear when `webServer` and
 * `connection` exist (Web and Desktop GUI compositions).
 * @param config - live volatile settings.
 */
export declare function apply(ctx: Context, config: Config): void;
