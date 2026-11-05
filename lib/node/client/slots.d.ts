/**
 * Injected faces and composed props of this plugin's three slot entries: the
 * speak control inside `conversation.chat.assistant-actions`, the plugin's
 * configuration card inside `plugins.bundle.config` (the Plugins page's keyed
 * slot for bundle-owned configuration), and the speech-history page inside
 * `settings.section`.
 *
 * All three slots are declared and typed by other packages (ui-conversation,
 * the Plugins page owner ui-plugin-manager, and the settings domain base);
 * this package only contributes entries, so no SlotMap merge lives here. Live
 * state arrives through the `hooks` compartment (the framework standard kit
 * binds `status` into `useStatus` and `form` into `useForm`), and business
 * verbs arrive as plain callbacks.
 * @module dsh-mimo-speak/client/slots
 */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { TtsStatusView, TtsSynthesizeRequest } from '../settings.ts';
import type { TtsSettingsInjected } from './settings-controller.ts';
export type { TtsSettingsInjected, TtsSettingsState } from './settings-controller.ts';
/** Injected business face of one assistant-message speak entry. */
export interface SpeakActionInjected {
    hooks: {
        /** The Host's resolved engine configuration (never secrets). */
        status: SnapshotStore<TtsStatusView>;
    };
    /** Load the engine status once, on first interaction. */
    ensureStatus: () => void;
    /**
     * Synthesize one text into playable audio.
     * @param request - text and optional style/voice overrides.
     * @returns the WAV payload as a Blob.
     */
    synthesize: (request: TtsSynthesizeRequest) => Promise<Blob>;
}
/** Full props of one assistant-message speak entry. */
export type SpeakActionProps = PropsRuntime<'conversation.chat.assistant-actions'> & InjectFace<SpeakActionInjected> & PropsLocale<'settings.mimo-speak'>;
/**
 * Full props of the plugin's configuration card on the Plugins page. The
 * `view` owner prop is `'page'` here — bundle configuration renders only the
 * page form, never the summary one-liner.
 */
export type BundleConfigCardProps = PropsRuntime<'plugins.bundle.config'> & InjectFace<TtsSettingsInjected> & PropsLocale<'settings.mimo-speak'>;
/** Full props of the speech-history settings page. */
export type RecordingsPageProps = PropsRuntime<'settings.section'> & PropsLocale<'settings.mimo-speak'>;
