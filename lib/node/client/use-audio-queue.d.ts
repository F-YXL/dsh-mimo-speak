/**
 * The pipelined playback engine behind the speak entry: one hidden
 * `HTMLAudioElement` fed from a queue of chunk object URLs, so the next chunk
 * is already waiting when the current one ends and playback runs back-to-back.
 *
 * Starting this player pauses every other player this plugin owns through the
 * shared audio bus, so a stream and a queued reply never overlap.
 * @module dsh-mimo-speak/client/use-audio-queue
 */
/** What the player bar renders. */
export interface AudioPlayerState {
    /** Whether audio is currently advancing. */
    playing: boolean;
    /** Current position in seconds. */
    currentTime: number;
    /** Total duration in seconds; zero until metadata loads. */
    duration: number;
    /** Whether playback ran to the end of the queue (replay available). */
    ended: boolean;
}
/** What the hook gives its component. */
export interface AudioQueuePlayer {
    /** Live playback state; every member is plain renderable data. */
    state: AudioPlayerState;
    /** Append one chunk URL; starts playback when the element is idle. */
    enqueue: (url: string) => void;
    /** Drop queued chunks and detach the current source. */
    clear: () => void;
    /** Start or pause playback. */
    toggle: () => void;
    /** Move the playhead. */
    seek: (seconds: number) => void;
    /** Pause playback without toggling. */
    pause: () => void;
}
/**
 * Bind one hidden audio element to a queue of chunk URLs.
 * @returns playback state plus enqueue/clear/toggle/seek/pause controls.
 */
export declare function useAudioQueue(): AudioQueuePlayer;
