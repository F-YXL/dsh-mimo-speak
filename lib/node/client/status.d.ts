/**
 * The engine-status mirror shared by the speak entries and the Plugins-page
 * card.
 *
 * One `GET /api/mimo-speak/status` answers every mounted control: entries lazy-
 * load it on first hover/focus, the Plugins-page card refreshes it after each
 * write that could change whether a key exists. Failures publish the
 * "unconfigured" view rather than an error state — a missing answer must not
 * claim a key exists.
 * @module dsh-mimo-speak/client/status
 */
import { type SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { TtsStatusView } from '../settings.ts';
/**
 * @returns the shared status mirror every control derives from.
 */
export declare function ttsStatusStore(): SnapshotStore<TtsStatusView>;
/**
 * Ensure one status read is under way; concurrent callers share it.
 * @returns the read in flight, which never rejects.
 */
export declare function ensureTtsStatus(): Promise<void>;
/**
 * Re-read the status even when one is already under way; called after writes
 * that could add or remove the API key.
 * @returns the fresh read, which never rejects.
 */
export declare function refreshTtsStatus(): Promise<void>;
