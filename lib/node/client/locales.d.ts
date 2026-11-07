/**
 * Locale bundles for the MiMo TTS plugin: the speak entry under each finalized
 * assistant message, its player, and the Plugins-page configuration card.
 * @module dsh-mimo-speak/client/locales
 */
/** Dictionary namespace owned by this plugin. */
export declare const NS = "settings.mimo-speak";
/** Locale keys this plugin renders. */
export type MimottsLocaleKey = 'speak' | 'synthesize' | 'play' | 'pause' | 'stop' | 'progress' | 'emptyText' | 'truncated' | 'error.notConfigured' | 'error.badRequest' | 'error.timeout' | 'error.upstream' | 'error.invalidAudio' | 'error.voiceSample' | 'error.generic' | 'audition' | 'auditioning' | 'auditionHint' | 'apiKey' | 'apiKeyHint' | 'apiKeySet' | 'apiKeyUnset' | 'apiKeyRef' | 'apiKeyRefDefault' | 'baseUrl' | 'baseUrlHint' | 'model' | 'modelHint' | 'voice' | 'voiceHint' | 'voiceSamplePath' | 'voiceSamplePathHint' | 'style' | 'styleHint' | 'maxChars' | 'maxCharsHint' | 'chunkChars' | 'chunkCharsHint' | 'timeoutMs' | 'timeoutMsHint' | 'autoRead' | 'autoReadHint' | 'fallbackEngine' | 'fallbackEngineNone' | 'fallbackEngineEdge' | 'fallbackEngineHint' | 'edgeVoice' | 'edgeVoiceHint' | 'readScope' | 'readScopeBrief' | 'readScopeText' | 'readScopeAll' | 'readScopeSmart' | 'readScopeHint' | 'briefPrefix' | 'highlight' | 'highlightHint' | 'muteWhileRecording' | 'muteWhileRecordingHint' | 'voiceInputNote' | 'fallbackUsed' | 'test' | 'testing' | 'testOk' | 'testFailed' | 'engineMimo' | 'engineEdge' | 'sectionConnection' | 'sectionVoice' | 'sectionBehavior' | 'sectionAudition' | 'autoplayHint' | 'progressBar' | 'progressBarHint' | 'overridden' | 'reset' | 'invalidNumber' | 'readOnly' | 'unavailable' | 'save' | 'saving' | 'saveFailed';
/** English copy. */
export declare const en: Record<MimottsLocaleKey, string>;
/** Simplified Chinese copy. */
export declare const zh: Record<MimottsLocaleKey, string>;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** MiMo TTS speak entry, player, and Plugins-page card copy. */
        'settings.mimo-speak': MimottsLocaleKey;
    }
}
