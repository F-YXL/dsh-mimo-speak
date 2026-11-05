/**
 * The compact player bar: play/pause, a draggable progress track, and the
 * position/duration readout.
 *
 * The track is a `role="slider"` surface — pointer drag with capture,
 * click-to-seek, and arrow-key seeking — so the progress bar is operable
 * without a pointer. Dragging seeks continuously: WAV playback from an object
 * URL repositions cheaply, and the thumb follows the pointer instead of
 * lagging behind it.
 * @module dsh-mimo-speak/client/PlayerBar
 */
import type { AudioPlayerState } from './use-audio-player.ts';
/** Copy the bar renders, already localized by its caller. */
export interface PlayerBarLabels {
    /** Accessible name of the play control while paused. */
    play: string;
    /** Accessible name of the pause control while playing. */
    pause: string;
    /** Accessible name of the progress slider. */
    progress: string;
}
/** What the bar needs from its player. */
export interface PlayerBarProps {
    /** Live playback state. */
    state: AudioPlayerState;
    /** Start or pause playback. */
    onToggle: () => void;
    /** @param seconds - absolute position to seek to. */
    onSeek: (seconds: number) => void;
    /** Localized control names. */
    labels: PlayerBarLabels;
    /** Whether the track accepts seek gestures; streaming audio cannot seek. */
    seekable?: boolean;
    /**
     * Render only the play/pause control, with no track and no clock. Callers
     * that hide the progress bar still need a transport control.
     */
    compact?: boolean;
}
/**
 * Render one player bar.
 * @param props - playback state, controls, and localized names.
 * @returns the play control, the seekable track, and the time readout.
 */
export declare function PlayerBar({ state, onToggle, onSeek, labels, seekable, compact }: PlayerBarProps): import("react").JSX.Element;
