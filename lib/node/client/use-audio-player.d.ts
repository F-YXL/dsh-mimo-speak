/**
 * The playback engine behind every player this plugin renders: one hidden
 * `HTMLAudioElement` per mounted player, mirrored into React state, with a
 * module-local registry so starting one player pauses the other.
 *
 * The registry is deliberately module-local mutable UI state: it coordinates
 * components of this one plugin bundle and lives in the browser only. Business
 * and transport state stay in the settings namespace and the Host routes.
 * @module dsh-mimo-speak/client/use-audio-player
 */
/** What the player bar renders. */
export interface AudioPlayerState {
    /** Whether audio is currently advancing. */
    playing: boolean;
    /** Current position in seconds. */
    currentTime: number;
    /** Total duration in seconds; zero until metadata loads. */
    duration: number;
    /** Whether playback ran to the end (the bar offers a replay from zero). */
    ended: boolean;
}
/** What the hook gives its component. */
export interface AudioPlayer {
    /** Live playback state; every member is plain renderable data. */
    state: AudioPlayerState;
    /** Start or pause playback. */
    toggle: () => void;
    /**
     * Move the playhead.
     * @param seconds - absolute position in seconds, clamped to the loaded range.
     */
    seek: (seconds: number) => void;
    /** Pause playback without toggling (used when dismissing the panel). */
    pause: () => void;
}
/**
 * Bind one audio source to playback state and controls.
 *
 * A new `source` replaces the element: the old one pauses and detaches, and
 * playback state returns to zero. Passing null keeps the hook idle.
 * @param source - object URL of the WAV to play, or null.
 * @returns playback state plus the toggle and seek controls.
 */
export declare function useAudioPlayer(source: string | null): AudioPlayer;
