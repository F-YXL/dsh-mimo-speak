import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The speech-history browser: every recorded text, each with its versions.
 * Versions play in place, re-synthesize against the current engine settings
 * (appending a fresh take, old ones kept), or get deleted. There is no
 * dedicated comparison view — per the design, each take is played on its own.
 * @module dsh-mimo-speak/client/RecordingsList
 */
import { useCallback, useEffect, useState } from 'react';
import { deleteRecordingVersion, fetchRecordings, recordingFileUrl, resynthesizeRecording, TtsClientError, } from "./api.js";
import { pauseOtherAudio, registerAudioPauser } from "./audio-bus.js";
/** Identity this list registers with the shared audio bus. */
const LIST_TOKEN = {};
/**
 * Pause every other `<audio>` on the page.
 * @param current - the element that just started; never paused.
 */
function pauseSiblings(current) {
    for (const element of document.querySelectorAll('audio')) {
        if (element === current)
            continue;
        if (!element.paused)
            element.pause();
    }
}
/**
 * Render the persisted speech history with per-version playback, re-synthesis,
 * and deletion.
 * @param props - localized copy.
 * @returns the history list, or an empty-state note before the first load.
 */
export function RecordingsList({ t }) {
    const [index, setIndex] = useState(null);
    const [error, setError] = useState(null);
    const [busyRec, setBusyRec] = useState(null);
    const load = useCallback(() => {
        setError(null);
        fetchRecordings()
            .then(setIndex)
            .catch((failure) => setError(failure instanceof Error ? failure.message : String(failure)));
    }, []);
    useEffect(() => { load(); }, [load]);
    // One voice at a time: a history clip stops the message reader, and the
    // message reader stops a history clip. Without this, two takes — or a take
    // and a live reply — talk over each other.
    useEffect(() => registerAudioPauser(LIST_TOKEN, () => { pauseSiblings(); }), []);
    const onResynth = useCallback((recId) => {
        setBusyRec(recId);
        resynthesizeRecording(recId)
            .then(load)
            .catch((failure) => setError(failure instanceof TtsClientError ? failure.message : String(failure)))
            .finally(() => setBusyRec(null));
    }, [load]);
    const onDelete = useCallback((recId, verId) => {
        deleteRecordingVersion(recId, verId)
            .then(load)
            .catch((failure) => setError(failure instanceof TtsClientError ? failure.message : String(failure)));
    }, [load]);
    // A failed first load has no index yet: show the reason instead of claiming
    // the history is empty.
    if (index === null) {
        return error === null
            ? _jsx("p", { className: "mimo-speak-recordingsEmpty", children: t('recordingsEmpty') })
            : _jsx("p", { className: "mimo-speak-fieldError", role: "status", children: error });
    }
    if (index.entries.length === 0) {
        return _jsx("p", { className: "mimo-speak-recordingsEmpty", children: t('recordingsEmpty') });
    }
    return (_jsxs("div", { className: "mimo-speak-recordings", children: [error !== null ? _jsx("p", { className: "mimo-speak-fieldError", role: "status", children: error }) : null, index.entries.map((entry) => (_jsxs("div", { className: "mimo-speak-recording", children: [_jsx("p", { className: "mimo-speak-recordingText", title: entry.text, children: entry.text }), _jsx("ul", { className: "mimo-speak-versions", children: entry.versions.map((version) => (_jsxs("li", { className: "mimo-speak-version", children: [_jsx("audio", { className: "mimo-speak-versionAudio", src: recordingFileUrl(entry.id, version.id), controls: true, preload: "none", onPlay: (event) => {
                                        pauseOtherAudio(LIST_TOKEN);
                                        pauseSiblings(event.currentTarget);
                                    } }), _jsxs("span", { className: "mimo-speak-versionMeta", children: [new Date(version.createdAt).toLocaleString(), version.voice !== null ? ` · ${version.voice}` : '', version.style !== null ? ` · ${version.style}` : ''] }), _jsx("button", { type: "button", className: "mimo-speak-recButton", disabled: busyRec === entry.id, onClick: () => { onResynth(entry.id); }, children: busyRec === entry.id ? t('reSynthesizing') : t('reSynthesize') }), _jsx("button", { type: "button", className: "mimo-speak-recButton", onClick: () => { onDelete(entry.id, version.id); }, children: t('deleteVersion') })] }, version.id))) })] }, entry.id)))] }));
}
//# sourceMappingURL=RecordingsList.js.map