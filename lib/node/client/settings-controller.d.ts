/**
 * The staged settings form behind the Plugins-page configuration card: one
 * `SettingsFormModel` over the `mimo-speak` configuration namespace. The API key
 * is a write-only control outside the section: a typed key stores through the
 * host's `credentials/set` remote under the configured reference (`apiKeyEnv`,
 * a section field the card reads but never renders as an input), and the card
 * learns only whether one resolves, through the Host's status route.
 * @module dsh-mimo-speak/client/settings-controller
 */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { SettingsFieldState, SettingsFormScope, SettingsFormShell } from '@deepseek-ai/dsh-client-ui-primitives';
import type { TtsSettings, TtsSynthesizeRequest, TtsTestResult } from '../settings.ts';
/** Field names inside the `mimo-speak` settings section. */
export type TtsSettingsField = keyof TtsSettings;
/** Synthesis verb shared by the Plugins-page card and the speak entries. */
export type TtsSettingsSynthesize = (request: TtsSynthesizeRequest) => Promise<Blob>;
/** Stores a credential literal under one reference in the host credentials store. */
export type TtsSetCredential = (ref: string, value: string) => Promise<boolean>;
/** What the Plugins-page card renders. */
export interface TtsSettingsState extends SettingsFormShell {
    /** The write-only API key control (blank unless a key is being typed). */
    apiKey: SettingsFieldState;
    /** Whether the Host resolves a non-empty key through the reference. */
    apiKeyConfigured: boolean;
    /** The credential reference naming the key (shown as text, edited only in config). */
    apiKeyEnv: string | undefined;
    /** Endpoint base. */
    baseUrl: SettingsFieldState;
    /** Model id. */
    model: SettingsFieldState;
    /** Preset voice. */
    voice: SettingsFieldState;
    /** Host-local voice-clone sample path. */
    voiceSamplePath: SettingsFieldState;
    /** Default speaking style. */
    style: SettingsFieldState;
    /** Character budget. */
    maxChars: SettingsFieldState;
    /** Playback chunk size. */
    chunkChars: SettingsFieldState;
    /** Round-trip timeout. */
    timeoutMs: SettingsFieldState;
    /** Read new replies automatically. */
    autoRead: SettingsFieldState;
    /** Fallback engine used when MiMo synthesis fails. */
    fallbackEngine: SettingsFieldState;
    /** Edge-TTS voice used by the fallback engine. */
    edgeVoice: SettingsFieldState;
    /** Which parts of a reply are read aloud. */
    readScope: SettingsFieldState;
    /** Highlight the sentence being read inside the message. */
    highlight: SettingsFieldState;
    /** Show the seekable progress bar in the floating player. */
    progressBar: SettingsFieldState;
    /**
     * Whether the running Host knows the `progressBar` key. A freshly installed
     * client can meet a Host that still runs the previous schema — writing an
     * unknown key makes the whole save roll back, so that control stays hidden
     * until the Host reports the field.
     */
    supportsProgressBar: boolean;
    /** Whether the running Host knows the `muteWhileRecording` key. */
    muteWhileRecording: SettingsFieldState;
    supportsMuteWhileRecording: boolean;
}
/** The registration-side face the Plugins-page card's slot entry injects. */
export interface TtsSettingsInjected {
    hooks: {
        /** Card snapshot bound by the renderer as useForm. */
        form: SnapshotStore<TtsSettingsState>;
    };
    /** Stage draft text for one field (section fields or the API key control). */
    edit: (field: TtsSettingsField | 'apiKey', text: string) => void;
    /** Stage a clear so the field re-inherits the schema default. */
    resetField: (field: TtsSettingsField) => void;
    /** Write every staged edit (section fields, plus a typed key if any). */
    save: () => void;
    /** Drop every staged edit. */
    discard: () => void;
    /** @see TtsSettingsSynthesize */
    synthesize: TtsSettingsSynthesize;
    /** Run the Host-side round-trip health check against the live engine. */
    test: () => Promise<TtsTestResult>;
}
/**
 * Bridges the `mimo-speak` configuration namespace onto the Plugins-page card.
 * @param scope - the bound settings scope for the `mimo-speak` namespace.
 * @param setCredential - stores a key in the host credentials store.
 */
export declare class TtsSettingsController {
    private readonly scope;
    private readonly setCredential;
    private readonly form;
    private readonly store;
    private readonly unsubscribeStatus;
    private readonly status;
    constructor(scope: SettingsFormScope<TtsSettings>, setCredential: TtsSetCredential);
    /**
     * Build the face the card's slot registration injects.
     * @returns the card's snapshot and its form actions.
     */
    inject(): TtsSettingsInjected;
    /** Release form and status subscriptions. */
    dispose(): void;
    /**
     * Store one typed key under the section's credential reference. A blank
     * draft never reaches here (the form model writes nothing for it); a
     * successful write refreshes the status mirror, so the configured flag
     * follows immediately.
     * @param text - the literal API key as typed.
     * @returns whether the host accepted the write.
     */
    private writeApiKey;
    /** @returns the card projection rebuilt from the form and the status mirror. */
    private projection;
}
