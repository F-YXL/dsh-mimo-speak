/**
 * MiMo TTS speech synthesis, browser half.
 *
 * Three contributions, all registered through the typed slot system:
 * - `plugins.bundle.config` (keyed by the npm package name): the plugin's
 *   configuration card on the Plugins page, mounted on the bundle's detail
 *   page — the official seat for a bundle's own configuration;
 * - `settings.section`: the `语音历史` page (recorded speech, versions,
 *   re-synthesis), mounted while the Host serves this plugin's `mimo-speak`
 *   configuration namespace;
 * - `conversation.chat.assistant-actions`: the volume button under every
 *   finalized assistant message, with its floating player (draggable progress
 *   bar) once audio exists.
 *
 * Neither entry owns business state: configuration flows through
 * `ctx.configForms` (`mimo-speak` namespace), synthesis through the Host's
 * `/api/mimo-speak` routes, text from the Conversation binding through `useChat`,
 * and copy through `ctx.locale`.
 * @module dsh-mimo-speak/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
export type { BundleConfigCardProps, RecordingsPageProps, SpeakActionInjected, SpeakActionProps, } from './slots.ts';
/** Required services (cordis fiber inject); remote.credentials stores the API key. */
export declare const inject: string[];
/**
 * Mount the speak entries, the Plugins-page configuration card, and the
 * speech-history settings page.
 * @param ctx - the browser plugin context.
 */
export declare function apply(ctx: ClientContext): void;
