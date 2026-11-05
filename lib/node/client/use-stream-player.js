/**
 * Progressive PCM playback behind the speak entry's streaming path.
 *
 * The Host streams one utterance as raw 24 kHz / 16-bit / mono PCM chunks; each
 * chunk is converted to an `AudioBuffer` and scheduled back-to-back on one
 * `AudioContext`, so the first chunk is audible within a second while later
 * chunks keep arriving. Seek is not supported (the stream is transient), so
 * this player exposes the same `AudioPlayerState` surface minus seeking.
 *
 * A module-local registry of pause callbacks mirrors `use-audio-queue.ts`, so
 * starting one player pauses any other audio this plugin owns.
 * @module dsh-mimo-speak/client/use-stream-player
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pauseOtherAudio, registerAudioPauser } from "./audio-bus.js";
/** MiMo streams 24 kHz mono PCM; the context renders at the native rate. */
const PCM_SAMPLE_RATE = 24_000;
const IDLE = { playing: false, currentTime: 0, duration: 0, ended: false };
/**
 * Bind one `AudioContext` to a stream of PCM chunks.
 * @returns playback state plus feed/finish/clear/toggle/pause controls.
 */
export function useStreamPlayer() {
    const [state, setState] = useState(IDLE);
    const ctxRef = useRef(null);
    const sourcesRef = useRef([]);
    /** Context time the next chunk starts at. */
    const nextAtRef = useRef(0);
    /** Context time the current playback run started. */
    const startedAtRef = useRef(0);
    /** Seconds already played before the last pause. */
    const playedBeforePauseRef = useRef(0);
    const finishedRef = useRef(false);
    const playingRef = useRef(false);
    const tickRef = useRef(null);
    /** Total scheduled audio, in seconds; survives pause/resume. */
    const totalDurationRef = useRef(0);
    const publish = useCallback((patch) => {
        setState(previous => ({ ...previous, ...patch }));
    }, []);
    /** Identity this player registers with the shared audio bus. */
    const token = useMemo(() => ({}), []);
    const clearTick = useCallback(() => {
        if (tickRef.current !== null) {
            window.clearInterval(tickRef.current);
            tickRef.current = null;
        }
    }, []);
    const syncProgress = useCallback(() => {
        const ctx = ctxRef.current;
        if (ctx === null || !playingRef.current)
            return;
        const elapsed = Math.max(0, ctx.currentTime - startedAtRef.current);
        publish({ currentTime: playedBeforePauseRef.current + elapsed });
    }, [publish]);
    const startTick = useCallback(() => {
        clearTick();
        tickRef.current = window.setInterval(syncProgress, 200);
    }, [clearTick, syncProgress]);
    const ensureCtx = useCallback(() => {
        if (ctxRef.current === null) {
            ctxRef.current = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
        }
        return ctxRef.current;
    }, []);
    const stopSources = useCallback(() => {
        for (const source of sourcesRef.current) {
            try {
                source.stop();
            }
            catch {
                // Already stopped.
            }
        }
        sourcesRef.current = [];
    }, []);
    const maybeEnded = useCallback(() => {
        if (!finishedRef.current || !playingRef.current)
            return;
        if (sourcesRef.current.length > 0)
            return;
        const ctx = ctxRef.current;
        const total = totalDurationRef.current;
        const played = playedBeforePauseRef.current + (ctx !== null ? Math.max(0, ctx.currentTime - startedAtRef.current) : 0);
        if (played >= total - 0.05) {
            playingRef.current = false;
            clearTick();
            publish({ playing: false, ended: true, currentTime: 0 });
        }
    }, [clearTick, publish]);
    const feed = useCallback((pcm) => {
        const ctx = ensureCtx();
        let resumePromise = Promise.resolve();
        if (!playingRef.current) {
            playingRef.current = true;
            finishedRef.current = false;
            playedBeforePauseRef.current = 0;
            totalDurationRef.current = 0;
            startedAtRef.current = ctx.currentTime + 0.08;
            nextAtRef.current = startedAtRef.current;
            pauseOtherAudio(token);
            resumePromise = ctx.state === 'suspended' ? ctx.resume().catch(() => { }) : Promise.resolve();
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
        const buffer = ctx.createBuffer(1, length, PCM_SAMPLE_RATE);
        buffer.copyToChannel(floats, 0);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        const when = Math.max(nextAtRef.current, ctx.currentTime + 0.02);
        source.start(when);
        nextAtRef.current = when + buffer.duration;
        totalDurationRef.current += buffer.duration;
        sourcesRef.current.push(source);
        source.onended = () => {
            sourcesRef.current = sourcesRef.current.filter(item => item !== source);
            maybeEnded();
        };
        // Autoplay may be blocked: report playing only when the context actually
        // advances, and correct the state once the pending resume settles.
        publish({
            playing: ctx.state === 'running',
            ended: false,
            duration: totalDurationRef.current,
        });
        if (ctx.state !== 'running') {
            void resumePromise.then(() => {
                if (playingRef.current)
                    publish({ playing: ctx.state === 'running' });
            });
        }
    }, [ensureCtx, maybeEnded, publish, startTick, token]);
    const finish = useCallback(() => {
        finishedRef.current = true;
        maybeEnded();
    }, [maybeEnded]);
    const clear = useCallback(() => {
        stopSources();
        playingRef.current = false;
        finishedRef.current = false;
        totalDurationRef.current = 0;
        clearTick();
        publish(IDLE);
    }, [clearTick, publish, stopSources]);
    const toggle = useCallback(() => {
        const ctx = ensureCtx();
        if (playingRef.current) {
            if (ctx.state === 'suspended') {
                void ctx.resume().catch(() => { });
                return;
            }
            void ctx.suspend().catch(() => { });
            const elapsed = Math.max(0, ctx.currentTime - startedAtRef.current);
            playedBeforePauseRef.current += elapsed;
            clearTick();
            publish({ playing: false });
            return;
        }
        // Resume after pause or after autoplay was blocked.
        void ctx.resume().catch(() => { });
        startedAtRef.current = ctx.currentTime;
        playingRef.current = true;
        finishedRef.current = finishedRef.current && sourcesRef.current.length === 0;
        startTick();
        publish({ playing: true, ended: false });
    }, [clearTick, ensureCtx, publish, startTick]);
    const pause = useCallback(() => {
        const ctx = ctxRef.current;
        if (ctx === null || !playingRef.current)
            return;
        if (ctx.state === 'suspended') {
            clearTick();
            publish({ playing: false });
            return;
        }
        const elapsed = Math.max(0, ctx.currentTime - startedAtRef.current);
        playedBeforePauseRef.current += elapsed;
        void ctx.suspend().catch(() => { });
        clearTick();
        publish({ playing: false });
    }, [clearTick, publish]);
    // The pauser registration needs a stable reference the other players call.
    const pauseRef = useRef(pause);
    pauseRef.current = pause;
    useEffect(() => registerAudioPauser(token, () => { pauseRef.current(); }), [token]);
    useEffect(() => () => {
        stopSources();
        clearTick();
        const ctx = ctxRef.current;
        if (ctx !== null)
            void ctx.close().catch(() => { });
        ctxRef.current = null;
    }, [clearTick, stopSources]);
    const scheduled = useCallback(() => totalDurationRef.current, []);
    return { state, feed, finish, clear, toggle, pause, scheduled };
}
//# sourceMappingURL=use-stream-player.js.map