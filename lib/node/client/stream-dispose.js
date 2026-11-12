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
/** A fresh, live timeline. */
export function createStreamTimeline() {
    return { disposed: false, playing: false, finished: false, nextAt: 0, totalDuration: 0 };
}
/**
 * Whether one more chunk may be scheduled. This is the single decision point
 * `feed` consults before it touches the context factory, so a disposed player
 * can never rebuild its `AudioContext`.
 * @param timeline - the player's live bookkeeping.
 */
export function streamShouldFeed(timeline) {
    return !timeline.disposed;
}
/**
 * The context time the next chunk should start at: never earlier than the
 * timeline's back-to-back position, and never before the context clock.
 * @param timeline - the player's live bookkeeping.
 * @param ctxNow - the current `AudioContext.currentTime`.
 */
export function feedStartAt(timeline, ctxNow) {
    return Math.max(timeline.nextAt, ctxNow + 0.02);
}
/** Record that one chunk of `duration` seconds started at `when`. */
export function recordScheduledChunk(timeline, when, duration) {
    timeline.nextAt = when + duration;
    timeline.totalDuration += duration;
}
/** Disable the player and reset every field a late callback could misuse. */
export function disposeStreamTimeline(timeline) {
    timeline.disposed = true;
    timeline.playing = false;
    timeline.finished = false;
    timeline.nextAt = 0;
    timeline.totalDuration = 0;
}
/** Re-enable after a remount (StrictMode setup or in-place re-entry). */
export function resetStreamTimeline(timeline) {
    timeline.disposed = false;
}
const IDLE = { playing: false, currentTime: 0, duration: 0, ended: false };
/**
 * Bind one context to a stream of PCM chunks.
 * @param deps - injected context factory, state publisher, timers and bus hook.
 * @returns scheduling controls plus dispose/revive.
 */
export function createStreamSink(deps) {
    const timeline = createStreamTimeline();
    let ctx = null;
    let sources = [];
    let startedAt = 0;
    let playedBeforePause = 0;
    let tick = null;
    const publish = (patch) => { deps.onState(patch); };
    const clearTick = () => {
        if (tick !== null) {
            deps.clearInterval(tick);
            tick = null;
        }
    };
    const syncProgress = () => {
        if (ctx === null || !timeline.playing)
            return;
        const elapsed = Math.max(0, ctx.currentTime - startedAt);
        publish({ currentTime: playedBeforePause + elapsed });
    };
    const startTick = () => {
        clearTick();
        tick = deps.setInterval(syncProgress, 200);
    };
    const ensureCtx = () => {
        if (ctx === null)
            ctx = deps.createContext();
        return ctx;
    };
    const stopSources = () => {
        for (const source of sources) {
            try {
                source.stop();
            }
            catch {
                // Already stopped.
            }
        }
        sources = [];
    };
    const maybeEnded = () => {
        if (!timeline.finished || !timeline.playing)
            return;
        if (sources.length > 0)
            return;
        const total = timeline.totalDuration;
        const played = playedBeforePause + (ctx !== null ? Math.max(0, ctx.currentTime - startedAt) : 0);
        if (played >= total - 0.05) {
            timeline.playing = false;
            clearTick();
            publish({ playing: false, ended: true, currentTime: 0 });
        }
    };
    const feed = (pcm) => {
        // The single guard against the resume-after-unmount bug: after dispose a
        // late SSE chunk must not rebuild the AudioContext, so this check runs
        // before the context factory is ever reached.
        if (!streamShouldFeed(timeline))
            return;
        const context = ensureCtx();
        let resumePromise = Promise.resolve();
        if (!timeline.playing) {
            timeline.playing = true;
            timeline.finished = false;
            playedBeforePause = 0;
            timeline.totalDuration = 0;
            startedAt = context.currentTime + 0.08;
            timeline.nextAt = startedAt;
            deps.onStart();
            resumePromise = context.state === 'suspended' ? context.resume().catch(() => { }) : Promise.resolve();
            startTick();
        }
        const length = Math.floor(pcm.length / 2);
        if (length === 0)
            return;
        const floats = new Float32Array(length);
        const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
        for (let index = 0; index < length; index += 1) {
            floats[index] = view.getInt16(index * 2, true) / 32768;
        }
        const buffer = context.createBuffer(1, length, PCM_SAMPLE_RATE);
        buffer.copyToChannel(floats, 0);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        const when = feedStartAt(timeline, context.currentTime);
        source.start(when);
        recordScheduledChunk(timeline, when, buffer.duration);
        sources.push(source);
        source.onended = () => {
            sources = sources.filter(item => item !== source);
            maybeEnded();
        };
        publish({
            playing: context.state === 'running',
            ended: false,
            duration: timeline.totalDuration,
        });
        if (context.state !== 'running') {
            void resumePromise.then(() => {
                if (timeline.playing)
                    publish({ playing: context.state === 'running' });
            });
        }
    };
    const finish = () => {
        if (!streamShouldFeed(timeline))
            return;
        timeline.finished = true;
        maybeEnded();
    };
    const clear = () => {
        if (!streamShouldFeed(timeline))
            return;
        stopSources();
        timeline.playing = false;
        timeline.finished = false;
        timeline.totalDuration = 0;
        clearTick();
        publish(IDLE);
    };
    const toggle = () => {
        if (!streamShouldFeed(timeline))
            return;
        const context = ensureCtx();
        if (timeline.playing) {
            if (context.state === 'suspended') {
                void context.resume().catch(() => { });
                return;
            }
            void context.suspend().catch(() => { });
            const elapsed = Math.max(0, context.currentTime - startedAt);
            playedBeforePause += elapsed;
            clearTick();
            publish({ playing: false });
            return;
        }
        void context.resume().catch(() => { });
        startedAt = context.currentTime;
        timeline.playing = true;
        timeline.finished = timeline.finished && sources.length === 0;
        startTick();
        publish({ playing: true, ended: false });
    };
    const pause = () => {
        if (!streamShouldFeed(timeline))
            return;
        if (ctx === null || !timeline.playing)
            return;
        if (ctx.state === 'suspended') {
            clearTick();
            publish({ playing: false });
            return;
        }
        const elapsed = Math.max(0, ctx.currentTime - startedAt);
        playedBeforePause += elapsed;
        void ctx.suspend().catch(() => { });
        clearTick();
        publish({ playing: false });
    };
    const scheduled = () => {
        return timeline.disposed ? 0 : timeline.totalDuration;
    };
    const dispose = () => {
        if (timeline.disposed)
            return;
        disposeStreamTimeline(timeline);
        stopSources();
        clearTick();
        if (ctx !== null)
            void ctx.close().catch(() => { });
        ctx = null;
        startedAt = 0;
        playedBeforePause = 0;
        sources = [];
    };
    const revive = () => {
        resetStreamTimeline(timeline);
    };
    return { feed, finish, clear, toggle, pause, scheduled, dispose, revive };
}
/** MiMo streams 24 kHz mono PCM; the context renders at the native rate. */
export const PCM_SAMPLE_RATE = 24_000;
//# sourceMappingURL=stream-dispose.js.map