/**
 * The compact player bar: play/pause, a draggable progress track, and the
 * position/duration readout.
 *
 * The track is a `role="slider"` surface — pointer drag with capture,
 * click-to-seek, and arrow-key seeking — so the progress bar is operable
 * without a pointer. Dragging seeks continuously: WAV playback from an object
 * URL repositions cheaply, and the thumb follows the pointer instead of
 * lagging behind it.
 * @module dsh-mimo-speak/client/PlayerBar
 */

import { useCallback, useRef, useState } from 'react'
import { IconPauseOutlineRegular, IconPlayOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AudioPlayerState } from './use-audio-player.ts'

/** Copy the bar renders, already localized by its caller. */
export interface PlayerBarLabels {
  /** Accessible name of the play control while paused. */
  play: string
  /** Accessible name of the pause control while playing. */
  pause: string
  /** Accessible name of the progress slider. */
  progress: string
}

/** What the bar needs from its player. */
export interface PlayerBarProps {
  /** Live playback state. */
  state: AudioPlayerState
  /** Start or pause playback. */
  onToggle: () => void
  /** @param seconds - absolute position to seek to. */
  onSeek: (seconds: number) => void
  /** Localized control names. */
  labels: PlayerBarLabels
  /** Whether the track accepts seek gestures; streaming audio cannot seek. */
  seekable?: boolean
  /**
   * Render only the play/pause control, with no track and no clock. Callers
   * that hide the progress bar still need a transport control.
   */
  compact?: boolean
}

/** Format seconds as `m:ss` (clamped at zero; durations are short). */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const remainder = whole % 60
  return `${String(minutes)}:${remainder < 10 ? '0' : ''}${String(remainder)}`
}

/**
 * Render one player bar.
 * @param props - playback state, controls, and localized names.
 * @returns the play control, the seekable track, and the time readout.
 */
export function PlayerBar({ state, onToggle, onSeek, labels, seekable = true, compact = false }: PlayerBarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const duration = state.duration > 0 ? state.duration : 0
  const ratio = duration > 0 ? Math.min(1, state.currentTime / duration) : 0

  /** @param clientX - pointer x in viewport coordinates. @returns the seek target in seconds. */
  const positionAt = useCallback((clientX: number): number => {
    const track = trackRef.current
    if (track === null) return 0
    const bounds = track.getBoundingClientRect()
    const fraction = bounds.width > 0
      ? Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
      : 0
    return fraction * duration
  }, [duration])

  const playButton = (
    <button
      type="button"
      className="mimo-speak-barButton"
      aria-label={state.playing ? labels.pause : labels.play}
      onClick={onToggle}
    >
      {state.playing ? <IconPauseOutlineRegular size={14} /> : <IconPlayOutlineRegular size={14} />}
    </button>
  )

  if (compact) {
    return <div className="mimo-speak-bar mimo-speak-barCompact">{playButton}</div>
  }

  return (
    <div className="mimo-speak-bar">
      {playButton}
      <div
        ref={trackRef}
        className={dragging ? 'mimo-speak-track mimo-speak-trackDragging' : seekable ? 'mimo-speak-track' : 'mimo-speak-track mimo-speak-trackStatic'}
        role="slider"
        tabIndex={seekable ? 0 : -1}
        aria-label={labels.progress}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.round(duration))}
        aria-valuenow={Math.round(state.currentTime)}
        aria-valuetext={`${clock(state.currentTime)} / ${clock(duration)}`}
        onPointerDown={seekable ? (event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
          onSeek(positionAt(event.clientX))
        } : undefined}
        onPointerMove={seekable ? (event) => {
          if (!dragging) return
          onSeek(positionAt(event.clientX))
        } : undefined}
        onPointerUp={seekable ? (event) => {
          if (!dragging) return
          setDragging(false)
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          onSeek(positionAt(event.clientX))
        } : undefined}
        onPointerCancel={seekable ? () => { setDragging(false) } : undefined}
        onKeyDown={seekable ? (event) => {
          const step = event.shiftKey ? 15 : 5
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            event.preventDefault()
            onSeek(state.currentTime + step)
          } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            event.preventDefault()
            onSeek(state.currentTime - step)
          } else if (event.key === 'Home') {
            event.preventDefault()
            onSeek(0)
          } else if (event.key === 'End' && duration > 0) {
            event.preventDefault()
            onSeek(duration)
          }
        } : undefined}
      >
        <div className="mimo-speak-fill" style={{ width: `${(ratio * 100).toFixed(2)}%` }} />
        <div className="mimo-speak-thumb" style={{ left: `${(ratio * 100).toFixed(2)}%` }} />
      </div>
      <span className="mimo-speak-time">{clock(state.currentTime)}{seekable ? ` / ${clock(duration)}` : ''}</span>
    </div>
  )
}
