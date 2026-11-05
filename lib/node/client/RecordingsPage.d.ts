/**
 * The `语音历史` settings page: every read-aloud recording, each with its
 * versions for in-place playback, re-synthesis, and deletion. Configuration
 * lives on the Plugins page's bundle card (`plugins.bundle.config`); this
 * page owns the feature surface instead.
 * @module dsh-mimo-speak/client/RecordingsPage
 */
import type { RecordingsPageProps } from './slots.ts';
/**
 * Render the speech-history settings page.
 * @param props - localized copy.
 * @returns the recordings list with its heading and hint.
 */
export declare function RecordingsPage({ t }: RecordingsPageProps): import("react").JSX.Element;
