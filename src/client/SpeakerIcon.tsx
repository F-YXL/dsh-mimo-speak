/**
 * The plugin's volume-style glyph: speaker cone with sound waves.
 *
 * First-party icons live in `dsh-client-ui-primitives`; this one belongs to
 * the plugin and follows the same `IconProps` contract (currentColor, square
 * edge), so it composes with product chrome without owning theme state.
 * @module dsh-mimo-speak/client/SpeakerIcon
 */

import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'

const Artwork = ({ size = 16, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
    focusable="false"
    className={className}
  >
    <path
      d="M2.5 6h2.1L8 3.2v9.6L4.6 10H2.5a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5z"
      fill="currentColor"
    />
    <path
      d="M10.2 5.6a3.4 3.4 0 0 1 0 4.8"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
    <path
      d="M12.6 3.6a6.6 6.6 0 0 1 0 8.8"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      opacity="0.65"
    />
  </svg>
)

/** Regular one-pixel volume artwork. */
export const IconVolumeOutlineRegular = (props: IconProps) => <Artwork {...props} />
