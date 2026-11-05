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
import type { BundleConfigCardProps } from './slots.ts';
/**
 * Render the plugin's configuration card.
 * @param props - localized copy, the staged form snapshot, and its actions.
 * @returns the configuration form with its sample player, or null for a view
 * this slot does not render (bundle configuration is page-only).
 */
export declare function BundleConfigCard({ view, useForm, edit, resetField, save, discard, synthesize, test, t }: BundleConfigCardProps): import("react").JSX.Element | null;
