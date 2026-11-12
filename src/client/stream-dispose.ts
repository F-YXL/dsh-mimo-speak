/**
 * Framework-free scheduling core of the progressive PCM stream player.
 *
 * `use-stream-player` keeps its playback bookkeeping in React refs so the
 * scheduled-chunk timeline survives renders. Those refs also survive unmount,
 * and an in-flight SSE callback can call `feed()` after the component is gone;
 * without a guard that call rebuilds the AudioContext and resumes scheduling.
 *
 * The mutable scheduling lives here as two seams:
 * - `StreamTimeline` owns the disposed flag and the timing fields.
 * - `createStreamSink` owns the whole playback state machine behind an injected
 *   `AudioContext` factory, so `feed` can be driven from Node tests with a fake
 *   context and assert that a disposed sink never creates one.
 * @module dsh-mimo-speak/client/stream-dispose
 */

/** The player fields an in-flight callback could still reach after dispose. */
export interface StreamTimeline {
  /** True after dispose until the next setup; every mutating control no-ops. */
  disposed: boolean
  /** Whether audio is currently advancing. */
  playing: boolean
  /** Whether the stream was marked complete. */
  finished: boolean
  /** Context time the next chunk starts at. */
  nextAt: number
  /** Total scheduled audio, in seconds. */
  totalDuration: number
}

/** A fresh, live timeline. */
export function createStreamTimeline(): StreamTimeline {
  return { disposed: false, playing: false, finished: false, nextAt: 0, totalDuration: 0 }
}

/**
 * Whether one more chunk may be scheduled. This is the single decision point
 * `feed` consults before it touches the context factory, so a disposed player
 * can never rebuild its `AudioContext`.
 * @param timeline - the player's live bookkeeping.
 */
export function streamShouldFeed(timeline: StreamTimeline): boolean {
  return !timeline.disposed
}

/**
 * The context time the next chunk should start at: never earlier than the
 * timeline's back-to-back position, and never before the context clock.
 * @param timeline - the player's live bookkeeping.
 * @param ctxNow - the current `AudioContext.currentTime`.
 */
export function feedStartAt(timeline: StreamTimeline, ctxNow: number): number {
  return Math.max(timeline.nextAt, ctxNow + 0.02)
}

/** Record that one chunk of `duration` seconds started at `when`. */
export function recordScheduledChunk(timeline: StreamTimeline, when: number, duration: number): void {
  timeline.nextAt = when + duration
  timeline.totalDuration += duration
}

/** Disable the player and reset every field a late callback could misuse. */
export function disposeStreamTimeline(timeline: StreamTimeline): void {
  timeline.disposed = true
  timeline.playing = false
  timeline.finished = false
  timeline.nextAt = 0
  timeline.totalDuration = 0
}

/** Re-enable after a remount (StrictMode setup or in-place re-entry). */
export function resetStreamTimeline(timeline: StreamTimeline): void {
  timeline.disposed = false
}

/** Live playback state the sink publishes. */
export interface StreamState {
  /** Whether audio is currently advancing. */
  playing: boolean
  /** Current position in seconds. */
  currentTime: number
  /** Total scheduled audio, in seconds. */
  duration: number
  /** Whether playback ran to the end. */
  ended: boolean
}

/** The slice of `AudioContext` the sink schedules on. */
export interface StreamAudioContext {
  readonly currentTime: number
  readonly state: string
  readonly destination: unknown
  createBuffer(channels: number, length: number, sampleRate: number): StreamAudioBuffer
  createBufferSource(): StreamBufferSource
  resume(): Promise<void>
  suspend(): Promise<void>
  close(): Promise<void>
}

/** A decoded chunk handed to the context. */
export interface StreamAudioBuffer {
  readonly duration: number
  copyToChannel(source: Float32Array, channelNumber: number): void
}

/** A scheduled buffer source. */
export interface StreamBufferSource {
  buffer: unknown
  connect(destination: unknown): void
  start(when?: number): void
  stop(): void
  onended: (() => void) | null
}

/** External effects the sink reaches for, injected so tests stay browser-free. */
export interface StreamSinkDeps {
  /** Create the context on first use; the hook passes `new AudioContext(...)`. */
  createContext: () => StreamAudioContext
  /** Publish a partial state update (the hook mirrors this into React state). */
  onState: (patch: Partial<StreamState>) => void
  /** Start the progress tick. */
  setInterval: (handler: () => void, ms: number) => unknown
  /** Stop the progress tick. */
  clearInterval: (handle: unknown) => void
  /** Pause every other plugin player before this one starts. */
  onStart: () => void
}

/** What the sink gives its hook. */
export interface StreamSink {
  feed: (pcm: Uint8Array) => void
  finish: () => void
  clear: () => void
  toggle: () => void
  pause: () => void
  scheduled: () => number
  /** Permanently stop this sink; every mutating control becomes a no-op. */
  dispose: () => void
  /** Revive after an in-place remount (React StrictMode double-invoke). */
  revive: () => void
}

const IDLE: StreamState = { playing: false, currentTime: 0, duration: 0, ended: false }

/**
 * Bind one context to a stream of PCM chunks.
 * @param deps - injected context factory, state publisher, timers and bus hook.
 * @returns scheduling controls plus dispose/revive.
 */
export function createStreamSink(deps: StreamSinkDeps): StreamSink {
  const timeline = createStreamTimeline()
  let ctx: StreamAudioContext | null = null
  let sources: StreamBufferSource[] = []
  let startedAt = 0
  let playedBeforePause = 0
  let tick: unknown = null

  const publish = (patch: Partial<StreamState>): void => { deps.onState(patch) }

  const clearTick = (): void => {
    if (tick !== null) {
      deps.clearInterval(tick)
      tick = null
    }
  }

  const syncProgress = (): void => {
    if (ctx === null || !timeline.playing) return
    const elapsed = Math.max(0, ctx.currentTime - startedAt)
    publish({ currentTime: playedBeforePause + elapsed })
  }

  const startTick = (): void => {
    clearTick()
    tick = deps.setInterval(syncProgress, 200)
  }

  const ensureCtx = (): StreamAudioContext => {
    if (ctx === null) ctx = deps.createContext()
    return ctx
  }

  const stopSources = (): void => {
    for (const source of sources) {
      try {
        source.stop()
      } catch {
        // Already stopped.
      }
    }
    sources = []
  }

  const maybeEnded = (): void => {
    if (!timeline.finished || !timeline.playing) return
    if (sources.length > 0) return
    const total = timeline.totalDuration
    const played = playedBeforePause + (ctx !== null ? Math.max(0, ctx.currentTime - startedAt) : 0)
    if (played >= total - 0.05) {
      timeline.playing = false
      clearTick()
      publish({ playing: false, ended: true, currentTime: 0 })
    }
  }

  const feed = (pcm: Uint8Array): void => {
    // The single guard against the resume-after-unmount bug: after dispose a
    // late SSE chunk must not rebuild the AudioContext, so this check runs
    // before the context factory is ever reached.
    if (!streamShouldFeed(timeline)) return
    const context = ensureCtx()
    let resumePromise: Promise<void> = Promise.resolve()
    if (!timeline.playing) {
      timeline.playing = true
      timeline.finished = false
      playedBeforePause = 0
      timeline.totalDuration = 0
      startedAt = context.currentTime + 0.08
      timeline.nextAt = startedAt
      deps.onStart()
      resumePromise = context.state === 'suspended' ? context.resume().catch(() => {}) : Promise.resolve()
      startTick()
    }
    const length = Math.floor(pcm.length / 2)
    if (length === 0) return
    const floats = new Float32Array(length)
    const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    for (let index = 0; index < length; index += 1) {
      floats[index] = view.getInt16(index * 2, true) / 32768
    }
    const buffer = context.createBuffer(1, length, PCM_SAMPLE_RATE)
    buffer.copyToChannel(floats, 0)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    const when = feedStartAt(timeline, context.currentTime)
    source.start(when)
    recordScheduledChunk(timeline, when, buffer.duration)
    sources.push(source)
    source.onended = () => {
      sources = sources.filter(item => item !== source)
      maybeEnded()
    }
    publish({
      playing: context.state === 'running',
      ended: false,
      duration: timeline.totalDuration,
    })
    if (context.state !== 'running') {
      void resumePromise.then(() => {
        if (timeline.playing) publish({ playing: context.state === 'running' })
      })
    }
  }

  const finish = (): void => {
    if (!streamShouldFeed(timeline)) return
    timeline.finished = true
    maybeEnded()
  }

  const clear = (): void => {
    if (!streamShouldFeed(timeline)) return
    stopSources()
    timeline.playing = false
    timeline.finished = false
    timeline.totalDuration = 0
    clearTick()
    publish(IDLE)
  }

  const toggle = (): void => {
    if (!streamShouldFeed(timeline)) return
    const context = ensureCtx()
    if (timeline.playing) {
      if (context.state === 'suspended') {
        void context.resume().catch(() => {})
        return
      }
      void context.suspend().catch(() => {})
      const elapsed = Math.max(0, context.currentTime - startedAt)
      playedBeforePause += elapsed
      clearTick()
      publish({ playing: false })
      return
    }
    void context.resume().catch(() => {})
    startedAt = context.currentTime
    timeline.playing = true
    timeline.finished = timeline.finished && sources.length === 0
    startTick()
    publish({ playing: true, ended: false })
  }

  const pause = (): void => {
    if (!streamShouldFeed(timeline)) return
    if (ctx === null || !timeline.playing) return
    if (ctx.state === 'suspended') {
      clearTick()
      publish({ playing: false })
      return
    }
    const elapsed = Math.max(0, ctx.currentTime - startedAt)
    playedBeforePause += elapsed
    void ctx.suspend().catch(() => {})
    clearTick()
    publish({ playing: false })
  }

  const scheduled = (): number => {
    return timeline.disposed ? 0 : timeline.totalDuration
  }

  const dispose = (): void => {
    if (timeline.disposed) return
    disposeStreamTimeline(timeline)
    stopSources()
    clearTick()
    if (ctx !== null) void ctx.close().catch(() => {})
    ctx = null
    startedAt = 0
    playedBeforePause = 0
    sources = []
  }

  const revive = (): void => {
    resetStreamTimeline(timeline)
  }

  return { feed, finish, clear, toggle, pause, scheduled, dispose, revive }
}

/** MiMo streams 24 kHz mono PCM; the context renders at the native rate. */
export const PCM_SAMPLE_RATE = 24_000
