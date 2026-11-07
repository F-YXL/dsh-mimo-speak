/**
 * The staged settings form behind the Plugins-page configuration card: one
 * `SettingsFormModel` over the `mimo-speak` configuration namespace. The API key
 * is a write-only control outside the section: a typed key stores through the
 * host's `credentials/set` remote under the configured reference (`apiKeyEnv`,
 * a section field the card reads but never renders as an input), and the card
 * learns only whether one resolves, through the Host's status route.
 * @module dsh-mimo-speak/client/settings-controller
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  SettingsFormModel,
  settingsTextField,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  SettingsFieldSpec, SettingsFieldState, SettingsFormScope, SettingsFormShell,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TtsSettings, TtsSynthesizeRequest, TtsTestResult } from '../settings.ts'
import { clearSpeechCache } from './speech-cache.ts'
import { requestSpeech, requestSpeechTest } from './api.ts'
import { refreshTtsStatus, ttsStatusStore } from './status.ts'

/** Field names inside the `mimo-speak` settings section. */
export type TtsSettingsField = keyof TtsSettings

/** Synthesis verb shared by the Plugins-page card and the speak entries. */
export type TtsSettingsSynthesize = (request: TtsSynthesizeRequest) => Promise<Blob>

/** Stores a credential literal under one reference in the host credentials store. */
export type TtsSetCredential = (ref: string, value: string) => Promise<boolean>

/** What the Plugins-page card renders. */
export interface TtsSettingsState extends SettingsFormShell {
  /** The write-only API key control (blank unless a key is being typed). */
  apiKey: SettingsFieldState
  /** Whether the Host resolves a non-empty key through the reference. */
  apiKeyConfigured: boolean
  /** The credential reference naming the key (shown as text, edited only in config). */
  apiKeyEnv: string | undefined
  /** Endpoint base. */
  baseUrl: SettingsFieldState
  /** Model id. */
  model: SettingsFieldState
  /** Preset voice. */
  voice: SettingsFieldState
  /** Host-local voice-clone sample path. */
  voiceSamplePath: SettingsFieldState
  /** Default speaking style. */
  style: SettingsFieldState
  /** Character budget. */
  maxChars: SettingsFieldState
  /** Playback chunk size. */
  chunkChars: SettingsFieldState
  /** Round-trip timeout. */
  timeoutMs: SettingsFieldState
  /** Read new replies automatically. */
  autoRead: SettingsFieldState
  /** Fallback engine used when MiMo synthesis fails. */
  fallbackEngine: SettingsFieldState
  /** Edge-TTS voice used by the fallback engine. */
  edgeVoice: SettingsFieldState
  /** Which parts of a reply are read aloud. */
  readScope: SettingsFieldState
  /** Highlight the sentence being read inside the message. */
  highlight: SettingsFieldState
  /** Show the seekable progress bar in the floating player. */
  progressBar: SettingsFieldState
  /**
   * Whether the running Host knows the `progressBar` key. A freshly installed
   * client can meet a Host that still runs the previous schema — writing an
   * unknown key makes the whole save roll back, so that control stays hidden
   * until the Host reports the field.
   */
  supportsProgressBar: boolean
  /** Whether the running Host knows the `muteWhileRecording` key. */
  muteWhileRecording: SettingsFieldState
  supportsMuteWhileRecording: boolean
}

/** The registration-side face the Plugins-page card's slot entry injects. */
export interface TtsSettingsInjected {
  hooks: {
    /** Card snapshot bound by the renderer as useForm. */
    form: SnapshotStore<TtsSettingsState>
  }
  /** Stage draft text for one field (section fields or the API key control). */
  edit: (field: TtsSettingsField | 'apiKey', text: string) => void
  /** Stage a clear so the field re-inherits the schema default. */
  resetField: (field: TtsSettingsField) => void
  /** Write every staged edit (section fields, plus a typed key if any). */
  save: () => void
  /** Drop every staged edit. */
  discard: () => void
  /** @see TtsSettingsSynthesize */
  synthesize: TtsSettingsSynthesize
  /** Run the Host-side round-trip health check against the live engine. */
  test: () => Promise<TtsTestResult>
}

/** Form field name of the write-only API key control (not a section field). */
const API_KEY_CONTROL = 'apiKey'

/**
 * A numeric spec that clamps into the range the Host schema declares
 * (`chunkChars` 20–1000, the others at least 1). The shared
 * `settingsNumberField` accepts any finite number, and one out-of-range value
 * makes the Host reject the whole section — which the UI can only report as
 * 「本部署没有接受这些值」. Clamping here keeps every save valid.
 * @param field - section field name.
 * @param min - smallest value the Host accepts.
 * @param max - largest value the Host accepts, when it has one.
 * @returns the field's conversion spec.
 */
function settingsClampedNumberField(field: TtsSettingsField, min: number, max?: number): SettingsFieldSpec {
  return {
    field,
    format: value => (typeof value === 'number' ? String(value) : ''),
    parse: (text: string) => {
      const trimmed = text.trim()
      if (trimmed === '') return { kind: 'clear' }
      const parsed = Number(trimmed)
      if (!Number.isFinite(parsed)) return undefined
      const rounded = Math.round(parsed)
      const value = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, rounded))
      return { kind: 'set', value }
    },
  }
}

/** Section fields the card edits; `apiKeyEnv` stays a read-only ref name. */
const SECTION_SPECS: SettingsFieldSpec[] = [
  settingsTextField('baseUrl'),
  settingsTextField('model'),
  settingsTextField('voice'),
  settingsTextField('voiceSamplePath'),
  settingsTextField('style'),
  settingsClampedNumberField('maxChars', 1),
  settingsClampedNumberField('chunkChars', 20, 1000),
  settingsClampedNumberField('timeoutMs', 1),
  {
    field: 'autoRead',
    format: value => (value === true ? 'true' : 'false'),
    parse: text => text === 'true'
      ? { kind: 'set', value: true }
      : text === 'false'
        ? { kind: 'set', value: false }
        : undefined,
  },
  {
    field: 'fallbackEngine',
    format: value => (value === 'edge' ? 'edge' : 'none'),
    parse: text => (text === 'edge' || text === 'none' ? { kind: 'set', value: text } : undefined),
  },
  settingsTextField('edgeVoice'),
  {
    field: 'readScope',
    format: value => (value === 'all' || value === 'smart' || value === 'brief' ? value : 'text'),
    parse: text => (
      text === 'text' || text === 'all' || text === 'smart' || text === 'brief'
        ? { kind: 'set', value: text }
        : undefined
    ),
  },
  {
    field: 'highlight',
    format: value => (value === true ? 'true' : 'false'),
    parse: text => text === 'true'
      ? { kind: 'set', value: true }
      : text === 'false'
        ? { kind: 'set', value: false }
        : undefined,
  },
  {
    field: 'muteWhileRecording',
    format: value => (value === true ? 'true' : 'false'),
    parse: text => text === 'true'
      ? { kind: 'set', value: true }
      : text === 'false'
        ? { kind: 'set', value: false }
        : undefined,
  },
  {
    field: 'progressBar',
    format: value => (value === true ? 'true' : 'false'),
    parse: text => text === 'true'
      ? { kind: 'set', value: true }
      : text === 'false'
        ? { kind: 'set', value: false }
        : undefined,
  },
]

/**
 * Bridges the `mimo-speak` configuration namespace onto the Plugins-page card.
 * @param scope - the bound settings scope for the `mimo-speak` namespace.
 * @param setCredential - stores a key in the host credentials store.
 */
export class TtsSettingsController {
  private readonly form: SettingsFormModel<TtsSettings>
  private readonly store: SnapshotStore<TtsSettingsState>
  private readonly unsubscribeStatus: () => void
  private readonly status = ttsStatusStore()

  constructor(
    private readonly scope: SettingsFormScope<TtsSettings>,
    private readonly setCredential: TtsSetCredential,
  ) {
    this.form = new SettingsFormModel(scope, SECTION_SPECS, [{
      field: API_KEY_CONTROL,
      write: text => this.writeApiKey(text),
    }])
    this.store = this.form.bind(() => this.projection())
    // The status mirror answers "is a key configured", which the form section
    // cannot: secrets never ride a response. Its changes republish the card.
    this.unsubscribeStatus = this.status.subscribe(() => { this.store.set(this.projection()) })
    void refreshTtsStatus()
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its form actions.
   */
  inject(): TtsSettingsInjected {
    const actions = this.form.actions()
    return {
      hooks: { form: this.store },
      edit: (field, text) => { actions.edit(field, text) },
      resetField: (field) => { actions.resetField(field) },
      // Drop cached audio on save: the user just asked for different audio, so
      // replaying a take synthesized with the previous voice or style would
      // quietly ignore the change.
      save: () => { clearSpeechCache(); actions.save() },
      discard: () => { actions.discard() },
      synthesize: request => requestSpeech(request),
      test: () => requestSpeechTest(),
    }
  }

  /** Release form and status subscriptions. */
  dispose(): void {
    this.unsubscribeStatus()
    this.form.dispose()
  }

  /**
   * Store one typed key under the section's credential reference. A blank
   * draft never reaches here (the form model writes nothing for it); a
   * successful write refreshes the status mirror, so the configured flag
   * follows immediately.
   * @param text - the literal API key as typed.
   * @returns whether the host accepted the write.
   */
  private async writeApiKey(text: string): Promise<boolean> {
    const ref = (this.scope.getSnapshot().value?.apiKeyEnv ?? '').trim()
    if (ref === '') return false
    const ok = await this.setCredential(ref, text.trim())
    if (ok) void refreshTtsStatus()
    return ok
  }

  /** @returns the card projection rebuilt from the form and the status mirror. */
  private projection(): TtsSettingsState {
    return {
      ...this.form.shell(),
      apiKey: this.form.field(API_KEY_CONTROL),
      apiKeyConfigured: this.status.getSnapshot().configured,
      apiKeyEnv: this.scope.getSnapshot().value?.apiKeyEnv,
      baseUrl: this.form.field('baseUrl'),
      model: this.form.field('model'),
      voice: this.form.field('voice'),
      voiceSamplePath: this.form.field('voiceSamplePath'),
      style: this.form.field('style'),
      maxChars: this.form.field('maxChars'),
      chunkChars: this.form.field('chunkChars'),
      timeoutMs: this.form.field('timeoutMs'),
      autoRead: this.form.field('autoRead'),
      fallbackEngine: this.form.field('fallbackEngine'),
      edgeVoice: this.form.field('edgeVoice'),
      readScope: this.form.field('readScope'),
      highlight: this.form.field('highlight'),
      progressBar: this.form.field('progressBar'),
      // An older Host answers /status without the key: hide the control rather
      // than let a save fail with "the deployment did not accept these values".
      supportsProgressBar: typeof this.status.getSnapshot().progressBar === 'boolean',
      muteWhileRecording: this.form.field('muteWhileRecording'),
      supportsMuteWhileRecording: typeof this.status.getSnapshot().muteWhileRecording === 'boolean',
    }
  }
}
