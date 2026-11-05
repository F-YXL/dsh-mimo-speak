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
//# sourceMappingURL=slots.js.map