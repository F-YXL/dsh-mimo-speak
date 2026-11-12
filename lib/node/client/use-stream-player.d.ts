/**
 * Progressive PCM playback behind the speak entry's streaming path.
 *
 * The Host streams one utterance as raw 24 kHz / 16-bit / mono PCM chunks; each
 * chunk is converted to an `AudioBuffer` and scheduled back-to-back on one
 * `AudioContext`, so the first chunk is audible within a second while later
 * chunks keep arriving. Seek is not supported (the stream is transient), so
 * this player exposes the same `AudioPlayerState` surface minus seeking.
 *
 * All scheduling and the dispose guard live in `stream-dispose.ts`; this hook
 * only binds that sink to React state, the shared audio bus and the browser's
 * timers, so the sink runs (and is tested) without React or a DOM.
 * @module dsh-mimo-speak/client/use-stream-player
 */
import type { AudioPlayerState } from './use-audio-queue.ts';
/** What the hook gives its component. */
export interface StreamPlayer {
    /** Live playback state; every member is plain renderable data. */
    state: AudioPlayerState;
    /** Append one decoded PCM chunk; the first chunk starts playback. */
    feed: (pcm: Uint8Array) => void;
    /** Mark the stream complete so the player can report `ended`. */
    finish: () => void;
    /** Stop playback and drop every scheduled chunk. */
    clear: () => void;
    /** Start or pause playback. */
    toggle: () => void;
    /** Pause playback without toggling. */
    pause: () => void;
    /**
     * Audio seconds already scheduled (the timeline position of the next chunk).
     * A caller that appends one utterance at a time reads this before its first
     * chunk to learn when that utterance will actually be heard.
     */
    scheduled: () => number;
}
/**
 * Bind one `AudioContext` to a stream of PCM chunks.
 * @returns playback state plus feed/finish/clear/toggle/pause controls.
 */
export declare function useStreamPlayer(): StreamPlayer;
