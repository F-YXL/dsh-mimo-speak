import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The plugin's configuration card on the Plugins page: registered into the
 * `plugins.bundle.config` keyed slot (key = the npm package name), it renders
 * inside the bundle's detail page between its description and its rows. The
 * write-only API key (stored through the host credentials store), the MiMo
 * endpoint, model, voice (preset dropdown or clone sample), default style,
 * request budget — plus a sample player that previews the card's current
 * style and voice, including edits not yet saved.
 *
 * The card renders the shared settings form frame, so saving, discarding,
 * override badges, and read-only/unavailable handling follow the platform's
 * configuration-form conventions exactly. The Plugins page dispatches this
 * slot with `view: 'page'` only, but the entry stays honest about it.
 * @module dsh-mimo-speak/client/BundleConfigCard
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { SegmentedControl, SettingsForm, SettingsSecretField, SettingsValueField, Switch, } from '@deepseek-ai/dsh-client-ui-primitives';
import { AUDITION_TEXT, DEFAULT_EDGE_VOICE, DEFAULT_VOICE } from "../settings.js";
import { TtsClientError } from "./api.js";
import { errorKeyFor } from "./SpeakAction.js";
import { PlayerBar } from "./PlayerBar.js";
import { useAudioPlayer } from "./use-audio-player.js";
/**
 * Map the staged draft text onto one of the segmented control's values.
 * @param text - current draft of the `readScope` field.
 * @returns the scope to render as selected.
 */
function normalizeScope(text) {
    const value = text.trim();
    return value === 'all' || value === 'smart' || value === 'brief' ? value : 'text';
}
/**
 * The official preset voices of `mimo-v2.5-tts` (Xiaomi MiMo speech-synthesis
 * docs, 预置音色列表). The voice id is what the API's `audio.voice` takes;
 * the display name is the docs' naming.
 */
const PRESET_VOICES = [
    { id: 'mimo_default', name: 'MiMo-默认' },
    { id: '冰糖', name: '冰糖' },
    { id: '茉莉', name: '茉莉' },
    { id: '苏打', name: '苏打' },
    { id: '白桦', name: '白桦' },
    { id: 'Mia', name: 'Mia' },
    { id: 'Chloe', name: 'Chloe' },
    { id: 'Milo', name: 'Milo' },
    { id: 'Dean', name: 'Dean' },
];
/**
 * Common Edge TTS neural voices for Chinese. The voice id is what the
 * `edge-tts --voice` flag takes; the display name is the voice's familiar
 * name. A saved value outside this list stays selectable as a custom option.
 */
const EDGE_VOICES = [
    { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓（女·默认）' },
    { id: 'zh-CN-XiaoyiNeural', name: '晓伊（女）' },
    { id: 'zh-CN-XiaoshuangNeural', name: '晓双（女·儿童）' },
    { id: 'zh-CN-YunxiNeural', name: '云希（男）' },
    { id: 'zh-CN-YunjianNeural', name: '云健（男）' },
    { id: 'zh-CN-YunyangNeural', name: '云扬（男·新闻）' },
    { id: 'zh-CN-YunxiaNeural', name: '云夏（男·少年）' },
    { id: 'zh-CN-liaoning-XiaobeiNeural', name: '晓北（东北话）' },
    { id: 'zh-CN-shaanxi-XiaoniNeural', name: '晓妮（陕西话）' },
    { id: 'zh-TW-HsiaoChenNeural', name: '曉臻（台湾）' },
    { id: 'zh-HK-HiuMaanNeural', name: '曉曼（香港）' },
];
/**
 * Render the plugin's configuration card.
 * @param props - localized copy, the staged form snapshot, and its actions.
 * @returns the configuration form with its sample player, or null for a view
 * this slot does not render (bundle configuration is page-only).
 */
export function BundleConfigCard({ view, useForm, edit, resetField, save, discard, synthesize, test, t }) {
    const state = useForm(snapshot => snapshot);
    const [sampleUrl, setSampleUrl] = useState(null);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState(null);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const player = useAudioPlayer(sampleUrl);
    const toggle = player.toggle;
    const autoplay = useRef(false);
    const sampleRef = useRef(null);
    sampleRef.current = sampleUrl;
    // Release the sample object URL when the page closes.
    useEffect(() => () => {
        if (sampleRef.current !== null)
            URL.revokeObjectURL(sampleRef.current);
    }, []);
    useEffect(() => {
        if (sampleUrl === null || !autoplay.current)
            return;
        autoplay.current = false;
        toggle();
    }, [sampleUrl, toggle]);
    const audition = useCallback(() => {
        if (busy)
            return;
        setBusy(true);
        setFailure(null);
        void synthesize({
            text: AUDITION_TEXT,
            style: state.style.text.trim() === '' ? undefined : state.style.text,
            voice: state.voice.text.trim() === '' ? undefined : state.voice.text,
        }).then((blob) => {
            autoplay.current = true;
            setBusy(false);
            setSampleUrl((previous) => {
                if (previous !== null)
                    URL.revokeObjectURL(previous);
                return URL.createObjectURL(blob);
            });
        }).catch((error) => {
            setBusy(false);
            setFailure(error instanceof TtsClientError ? error : new TtsClientError('generic', String(error)));
        });
    }, [busy, state.style.text, state.voice.text, synthesize]);
    const runTest = useCallback(() => {
        if (testing)
            return;
        setTesting(true);
        setTestResult(null);
        void test().then((result) => {
            setTesting(false);
            const engine = result.engine === 'edge' ? t('engineEdge') : t('engineMimo');
            setTestResult(t('testOk').replace('{engine}', engine).replace('{ms}', String(result.latencyMs)));
        }).catch((error) => {
            setTesting(false);
            setTestResult(`${t('testFailed')}: ${error instanceof TtsClientError ? error.message : String(error)}`);
        });
    }, [test, testing, t]);
    if (view !== 'page')
        return null;
    const disabled = !state.writable;
    const failureKey = failure === null ? null : errorKeyFor(failure);
    // A blank draft inherits the preset default, so the dropdown shows it; a
    // hand-edited custom voice outside the official list stays selectable.
    const voiceDraft = state.voice.text.trim() === '' ? DEFAULT_VOICE : state.voice.text;
    const customVoice = PRESET_VOICES.some(voice => voice.id === voiceDraft)
        ? null
        : voiceDraft;
    const edgeVoiceDraft = state.edgeVoice.text.trim() === '' ? DEFAULT_EDGE_VOICE : state.edgeVoice.text;
    const customEdgeVoice = EDGE_VOICES.some(voice => voice.id === edgeVoiceDraft)
        ? null
        : edgeVoiceDraft;
    return (_jsxs(SettingsForm, { labels: {
            unavailable: t('unavailable'),
            readOnly: t('readOnly'),
            saveFailed: t('saveFailed'),
            save: t('save'),
            saving: t('saving'),
        }, state: state, onSave: save, onDiscard: discard, children: [_jsx("h4", { className: "mimo-speak-sectionTitle", children: t('sectionConnection') }), _jsx(SettingsSecretField, { id: "mimo-speak-api-key", label: t('apiKey'), hint: t('apiKeyHint'), text: state.apiKey.text, disabled: disabled, configured: state.apiKeyConfigured, stateLabel: state.apiKeyConfigured ? t('apiKeySet') : t('apiKeyUnset'), onEdit: (text) => { edit('apiKey', text); } }), _jsx("p", { className: "mimo-speak-auditionHint", role: "status", style: { marginTop: -6 }, children: state.apiKeyEnv !== undefined && state.apiKeyEnv.trim() !== ''
                    ? `${t('apiKeyRef')} ${state.apiKeyEnv}`
                    : t('apiKeyRefDefault') }), _jsx(SettingsValueField, { id: "mimo-speak-base-url", label: t('baseUrl'), hint: t('baseUrlHint'), overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t('invalidNumber'), disabled: disabled, ...state.baseUrl, onEdit: (text) => { edit('baseUrl', text); }, onReset: () => { resetField('baseUrl'); } }), _jsx(SettingsValueField, { id: "mimo-speak-model", label: t('model'), hint: t('modelHint'), overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t('invalidNumber'), disabled: disabled, ...state.model, onEdit: (text) => { edit('model', text); }, onReset: () => { resetField('model'); } }), _jsx("h4", { className: "mimo-speak-sectionTitle", children: t('sectionVoice') }), _jsxs("div", { className: "mimo-speak-selectField", children: [_jsx("label", { className: "mimo-speak-selectLabel", htmlFor: "mimo-speak-voice-select", children: t('voice') }), _jsxs("select", { id: "mimo-speak-voice-select", className: "mimo-speak-select", disabled: disabled || state.voiceSamplePath.text.trim() !== '', title: state.voiceSamplePath.text.trim() !== '' ? t('voiceHint') : undefined, value: voiceDraft, onChange: (event) => { edit('voice', event.target.value); }, children: [PRESET_VOICES.map(voice => (_jsx("option", { value: voice.id, children: voice.id === DEFAULT_VOICE ? `${voice.name}（默认）` : voice.name }, voice.id))), customVoice !== null ? _jsx("option", { value: customVoice, children: customVoice }) : null] }), _jsx("p", { className: "mimo-speak-auditionHint", children: t('voiceHint') })] }), _jsx(SettingsValueField, { id: "mimo-speak-voice-sample", label: t('voiceSamplePath'), hint: t('voiceSamplePathHint'), overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t('invalidNumber'), disabled: disabled, ...state.voiceSamplePath, onEdit: (text) => { edit('voiceSamplePath', text); }, onReset: () => { resetField('voiceSamplePath'); } }), _jsx(SettingsValueField, { id: "mimo-speak-style", label: t('style'), hint: t('styleHint'), overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t('invalidNumber'), disabled: disabled, ...state.style, onEdit: (text) => { edit('style', text); }, onReset: () => { resetField('style'); } }), _jsx("h4", { className: "mimo-speak-sectionTitle", children: t('sectionBehavior') }), _jsxs("div", { className: "mimo-speak-selectField", children: [_jsx("span", { className: "mimo-speak-selectLabel", children: t('autoRead') }), _jsx(Switch, { checked: state.autoRead.text.trim() === 'true', onChange: (next) => { edit('autoRead', String(next)); }, label: t('autoRead'), disabled: disabled }), _jsx("p", { className: "mimo-speak-auditionHint", children: t('autoReadHint') })] }), _jsxs("div", { className: "mimo-speak-selectField", children: [_jsx("span", { className: "mimo-speak-selectLabel", children: t('fallbackEngine') }), _jsx(SegmentedControl, { id: "mimo-speak-fallback", value: state.fallbackEngine.text.trim() === 'edge' ? 'edge' : 'none', options: [
                            { value: 'none', label: t('fallbackEngineNone') },
                            { value: 'edge', label: t('fallbackEngineEdge') },
                        ], onChange: (next) => { edit('fallbackEngine', next); }, label: t('fallbackEngine'), disabled: disabled }), _jsx("p", { className: "mimo-speak-auditionHint", children: t('fallbackEngineHint') })] }), _jsxs("div", { className: "mimo-speak-selectField", children: [_jsx("label", { className: "mimo-speak-selectLabel", htmlFor: "mimo-speak-edge-voice-select", children: t('edgeVoice') }), _jsxs("select", { id: "mimo-speak-edge-voice-select", className: "mimo-speak-select", disabled: disabled || state.fallbackEngine.text.trim() !== 'edge', title: state.fallbackEngine.text.trim() !== 'edge' ? t('fallbackEngineHint') : undefined, value: edgeVoiceDraft, onChange: (event) => { edit('edgeVoice', event.target.value); }, children: [_jsx("optgroup", { label: "\u666E\u901A\u8BDD", children: EDGE_VOICES.filter(voice => voice.id.startsWith('zh-CN-')).map(voice => (_jsx("option", { value: voice.id, children: voice.name }, voice.id))) }), _jsx("optgroup", { label: "\u53F0\u6E7E", children: EDGE_VOICES.filter(voice => voice.id.startsWith('zh-TW-')).map(voice => (_jsx("option", { value: voice.id, children: voice.name }, voice.id))) }), _jsx("optgroup", { label: "\u9999\u6E2F", children: EDGE_VOICES.filter(voice => voice.id.startsWith('zh-HK-')).map(voice => (_jsx("option", { value: voice.id, children: voice.name }, voice.id))) }), customEdgeVoice !== null ? _jsx("option", { value: customEdgeVoice, children: customEdgeVoice }) : null] }), _jsx("p", { className: "mimo-speak-auditionHint", children: t('edgeVoiceHint') })] }), _jsxs("div", { className: "mimo-speak-selectField", children: [_jsx("span", { className: "mimo-speak-selectLabel", children: t('readScope') }), _jsx(SegmentedControl, { id: "mimo-speak-scope", value: normalizeScope(state.readScope.text), options: [
                            { value: 'brief', label: t('readScopeBrief') },
                            { value: 'text', label: t('readScopeText') },
                            { value: 'smart', label: t('readScopeSmart') },
                            { value: 'all', label: t('readScopeAll') },
                        ], onChange: (next) => { edit('readScope', next); }, label: t('readScope'), disabled: disabled }), _jsx("p", { className: "mimo-speak-auditionHint", children: t('readScopeHint') })] }), _jsxs("div", { className: "mimo-speak-selectField", children: [_jsx("span", { className: "mimo-speak-selectLabel", children: t('highlight') }), _jsx(Switch, { checked: state.highlight.text.trim() !== 'false', onChange: (next) => { edit('highlight', String(next)); }, label: t('highlight'), disabled: disabled }), _jsx("p", { className: "mimo-speak-auditionHint", children: t('highlightHint') })] }), state.supportsMuteWhileRecording
                ? (_jsxs("div", { className: "mimo-speak-selectField", children: [_jsx("span", { className: "mimo-speak-selectLabel", children: t('muteWhileRecording') }), _jsx(Switch, { checked: state.muteWhileRecording.text.trim() !== 'false', onChange: (next) => { edit('muteWhileRecording', String(next)); }, label: t('muteWhileRecording'), disabled: disabled }), _jsx("p", { className: "mimo-speak-auditionHint", children: t('muteWhileRecordingHint') })] }))
                : null, _jsx("p", { className: "mimo-speak-auditionHint", children: t('voiceInputNote') }), state.supportsProgressBar
                ? (_jsxs("div", { className: "mimo-speak-selectField", children: [_jsx("span", { className: "mimo-speak-selectLabel", children: t('progressBar') }), _jsx(Switch, { checked: state.progressBar.text.trim() === 'true', onChange: (next) => { edit('progressBar', String(next)); }, label: t('progressBar'), disabled: disabled }), _jsx("p", { className: "mimo-speak-auditionHint", children: t('progressBarHint') })] }))
                : null, _jsx(SettingsValueField, { id: "mimo-speak-max-chars", label: t('maxChars'), hint: t('maxCharsHint'), overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t('invalidNumber'), numeric: true, disabled: disabled, ...state.maxChars, onEdit: (text) => { edit('maxChars', text); }, onReset: () => { resetField('maxChars'); } }), _jsx(SettingsValueField, { id: "mimo-speak-chunk-chars", label: t('chunkChars'), hint: t('chunkCharsHint'), overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t('invalidNumber'), numeric: true, disabled: disabled, ...state.chunkChars, onEdit: (text) => { edit('chunkChars', text); }, onReset: () => { resetField('chunkChars'); } }), _jsx(SettingsValueField, { id: "mimo-speak-timeout", label: t('timeoutMs'), hint: t('timeoutMsHint'), overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t('invalidNumber'), numeric: true, disabled: disabled, ...state.timeoutMs, onEdit: (text) => { edit('timeoutMs', text); }, onReset: () => { resetField('timeoutMs'); } }), _jsx("h4", { className: "mimo-speak-sectionTitle", children: t('sectionAudition') }), _jsxs("div", { className: "mimo-speak-audition", children: [_jsx("p", { className: "mimo-speak-auditionHint", children: t('auditionHint') }), _jsxs("div", { className: "mimo-speak-auditionRow", children: [_jsx("button", { type: "button", className: "mimo-speak-auditionButton", disabled: busy, onClick: audition, children: busy ? t('auditioning') : t('audition') }), _jsx("button", { type: "button", className: "mimo-speak-auditionButton", disabled: testing, onClick: runTest, children: testing ? t('testing') : t('test') }), sampleUrl !== null
                                ? (_jsx(PlayerBar, { state: player.state, onToggle: player.toggle, onSeek: player.seek, labels: { play: t('play'), pause: t('pause'), progress: t('progress') } }))
                                : null] }), failureKey !== null ? _jsx("p", { className: "mimo-speak-fieldError", role: "status", children: t(failureKey) }) : null, testResult !== null ? _jsx("p", { className: "mimo-speak-auditionHint", role: "status", children: testResult }) : null] })] }));
}
//# sourceMappingURL=BundleConfigCard.js.map