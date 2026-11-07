/**
 * MiMo TTS speech synthesis, browser half.
 *
 * Two contributions, both registered through the typed slot system:
 * - `plugins.bundle.config` (keyed by the npm package name): the plugin's
 *   configuration card on the Plugins page, mounted on the bundle's detail
 *   page — the official seat for a bundle's own configuration;
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
import { MIMOSPEAK_NAMESPACE, MIMOSPEAK_PACKAGE_KEY } from "../settings.js";
import { BundleConfigCard } from "./BundleConfigCard.js";
import { requestSpeech } from "./api.js";
import { NS, en, zh } from "./locales.js";
import { SpeakAction } from "./SpeakAction.js";
import { TtsSettingsController } from "./settings-controller.js";
import { ensureTtsStatus, ttsStatusStore } from "./status.js";
import { injectStyles } from "./styles.js";
/** Required services (cordis fiber inject); remote.credentials stores the API key. */
export const inject = ['slots', 'locale', 'configForms', 'remote', 'remote.credentials'];
/**
 * Mount the speak entry and the Plugins-page configuration card.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx) {
    ctx.effect(() => injectStyles(), 'dsh-mimo-speak: styles');
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-mimo-speak: dictionaries');
    const t = ctx.locale.bind(NS);
    // The typed API key stores through the platform's credentials remote — the
    // same host operation the official add-model credential editor writes
    // through — so the literal key never lands in a configuration file.
    const controller = new TtsSettingsController(ctx.configForms.get(MIMOSPEAK_NAMESPACE), async (ref, value) => (await ctx.remote.credentials.set(ref, value)).ok);
    ctx.effect(() => () => { controller.dispose(); }, 'dsh-mimo-speak: settings form');
    // The configuration card edits the plugin's configuration namespace, so it
    // exists only while the Host serves it — a deployment without the plugin
    // shows no trace of it.
    ctx.effect(() => ctx.configForms.whileServed([MIMOSPEAK_NAMESPACE], () => {
        // Keyed by the package name: the Plugins page dispatches
        // `plugins.bundle.config` with `entryKey: pkg.name`.
        const offCard = ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
            name: 'plugins.bundle.config',
            key: MIMOSPEAK_PACKAGE_KEY,
            locale: NS,
            inject: () => controller.inject(),
        }, BundleConfigCard));
        return () => { offCard(); };
    }), 'dsh-mimo-speak: plugins-page card');
    // Automatic read-aloud needs the resolved engine settings before the user
    // ever hovers a speaker, so prime the status mirror once at boot instead of
    // waiting for the first interaction.
    void ensureTtsStatus();
    ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
        name: 'conversation.chat.assistant-actions',
        id: 'mimo-speak',
        order: 20,
        locale: NS,
        inject: () => ({
            hooks: { status: ttsStatusStore() },
            ensureStatus: () => { void ensureTtsStatus(); },
            synthesize: requestSpeech,
        }),
    }, SpeakAction));
}
//# sourceMappingURL=index.js.map