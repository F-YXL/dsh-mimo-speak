import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The `语音历史` settings page: every read-aloud recording, each with its
 * versions for in-place playback, re-synthesis, and deletion. Configuration
 * lives on the Plugins page's bundle card (`plugins.bundle.config`); this
 * page owns the feature surface instead.
 * @module dsh-mimo-speak/client/RecordingsPage
 */
import { RecordingsList } from "./RecordingsList.js";
/**
 * Render the speech-history settings page.
 * @param props - localized copy.
 * @returns the recordings list with its heading and hint.
 */
export function RecordingsPage({ t }) {
    return (_jsxs("div", { className: "mimo-speak-recordingsPage", children: [_jsx("h3", { className: "mimo-speak-recordingsTitle", children: t('recordings') }), _jsx("p", { className: "mimo-speak-recordingsHintText", children: t('recordingsHint') }), _jsx(RecordingsList, { t: t })] }));
}
//# sourceMappingURL=RecordingsPage.js.map