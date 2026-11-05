/**
 * The speech-history browser: every recorded text, each with its versions.
 * Versions play in place, re-synthesize against the current engine settings
 * (appending a fresh take, old ones kept), or get deleted. There is no
 * dedicated comparison view — per the design, each take is played on its own.
 * @module dsh-mimo-speak/client/RecordingsList
 */
import type { MimottsLocaleKey } from './locales.ts';
/** Props: the localized copy function bound to this plugin's dictionary. */
export interface RecordingsListProps {
    t: (key: MimottsLocaleKey) => string;
}
/**
 * Render the persisted speech history with per-version playback, re-synthesis,
 * and deletion.
 * @param props - localized copy.
 * @returns the history list, or an empty-state note before the first load.
 */
export declare function RecordingsList({ t }: RecordingsListProps): import("react").JSX.Element;
