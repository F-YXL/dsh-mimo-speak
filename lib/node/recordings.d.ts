/**
 * Host-side persistence for synthesized speech.
 *
 * Every spoken text becomes one recording node; each synthesis — first pass
 * or a later re-synthesis — appends a version with its own WAV file on disk.
 * A single `index.json` records the tree so the browser can list history
 * without scanning directories. The store lives under the active profile's
 * data root (`~/.dsh/profiles/<profile>/mimo-speak-recordings`; the legacy global
 * `~/.dsh` when no profile is active), outside the plugin and any repository,
 * so no recording leaks into version control.
 *
 * Re-synthesis never overwrites: it adds a new version, leaving earlier
 * takes intact so the user can compare voices side by side.
 * @module dsh-mimo-speak/recordings
 */
import type { TtsRecording, TtsRecordingsIndex, TtsRecordingVersion } from './settings.ts';
/** Absolute path of one version's WAV file. */
export declare function versionFilePath(recId: string, verId: string): string;
/** The result of appending a version to a recording node. */
export interface AddedVersion {
    /** The (possibly newly created) recording node. */
    recording: TtsRecording;
    /** The version just written. */
    version: TtsRecordingVersion;
}
/**
 * Append a synthesized version to a text's recording history.
 *
 * Texts are de-duplicated: speaking the same text twice groups both takes
 * under one node. The new version is prepended so the list reads newest-first.
 * @param text - the spoken text (grouping key).
 * @param style - style phrase used, or undefined for neutral.
 * @param voice - preset voice used, or undefined for default.
 * @param model - model id used.
 * @param wav - the WAV bytes to persist.
 * @returns the recording node and the new version.
 */
export declare function addVersion(text: string, style: string | undefined, voice: string | undefined, model: string, wav: Uint8Array): Promise<AddedVersion>;
/** Return the current index (empty when none yet). */
export declare function listRecordings(): Promise<TtsRecordingsIndex>;
/**
 * Re-synthesize an existing recording's text with the engine's current
 * settings and append the result as a new version. Earlier versions stay
 * intact so the user can compare takes.
 * @param recId - the recording node id.
 * @param style - style phrase used, or undefined for neutral.
 * @param voice - preset voice used, or undefined for default.
 * @param model - model id used.
 * @param wav - the freshly synthesized WAV bytes.
 * @returns the recording and new version, or undefined when `recId` is unknown.
 */
export declare function resynthesize(recId: string, style: string | undefined, voice: string | undefined, model: string, wav: Uint8Array): Promise<AddedVersion | undefined>;
/**
 * Delete one version's file and index entry. When a recording loses its last
 * version it is removed entirely.
 * @returns true when the version existed and was removed.
 */
export declare function deleteVersion(recId: string, verId: string): Promise<boolean>;
/** Whether a recording/version pair exists (used to authorize file serving). */
export declare function hasVersion(recId: string, verId: string): Promise<boolean>;
