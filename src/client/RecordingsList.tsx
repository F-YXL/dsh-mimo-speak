/**
 * The speech-history browser: every recorded text, each with its versions.
 * Versions play in place, re-synthesize against the current engine settings
 * (appending a fresh take, old ones kept), or get deleted. There is no
 * dedicated comparison view — per the design, each take is played on its own.
 * @module dsh-mimo-speak/client/RecordingsList
 */

import { useCallback, useEffect, useState } from 'react'
import {
  deleteRecordingVersion, fetchRecordings, recordingFileUrl, resynthesizeRecording, TtsClientError,
} from './api.ts'
import { pauseOtherAudio, registerAudioPauser } from './audio-bus.ts'
import type { TtsRecordingsIndex } from '../settings.ts'
import type { MimottsLocaleKey } from './locales.ts'

/** Identity this list registers with the shared audio bus. */
const LIST_TOKEN = {}

/**
 * Pause every other `<audio>` on the page.
 * @param current - the element that just started; never paused.
 */
function pauseSiblings(current?: HTMLAudioElement): void {
  for (const element of document.querySelectorAll('audio')) {
    if (element === current) continue
    if (!element.paused) element.pause()
  }
}

/** Props: the localized copy function bound to this plugin's dictionary. */
export interface RecordingsListProps {
  t: (key: MimottsLocaleKey) => string
}

/**
 * Render the persisted speech history with per-version playback, re-synthesis,
 * and deletion.
 * @param props - localized copy.
 * @returns the history list, or an empty-state note before the first load.
 */
export function RecordingsList({ t }: RecordingsListProps) {
  const [index, setIndex] = useState<TtsRecordingsIndex | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyRec, setBusyRec] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    fetchRecordings()
      .then(setIndex)
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure)))
  }, [])

  useEffect(() => { load() }, [load])

  // One voice at a time: a history clip stops the message reader, and the
  // message reader stops a history clip. Without this, two takes — or a take
  // and a live reply — talk over each other.
  useEffect(() => registerAudioPauser(LIST_TOKEN, () => { pauseSiblings() }), [])

  const onResynth = useCallback((recId: string) => {
    setBusyRec(recId)
    resynthesizeRecording(recId)
      .then(load)
      .catch((failure: unknown) => setError(failure instanceof TtsClientError ? failure.message : String(failure)))
      .finally(() => setBusyRec(null))
  }, [load])

  const onDelete = useCallback((recId: string, verId: string) => {
    deleteRecordingVersion(recId, verId)
      .then(load)
      .catch((failure: unknown) => setError(failure instanceof TtsClientError ? failure.message : String(failure)))
  }, [load])

  // A failed first load has no index yet: show the reason instead of claiming
  // the history is empty.
  if (index === null) {
    return error === null
      ? <p className="mimo-speak-recordingsEmpty">{t('recordingsEmpty')}</p>
      : <p className="mimo-speak-fieldError" role="status">{error}</p>
  }
  if (index.entries.length === 0) {
    return <p className="mimo-speak-recordingsEmpty">{t('recordingsEmpty')}</p>
  }
  return (
    <div className="mimo-speak-recordings">
      {error !== null ? <p className="mimo-speak-fieldError" role="status">{error}</p> : null}
      {index.entries.map((entry) => (
        <div key={entry.id} className="mimo-speak-recording">
          <p className="mimo-speak-recordingText" title={entry.text}>{entry.text}</p>
          <ul className="mimo-speak-versions">
            {entry.versions.map((version) => (
              <li key={version.id} className="mimo-speak-version">
                <audio
                  className="mimo-speak-versionAudio"
                  src={recordingFileUrl(entry.id, version.id)}
                  controls
                  preload="none"
                  onPlay={(event) => {
                    pauseOtherAudio(LIST_TOKEN)
                    pauseSiblings(event.currentTarget)
                  }}
                />
                <span className="mimo-speak-versionMeta">
                  {new Date(version.createdAt).toLocaleString()}
                  {version.voice !== null ? ` · ${version.voice}` : ''}
                  {version.style !== null ? ` · ${version.style}` : ''}
                </span>
                <button
                  type="button"
                  className="mimo-speak-recButton"
                  disabled={busyRec === entry.id}
                  onClick={() => { onResynth(entry.id) }}
                >
                  {busyRec === entry.id ? t('reSynthesizing') : t('reSynthesize')}
                </button>
                <button
                  type="button"
                  className="mimo-speak-recButton"
                  onClick={() => { onDelete(entry.id, version.id) }}
                >
                  {t('deleteVersion')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
