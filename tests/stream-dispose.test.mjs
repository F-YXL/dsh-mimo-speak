import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PCM_SAMPLE_RATE,
  createStreamSink,
  createStreamTimeline,
  disposeStreamTimeline,
  feedStartAt,
  recordScheduledChunk,
  resetStreamTimeline,
  streamShouldFeed,
} from '../lib/node/client/stream-dispose.js'

/** Browser-free harness: injects a fake AudioContext that counts every touch. */
function makeHarness() {
  let contextCreates = 0
  let sourceCreates = 0
  let startCalls = 0
  let closeCalls = 0
  const sources = []
  const states = []
  const engine = createStreamSink({
    createContext: () => {
      contextCreates += 1
      return {
        currentTime: 0,
        state: 'running',
        destination: {},
        createBuffer: (_channels, length) => ({
          duration: length / PCM_SAMPLE_RATE,
          copyToChannel: () => {},
        }),
        createBufferSource: () => {
          sourceCreates += 1
          const source = {
            buffer: null,
            startedAt: null,
            stopped: false,
            onended: null,
            connect: () => {},
            start: (when) => { startCalls += 1; source.startedAt = when },
            stop: () => { source.stopped = true },
          }
          sources.push(source)
          return source
        },
        resume: async () => {},
        suspend: async () => {},
        close: async () => { closeCalls += 1 },
      }
    },
    onState: (patch) => { states.push({ ...patch }) },
    setInterval: () => 1,
    clearInterval: () => {},
    onStart: () => {},
  })
  return {
    engine,
    sources,
    states,
    counts: () => ({ contextCreates, sourceCreates, startCalls, closeCalls }),
  }
}

function pcmOf(samples) {
  return new Uint8Array(samples * 2)
}

test('createStreamTimeline starts live and empty', () => {
  assert.deepEqual(createStreamTimeline(), {
    disposed: false,
    playing: false,
    finished: false,
    nextAt: 0,
    totalDuration: 0,
  })
})

test('feedStartAt clamps to the context clock and then runs back-to-back', () => {
  const timeline = createStreamTimeline()
  assert.equal(feedStartAt(timeline, 10), 10.02)
  recordScheduledChunk(timeline, 10.02, 0.5)
  assert.equal(feedStartAt(timeline, 10.3), 10.52)
  assert.equal(timeline.totalDuration, 0.5)
})

test('streamShouldFeed is the single decision point and flips on dispose', () => {
  const timeline = createStreamTimeline()
  assert.equal(streamShouldFeed(timeline), true)
  disposeStreamTimeline(timeline)
  assert.equal(streamShouldFeed(timeline), false)
})

test('disposeStreamTimeline resets every field a late callback could misuse', () => {
  const timeline = createStreamTimeline()
  timeline.playing = true
  timeline.finished = true
  timeline.nextAt = 12.75
  timeline.totalDuration = 3.25
  disposeStreamTimeline(timeline)
  assert.deepEqual(timeline, {
    disposed: true,
    playing: false,
    finished: false,
    nextAt: 0,
    totalDuration: 0,
  })
})

test('resetStreamTimeline re-enables after a StrictMode-style remount', () => {
  const timeline = createStreamTimeline()
  disposeStreamTimeline(timeline)
  assert.equal(streamShouldFeed(timeline), false)
  resetStreamTimeline(timeline)
  assert.equal(streamShouldFeed(timeline), true)
  assert.ok(Math.abs(feedStartAt(timeline, 0.1) - 0.12) < 1e-9)
})

test('feed schedules PCM on a fresh context and advances the timeline (known-good)', () => {
  const harness = makeHarness()
  harness.engine.feed(pcmOf(2))
  assert.equal(harness.counts().contextCreates, 1)
  assert.equal(harness.counts().sourceCreates, 1)
  assert.equal(harness.sources.length, 1)
  assert.equal(harness.sources[0].startedAt, 0.08)
  assert.ok(harness.states.some(state => state.playing === true))
  harness.engine.feed(pcmOf(2))
  assert.equal(harness.counts().sourceCreates, 2)
  assert.ok(harness.sources[1].startedAt > harness.sources[0].startedAt)
})

test('after dispose, feed no longer creates a context, schedules sources or publishes', () => {
  const harness = makeHarness()
  harness.engine.feed(pcmOf(2))
  const before = harness.counts()
  const stateCount = harness.states.length
  harness.engine.dispose()
  harness.engine.feed(pcmOf(2))
  const after = harness.counts()
  assert.equal(after.contextCreates, before.contextCreates)
  assert.equal(after.sourceCreates, before.sourceCreates)
  assert.equal(after.startCalls, before.startCalls)
  assert.equal(harness.sources.length, 1)
  assert.equal(harness.sources[0].stopped, true)
  assert.equal(harness.states.length, stateCount)
})

test('after dispose, finish/toggle/pause are no-ops and toggle never creates a context', () => {
  const harness = makeHarness()
  harness.engine.feed(pcmOf(2))
  harness.engine.dispose()
  const before = harness.counts()
  const stateCount = harness.states.length
  harness.engine.finish()
  harness.engine.toggle()
  harness.engine.pause()
  assert.equal(harness.counts().contextCreates, before.contextCreates)
  assert.equal(harness.counts().sourceCreates, before.sourceCreates)
  assert.equal(harness.states.length, stateCount)
  assert.equal(harness.engine.scheduled(), 0)
})

test('dispose stops scheduled sources, closes the context and is idempotent', () => {
  const harness = makeHarness()
  harness.engine.feed(pcmOf(2))
  harness.engine.dispose()
  harness.engine.dispose()
  assert.equal(harness.counts().closeCalls, 1)
  assert.equal(harness.sources[0].stopped, true)
})
