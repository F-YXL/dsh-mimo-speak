/**
 * Progressive PCM playback behind the speak entry's streaming path.
 *
 * The Host streams one utterance as raw 24 kHz / 16-bit / mono PCM chunks; each
 * chunk is converted to an `AudioBuffer` and scheduled back-to-back on one
 * `AudioContext`, so the first chunk is audible within a second while later
 * chunks keep arriving. Seek is not supported (the stream is transient), so
 * this player exposes the same `AudioPlayerState` surface minus seeking.
 *
 * All scheduling and the dispose guard live in `stream-dispose.ts`; this hook
 * only binds that sink to React state, the shared audio bus and the browser's
 * timers, so the sink runs (and is tested) without React or a DOM.
 * @module dsh-mimo-speak/client/use-stream-player
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { pauseOtherAudio, registerAudioPauser } from "./audio-bus.js";
import { createStreamSink, PCM_SAMPLE_RATE } from "./stream-dispose.js";
const IDLE = { playing: false, currentTime: 0, duration: 0, ended: false };
/**
 * Bind one `AudioContext` to a stream of PCM chunks.
 * @returns playback state plus feed/finish/clear/toggle/pause controls.
 */
export function useStreamPlayer() {
    const [state, setState] = useState(IDLE);
    /** Identity this player registers with the shared audio bus. */
    const token = useMemo(() => ({}), []);
    // The sink outlives renders and owns every mutable playback detail; it is
    // created once per mounted hook instance (StrictMode remounts are revived).
    const sinkRef = useRef(null);
    if (sinkRef.current === null) {
        sinkRef.current = createStreamSink({
            createContext: () => new AudioContext({ sampleRate: PCM_SAMPLE_RATE }),
            onState: patch => { setState(previous => ({ ...previous, ...patch })); },
            setInterval: (handler, ms) => window.setInterval(handler, ms),
            clearInterval: handle => { window.clearInterval(handle); },
            onStart: () => { pauseOtherAudio(token); },
        });
    }
    const sink = sinkRef.current;
    // The pauser registration needs a stable reference the other players call.
    const pauseRef = useRef(() => { });
    pauseRef.current = sink.pause;
    useEffect(() => registerAudioPauser(token, () => { pauseRef.current(); }), [token]);
    useEffect(() => {
        // React StrictMode mounts, unmounts and remounts the same instance in
        // place: revive the sink so the second mount is not left disposed.
        sink.revive();
        return () => { sink.dispose(); };
    }, [sink]);
    return {
        state,
        feed: sink.feed,
        finish: sink.finish,
        clear: sink.clear,
        toggle: sink.toggle,
        pause: sink.pause,
        scheduled: sink.scheduled,
    };
}
//# sourceMappingURL=use-stream-player.js.map