/**
 * The speak entry in the finalized assistant message's action strip: a volume
 * button that synthesizes the message with MiMo TTS, and — once audio exists —
 * a floating mini player with a draggable progress bar.
 *
 * Long replies are synthesized as a pipeline: the text is split at sentence
 * boundaries into small chunks, the first chunk starts playing as soon as it
 * lands, and the remaining chunks synthesize in the background while audio
 * plays, so the first sound arrives in seconds regardless of length.
 *
 * The button lives exactly where the platform keeps per-message actions
 * (between copy and branch). The player floats below the icon row so the row's
 * 28px chrome never reflows; while a player is open the strip stops fading on
 * hover-out (`styles.ts`), so audio stays visible wherever the pointer goes.
 * @module dsh-mimo-speak/client/SpeakAction
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import { IconLoadingOutlineRegular, IconWarningTriangleOutlineRegular, TextShimmer, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { briefText } from '../brief.ts'
import { toSpeakableText } from '../normalize.ts'
import { requestRecording, requestSpeech, requestSpeechStream, requestSummary, speechEngineOf, TtsClientError } from './api.ts'
import type { SpeechEngine } from './api.ts'
import { onAudioCaptureStart } from './audio-bus.ts'
import { latestAssistantMessageId, speakableTextFor } from './chat-text.ts'
import { findMessageContainer, SentenceHighlighter } from './highlight.ts'
import type { MimottsLocaleKey } from './locales.ts'
import { PlayerBar } from './PlayerBar.tsx'
import type { SpeakActionProps } from './slots.ts'
import { cachedSpeech, cacheSpeech, speechCacheKey } from './speech-cache.ts'
import type { CachedSpeech, SpeechSignature } from './speech-cache.ts'
import { splitForSpeech } from './split-speech.ts'
import { IconVolumeOutlineRegular } from './SpeakerIcon.tsx'
import { useAudioQueue } from './use-audio-queue.ts'
import { useStreamPlayer } from './use-stream-player.ts'

/** Lifecycle of one entry's audio. */
type SpeakPhase = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Map a failure onto the dictionary key the entry shows.
 * @param failure - the synthesis failure, or `empty` for a text-less message.
 * @returns the localized copy key.
 */
export function errorKeyFor(failure: TtsClientError | 'empty' | 'unconfigured'): MimottsLocaleKey {
  if (failure === 'empty') return 'emptyText'
  if (failure === 'unconfigured') return 'error.notConfigured'
  switch (failure.code) {
    case 'not-configured': return 'error.notConfigured'
    case 'bad-request': return 'error.badRequest'
    case 'text-too-long': return 'error.badRequest'
    case 'timeout': return 'error.timeout'
    case 'upstream-error': return 'error.upstream'
    case 'invalid-audio': return 'error.invalidAudio'
    case 'voice-sample-unreadable': return 'error.voiceSample'
    default: return 'error.generic'
  }
}

/** Whether a session snapshot is still producing the reply. */
function sessionRunning(session: unknown): boolean {
  try {
    if (session === null || typeof session !== 'object') return false
    const value = session as { running?: unknown; status?: unknown }
    if (value.running === true) return true
    return value.status === 'running' || value.status === 'busy'
  } catch {
    return false
  }
}

/**
 * Call one slot-provided selector hook defensively: an absent hook or a
 * throwing selector resolves to the fallback, so automatic reading silently
 * disables itself rather than crashing the action row.
 */
function useHostHook<T, S>(
  hook: ((selector: (snapshot: S) => T) => T) | undefined,
  selector: (snapshot: S) => T,
  fallback: T,
): T {
  if (typeof hook !== 'function') return fallback
  try {
    const value = hook(selector)
    return value === undefined || value === null ? fallback : value
  } catch {
    return fallback
  }
}

/**
 * Message ids that automatic reading already handled. Client memory only: a
 * page reload may replay the newest reply once, which beats silently never
 * speaking, and re-renders can never start the same reply twice.
 */
const autoReadLog = (() => {
  const seen = new Set<string>()
  const order: string[] = []
  return {
    has(id: string): boolean {
      return id !== '' && seen.has(id)
    },
    mark(id: string): void {
      if (id === '' || seen.has(id)) return
      seen.add(id)
      order.push(id)
      if (order.length > 200) {
        const oldest = order.shift()
        if (oldest !== undefined) seen.delete(oldest)
      }
    },
  }
})()

/**
 * Produce (or reuse) the object URL for one chunk.
 * @param text - one speakable chunk.
 * @param record - persist this chunk to the speech history (single-chunk
 * replies only, so history still captures short read-alouds).
 * @param signature - how the current configuration sounds; part of the key, so
 * a voice/style change never replays the previous take.
 * @param signal - aborts the request when the reader stops.
 * @returns the object URL of the audio and the engine that produced it.
 */
async function synthesizeChunkUrl(
  text: string,
  record: boolean,
  signature: SpeechSignature,
  signal?: AbortSignal,
): Promise<CachedSpeech> {
  const key = speechCacheKey(signature, text)
  const hit = cachedSpeech(key)
  if (hit !== undefined) return hit
  const blob = record ? (await requestRecording({ text })).blob : await requestSpeech({ text }, signal)
  const chunk: CachedSpeech = { url: URL.createObjectURL(blob), engine: speechEngineOf(blob) }
  cacheSpeech(key, chunk)
  return chunk
}

/** Keep only the chunks that fit inside the configured total budget. */
function budgetChunks(chunks: string[], maxChars: number): string[] {
  const selected: string[] = []
  let budget = Number.isFinite(maxChars) ? Math.max(0, Math.round(maxChars)) : 2000
  for (const chunk of chunks) {
    if (budget <= 0) break
    selected.push(chunk)
    budget -= chunk.length
  }
  return selected
}

/**
 * Render one message's speak control and open player.
 * @param props - the message identity, the injected engine verbs, the Chat
 * selector hook, and localized copy.
 * @returns the volume button with its optional player and failure notice.
 */
export function SpeakAction(props: SpeakActionProps) {
  const { messageId, useChat, useStatus, ensureStatus, t } = props
  // The assistant-actions seat also carries a session hook, but its presence
  // varies across surface versions, so it is read defensively.
  const useSession = (props as unknown as { useSession?: (selector: (session: unknown) => boolean) => boolean }).useSession
  const status = useStatus(snapshot => snapshot)
  /**
   * Fingerprint of the current voice/model/endpoint. It is part of the replay
   * cache key, so a settings change can never replay the previous take.
   */
  const signatureRef = useRef<SpeechSignature>({
    voice: '', model: '', style: '', baseUrl: '', edgeVoice: '', maxChars: 0,
  })
  signatureRef.current = {
    voice: status.voice,
    model: status.model,
    // Style is not part of the status payload; a settings save clears the cache.
    style: '',
    baseUrl: status.baseUrl,
    edgeVoice: status.edgeVoice,
    maxChars: status.maxChars,
  }
  /** The panel only exists to host the progress bar; without it the button is the control. */
  const showProgressBar = status.progressBar === true
  const rawText = useChat(snapshot => speakableTextFor(snapshot, messageId, status.readScope))
  const latestId = useHostHook(useChat, (snapshot: ChatSnapshot) => latestAssistantMessageId(snapshot), '')
  const running = useHostHook(useSession, sessionRunning, false)
  const speakable = useMemo(() => (rawText === undefined ? undefined : toSpeakableText(rawText)), [rawText])
  const [phase, setPhase] = useState<SpeakPhase>('idle')
  const [failure, setFailure] = useState<TtsClientError | 'empty' | 'unconfigured' | null>(null)
  /** The reply exceeded the character budget, so only its opening is spoken. */
  const [truncated, setTruncated] = useState(false)
  const {
    state: playerState,
    enqueue: playerEnqueue,
    clear: playerClear,
    toggle: playerToggle,
    seek: playerSeek,
    pause: playerPause,
  } = useAudioQueue()
  const streamPlayer = useStreamPlayer()
  // Which engine is driving the open player: the chunked WAV queue or the
  // progressive PCM stream. The stream is the fast path; the queue is the
  // fallback for clone voices and for streams the provider refuses.
  const [mode, setMode] = useState<'queue' | 'stream' | null>(null)
  /** Engine that actually answered this read; `edge` means MiMo failed. */
  const [engineUsed, setEngineUsed] = useState<SpeechEngine | null>(null)
  const activeState = mode === 'stream' ? streamPlayer.state : playerState
  const activeToggle = useCallback(() => {
    if (mode === 'stream') streamPlayer.toggle()
    else playerToggle()
  }, [mode, playerToggle, streamPlayer])
  const activePause = useCallback(() => {
    if (mode === 'stream') streamPlayer.pause()
    else playerPause()
  }, [mode, playerPause, streamPlayer])
  const activeSeek = useCallback((seconds: number) => {
    if (mode === 'stream') return
    playerSeek(seconds)
  }, [mode, playerSeek])
  const clearPlayers = useCallback(() => {
    playerClear()
    streamPlayer.clear()
    cuesRef.current = []
    cueCursorRef.current = 0
    keyOffsetRef.current = 0
    setMode(null)
  }, [playerClear, streamPlayer])
  /**
   * Stop the current read-aloud for good: abort the stream in flight, drop the
   * scheduled audio, and invalidate the run so no further sentence is asked
   * for. This is the control the speaker button offers while it is playing.
   */
  /**
   * Pause the current read-aloud and stop asking for the rest of the reply.
   * Whatever is already scheduled stays buffered, so resuming plays that much;
   * `finish()` lets the player report the end once the buffer drains instead of
   * waiting forever for sentences that will never arrive.
   */
  const pauseRun = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    if (mode === 'stream') streamPlayer.finish()
    activePause()
  }, [activePause, mode, streamPlayer])

  /** The panel's transport: pause also aborts the sentences still to come. */
  const panelToggle = useCallback(() => {
    if (activeState.playing) pauseRun()
    else activeToggle()
  }, [activeState.playing, pauseRun, activeToggle])

  const stopRun = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    // Invalidate the run: every loop checks this before its next request.
    sessionRef.current += 1
    clearPlayers()
    highlighterRef.current?.clear()
    highlighterRef.current = null
    cuesRef.current = []
    cueCursorRef.current = 0
    keyOffsetRef.current = 0
    setTruncated(false)
    setPhase('idle')
    setFailure(null)
    setPanelOpen(false)
  }, [clearPlayers])

  // The highlighter in use while the current message plays, if any.
  const highlighterRef = useRef<SentenceHighlighter | null>(null)
  /** Sentence cues: the audio second each chunk starts at, plus its text. */
  const cuesRef = useRef<{ at: number; text: string }[]>([])
  /** How many cues the paint effect already consumed. */
  const cueCursorRef = useRef(0)
  /** Folded-key offset of the last painted sentence, so repeats pair up. */
  const keyOffsetRef = useRef(0)
  // Panel visibility is decoupled from whether audio exists, so it can be
  // dismissed (click-outside / Esc) without discarding the audio source.
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelSide, setPanelSide] = useState<'left' | 'right'>('right')
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelId = useId()
  // Bumped on every fresh synthesis so a stale run stops enqueueing chunks.
  const sessionRef = useRef(0)
  /**
   * In-flight synthesis of the current run. Aborting it is what actually stops
   * playback: suspending the AudioContext alone leaves the remaining sentences
   * streaming in behind the pause, and they all land on resume.
   */
  const abortRef = useRef<AbortController | null>(null)

  // When the panel opens, flip it left when the speaker sits near the right
  // edge of the viewport, so the floating bar never overflows the window.
  useEffect(() => {
    if (!panelOpen) return
    const root = rootRef.current
    if (root === null) return
    const bounds = root.getBoundingClientRect()
    setPanelSide(bounds.right + 288 > window.innerWidth ? 'left' : 'right')
  }, [panelOpen])

  // Dismiss the floating panel on outside click; it only ever wraps the
  // progress bar, so folding it away leaves playback alone.
  useEffect(() => {
    if (!panelOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current
      if (root !== null && root.contains(event.target as Node)) return
      setPanelOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [panelOpen])

  // Talking over the reader: the moment the microphone opens (the official
  // voice-input bundle records through getUserMedia) the read-aloud stops, so
  // the recorder never captures the assistant's own voice.
  const muteWhileRecording = status.muteWhileRecording !== false
  useEffect(() => {
    if (!muteWhileRecording) return
    return onAudioCaptureStart(() => { stopRun() })
  }, [muteWhileRecording, stopRun])

  // Escape is an explicit cancel and works with or without the panel: only the
  // entry that is actually speaking reacts, and focus returns to its button so
  // keyboard users are not dropped into the void.
  useEffect(() => {
    if (!activeState.playing && phase !== 'loading') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      stopRun()
      buttonRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [activeState.playing, phase, stopRun])

  // Chunked fallback: split the reply, then synthesize chunks sequentially
  // while the queue keeps playing them back-to-back. The first chunk gates the
  // visible "ready" transition; later chunks just keep the queue stocked.
  const chunkedRun = useCallback(async (gen: number, chunks: string[], signal?: AbortSignal) => {
    setMode('queue')
    /** @returns whether this run was cancelled by the reader. */
    const cancelled = (): boolean => gen !== sessionRef.current || (signal !== undefined && signal.aborted)
    try {
      let first = true
      for (let index = 0; index < chunks.length; index += 1) {
        // Stop between chunks: a cancelled run must not keep synthesizing.
        if (cancelled()) return
        const record = chunks.length === 1
        const chunkAudio = await synthesizeChunkUrl(chunks[index], record, signatureRef.current, signal)
        if (gen !== sessionRef.current) return
        if (chunkAudio.engine === 'edge') setEngineUsed('edge')
        playerEnqueue(chunkAudio.url)
        if (first) {
          first = false
          setPhase('ready')
        }
      }
    } catch (error: unknown) {
      // A cancelled run is not a failure: the reader asked it to stop.
      if (cancelled()) return
      setPhase('error')
      setFailure(error instanceof TtsClientError ? error : new TtsClientError('generic', String(error)))
    }
  }, [playerEnqueue])

  // Sentence-level streaming: each sentence is one PCM stream, so its first
  // chunk is audible within a second while later sentences stream in the
  // background. Sentence boundaries also drive the highlight. When streaming
  // is refused (clone voice, provider, mid-sentence failure) the chunked
  // pipeline takes over, which carries the Edge fallback.
  const streamRun = useCallback(async (gen: number, chunks: string[], messageText: string, signal?: AbortSignal) => {
    setMode('stream')
    highlighterRef.current?.clear()
    highlighterRef.current = status.highlight
      ? new SentenceHighlighter(findMessageContainer(rootRef.current, messageText))
      : null
    cuesRef.current = []
    cueCursorRef.current = 0
    keyOffsetRef.current = 0
    /** @returns whether this run was cancelled by the reader. */
    const cancelled = (): boolean => gen !== sessionRef.current || (signal !== undefined && signal.aborted)
    let gotFirst = false
    for (let index = 0; index < chunks.length; index += 1) {
      // Every sentence asks for its own stream: a cancelled run stops here
      // instead of synthesizing the rest of the reply in the background.
      if (cancelled()) return
      const chunk = chunks[index]
      let chunkStarted = false
      try {
        await requestSpeechStream({ text: chunk }, (pcm) => {
          if (gen !== sessionRef.current) return
          if (!chunkStarted) {
            chunkStarted = true
            if (!gotFirst) {
              gotFirst = true
              setPhase('ready')
            }
            // Record when this sentence will actually be heard, so the
            // highlight follows playback rather than synthesis arrival.
            cuesRef.current.push({ at: streamPlayer.scheduled(), text: chunk })
          }
          streamPlayer.feed(pcm)
        }, signal)
        if (gen !== sessionRef.current) return
      } catch (error) {
        // Cancellation is the reader stopping, not an upstream failure: drop
        // the run without falling back to another engine.
        if (cancelled()) return
        // The rest of the reply falls back to the chunked pipeline.
        streamPlayer.clear()
        highlighterRef.current?.clear()
        highlighterRef.current = null
        cuesRef.current = []
        cueCursorRef.current = 0
        await chunkedRun(gen, chunks.slice(index), signal)
        return
      }
    }
    if (gen !== sessionRef.current) return
    if (!gotFirst) {
      highlighterRef.current?.clear()
      highlighterRef.current = null
      await chunkedRun(gen, chunks, signal)
      return
    }
    streamPlayer.finish()
  }, [chunkedRun, status.highlight, streamPlayer])

  // Paint each sentence when playback reaches it, not when it was synthesized:
  // the streamer synthesizes ahead of playback, so arrival-time painting runs
  // ahead of the voice and looks chaotic.
  useEffect(() => {
    if (mode !== 'stream') return
    const highlighter = highlighterRef.current
    if (highlighter === null || !highlighter.supported) return
    const cues = cuesRef.current
    const now = activeState.currentTime + 0.08
    while (cueCursorRef.current < cues.length && cues[cueCursorRef.current].at <= now) {
      const cue = cues[cueCursorRef.current]
      cueCursorRef.current += 1
      keyOffsetRef.current = highlighter.show(cue.text, keyOffsetRef.current)
    }
  }, [activeState.currentTime, mode])

  const runSynthesis = useCallback(async (input: string) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const gen = ++sessionRef.current
    setEngineUsed(null)
    clearPlayers()
    highlighterRef.current?.clear()
    highlighterRef.current = null
    cuesRef.current = []
    cueCursorRef.current = 0
    keyOffsetRef.current = 0
    setPhase('loading')
    setFailure(null)
    // With no progress bar there is nothing to put in a panel: keep it shut.
    if (status.progressBar === true) setPanelOpen(true)

    // Brief read-aloud is a summary, not a selection: ask the configured model
    // to condense the reply, and fall back to the offline extractive rule when
    // no model answers. Everything downstream (chunking, highlight, cache)
    // then works on the summary like on any other text.
    let spoken = input
    if (status.readScope === 'brief') {
      const summarized = await requestSummary(input, controller.signal).catch(() => undefined)
      if (controller.signal.aborted || gen !== sessionRef.current) return
      spoken = summarized ?? briefText(input, 260, 6, t('briefPrefix'))
    }

    const all = splitForSpeech(spoken, status.chunkChars)
    const chunks = budgetChunks(all, status.maxChars)
    // Never drop content silently: the panel says the reply was cut short.
    setTruncated(chunks.length < all.length)
    if (chunks.length === 0) {
      setPhase('idle')
      setFailure('empty')
      return
    }
    if (status.hasVoiceSample) {
      void chunkedRun(gen, chunks, controller.signal)
      return
    }
    void streamRun(gen, chunks, spoken, controller.signal)
  }, [chunkedRun, clearPlayers, status.chunkChars, status.hasVoiceSample, status.maxChars, status.progressBar, status.readScope, streamRun, t])

  /**
   * Start a read-aloud. Kept stable for the effects: cancellation lives inside
   * `runSynthesis`, so callers can fire and forget.
   */
  const synthesize = useCallback((input: string) => { void runSynthesis(input) }, [runSynthesis])


  // The highlight belongs to the playback: clear it when the stream ends.
  useEffect(() => {
    if (activeState.ended) {
      highlighterRef.current?.clear()
      highlighterRef.current = null
    }
  }, [activeState.ended])

  const hasAudio = phase === 'ready'
  // Ready, not ended, still at 0:00 and not playing: autoplay was refused.
  const autoplayBlocked = hasAudio && !activeState.playing && !activeState.ended && activeState.currentTime === 0

  const onClick = useCallback(() => {
    if (phase === 'loading') {
      // Second press while synthesizing is a cancel, not a no-op.
      stopRun()
      return
    }
    if (hasAudio) {
      if (activeState.ended) {
        // Replay: the chunked path replays from cache; the stream re-synthesizes.
        if (speakable !== undefined && speakable !== '') void synthesize(speakable)
        return
      }
      if (!showProgressBar) {
        // No panel: the button itself reads play/stop. Stopping cancels the
        // run, so the rest of the reply is never synthesized behind it.
        if (activeState.playing) stopRun()
        else activeToggle()
        return
      }
      if (!panelOpen) setPanelOpen(true)
      panelToggle()
      return
    }
    if (speakable === undefined || speakable === '') {
      setFailure('empty')
      return
    }
    if (!status.configured) {
      setFailure('unconfigured')
      return
    }
    void synthesize(speakable)
  }, [phase, hasAudio, activeState.playing, activeState.ended, speakable, panelOpen, panelToggle, showProgressBar, status.configured, synthesize, stopRun])

  // Automatic read-aloud: the newest finished reply speaks once, and only
  // while this entry is idle, so a manual read or an older reply is never
  // interrupted. The browser may still block audible autoplay without a prior
  // user gesture — the audio lands ready, and one tap on the speaker plays it.
  const autoRead = status.autoRead === true
  useEffect(() => {
    if (!autoRead) return
    if (messageId === '' || messageId !== latestId) return
    if (running) return
    if (speakable === undefined || speakable === '') return
    if (!status.configured) return
    if (autoReadLog.has(messageId)) return
    if (phase !== 'idle') return
    const timer = window.setTimeout(() => {
      if (autoReadLog.has(messageId)) return
      autoReadLog.mark(messageId)
      void synthesize(speakable)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [autoRead, latestId, messageId, running, speakable, phase, status.configured, synthesize])

  // The panel is the progress bar's home. With the bar off it only appears to
  // report a problem, so a plain read-aloud click shows nothing at all.
  const fallbackNote = engineUsed === 'edge'
  const panelVisible = showProgressBar
    ? panelOpen && (hasAudio || phase === 'loading')
    : hasAudio && (failure !== null || autoplayBlocked || truncated || fallbackNote)
  const buttonLabel = phase === 'loading'
    ? t('synthesize')
    : activeState.playing
      // Without the progress bar the button stops the read-aloud outright.
      ? (showProgressBar ? t('pause') : t('stop'))
      : hasAudio
        ? t('play')
        : t('speak')

  return (
    <span ref={rootRef} className={hasAudio ? 'mimo-speak-root mimo-speak-open' : 'mimo-speak-root'}>
      <Tooltip label={buttonLabel} side="bottom">
        <button
          ref={buttonRef}
          type="button"
          className={phase === 'loading' ? 'mimo-speak-button mimo-speak-buttonBusy' : 'mimo-speak-button'}
          aria-label={buttonLabel}
          aria-busy={phase === 'loading'}
          aria-pressed={activeState.playing}
          aria-expanded={panelVisible}
          aria-controls={panelId}
          onClick={onClick}
          onMouseEnter={ensureStatus}
          onFocus={ensureStatus}
        >
          {phase === 'loading'
            ? <span className="mimo-speak-spin"><IconLoadingOutlineRegular size={15} /></span>
            : <IconVolumeOutlineRegular size={15} />}
        </button>
      </Tooltip>
      {failure !== null
        ? (
          <Tooltip label={t(errorKeyFor(failure))} side="bottom">
            <span className="mimo-speak-failure" role="img" tabIndex={0} aria-label={t(errorKeyFor(failure))}>
              <IconWarningTriangleOutlineRegular size={14} />
            </span>
          </Tooltip>
        )
        : null}
      {panelVisible
        ? (
          <span id={panelId} className={panelSide === 'left' ? 'mimo-speak-panel mimo-speak-panelLeft' : 'mimo-speak-panel'}>
            {phase === 'loading'
              ? (
                <span className="mimo-speak-panelNote" role="status">
                  <TextShimmer active>{t('synthesize')}</TextShimmer>
                </span>
              )
              : (
                <PlayerBar
                  state={activeState}
                  onToggle={panelToggle}
                  onSeek={activeSeek}
                  seekable={mode !== 'stream'}
                  // The track is optional: with it off the panel keeps only the
                  // transport button, which is all most replies need.
                  compact={showProgressBar !== true}
                  labels={{ play: t('play'), pause: t('pause'), progress: t('progress') }}
                />
              )}
            {failure !== null
              ? <p className="mimo-speak-panelStatus" role="status">{t(errorKeyFor(failure))}</p>
              : null}
            {failure === null && autoplayBlocked
              ? <p className="mimo-speak-panelNote" role="status">{t('autoplayHint')}</p>
              : null}
            {failure === null && truncated
              ? <p className="mimo-speak-panelNote" role="status">{t('truncated')}</p>
              : null}
            {failure === null && fallbackNote
              ? <p className="mimo-speak-panelNote" role="status">{t('fallbackUsed')}</p>
              : null}
          </span>
        )
        : null}
    </span>
  )
}
