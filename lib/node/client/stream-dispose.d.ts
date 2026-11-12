/**
 * Framework-free scheduling core of the progressive PCM stream player.
 *
 * `use-stream-player` keeps its playback bookkeeping in React refs so the
 * scheduled-chunk timeline survives renders. Those refs also survive unmount,
 * and an in-flight SSE callback can call `feed()` after the component is gone;
 * without a guard that call rebuilds the AudioContext and resumes scheduling.
 *
 * The mutable scheduling lives here as two seams:
 * - `StreamTimeline` owns the disposed flag and the timing fields.
 * - `createStreamSink` owns the whole playback state machine behind an injected
 *   `AudioContext` factory, so `feed` can be driven from Node tests with a fake
 *   context and assert that a disposed sink never creates one.
 * @module dsh-mimo-speak/client/stream-dispose
 */
/** The player fields an in-flight callback could still reach after dispose. */
export interface StreamTimeline {
    /** True after dispose until the next setup; every mutating control no-ops. */
    disposed: boolean;
    /** Whether audio is currently advancing. */
    playing: boolean;
    /** Whether the stream was marked complete. */
    finished: boolean;
    /** Context time the next chunk starts at. */
    nextAt: number;
    /** Total scheduled audio, in seconds. */
    totalDuration: number;
}
/** A fresh, live timeline. */
export declare function createStreamTimeline(): StreamTimeline;
/**
 * Whether one more chunk may be scheduled. This is the single decision point
 * `feed` consults before it touches the context factory, so a disposed player
 * can never rebuild its `AudioContext`.
 * @param timeline - the player's live bookkeeping.
 */
export declare function streamShouldFeed(timeline: StreamTimeline): boolean;
/**
 * The context time the next chunk should start at: never earlier than the
 * timeline's back-to-back position, and never before the context clock.
 * @param timeline - the player's live bookkeeping.
 * @param ctxNow - the current `AudioContext.currentTime`.
 */
export declare function feedStartAt(timeline: StreamTimeline, ctxNow: number): number;
/** Record that one chunk of `duration` seconds started at `when`. */
export declare function recordScheduledChunk(timeline: StreamTimeline, when: number, duration: number): void;
/** Disable the player and reset every field a late callback could misuse. */
export declare function disposeStreamTimeline(timeline: StreamTimeline): void;
/** Re-enable after a remount (StrictMode setup or in-place re-entry). */
export declare function resetStreamTimeline(timeline: StreamTimeline): void;
/** Live playback state the sink publishes. */
export interface StreamState {
    /** Whether audio is currently advancing. */
    playing: boolean;
    /** Current position in seconds. */
    currentTime: number;
    /** Total scheduled audio, in seconds. */
    duration: number;
    /** Whether playback ran to the end. */
    ended: boolean;
}
/** The slice of `AudioContext` the sink schedules on. */
export interface StreamAudioContext {
    readonly currentTime: number;
    readonly state: string;
    readonly destination: unknown;
    createBuffer(channels: number, length: number, sampleRate: number): StreamAudioBuffer;
    createBufferSource(): StreamBufferSource;
    resume(): Promise<void>;
    suspend(): Promise<void>;
    close(): Promise<void>;
}
/** A decoded chunk handed to the context. */
export interface StreamAudioBuffer {
    readonly duration: number;
    copyToChannel(source: Float32Array, channelNumber: number): void;
}
/** A scheduled buffer source. */
export interface StreamBufferSource {
    buffer: unknown;
    connect(destination: unknown): void;
    start(when?: number): void;
    stop(): void;
    onended: (() => void) | null;
}
/** External effects the sink reaches for, injected so tests stay browser-free. */
export interface StreamSinkDeps {
    /** Create the context on first use; the hook passes `new AudioContext(...)`. */
    createContext: () => StreamAudioContext;
    /** Publish a partial state update (the hook mirrors this into React state). */
    onState: (patch: Partial<StreamState>) => void;
    /** Start the progress tick. */
    setInterval: (handler: () => void, ms: number) => unknown;
    /** Stop the progress tick. */
    clearInterval: (handle: unknown) => void;
    /** Pause every other plugin player before this one starts. */
    onStart: () => void;
}
/** What the sink gives its hook. */
export interface StreamSink {
    feed: (pcm: Uint8Array) => void;
    finish: () => void;
    clear: () => void;
    toggle: () => void;
    pause: () => void;
    scheduled: () => number;
    /** Permanently stop this sink; every mutating control becomes a no-op. */
    dispose: () => void;
    /** Revive after an in-place remount (React StrictMode double-invoke). */
    revive: () => void;
}
/**
 * Bind one context to a stream of PCM chunks.
 * @param deps - injected context factory, state publisher, timers and bus hook.
 * @returns scheduling controls plus dispose/revive.
 */
export declare function createStreamSink(deps: StreamSinkDeps): StreamSink;
/** MiMo streams 24 kHz mono PCM; the context renders at the native rate. */
export declare const PCM_SAMPLE_RATE = 24000;
