/**
 * The pipelined playback engine behind the speak entry: one hidden
 * `HTMLAudioElement` fed from a queue of chunk object URLs, so the next chunk
 * is already waiting when the current one ends and playback runs back-to-back.
 *
 * Starting this player pauses every other player this plugin owns through the
 * shared audio bus, so a stream and a queued reply never overlap.
 * @module dsh-mimo-speak/client/use-audio-queue
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { pauseOtherAudio, registerAudioPauser } from "./audio-bus.js";
const IDLE = { playing: false, currentTime: 0, duration: 0, ended: false };
/**
 * Bind one hidden audio element to a queue of chunk URLs.
 * @returns playback state plus enqueue/clear/toggle/seek/pause controls.
 */
export function useAudioQueue() {
    const [state, setState] = useState(IDLE);
    const elementRef = useRef(null);
    const queueRef = useRef([]);
    /** Set once the queue runs dry mid-stream, so a late enqueue resumes play. */
    const waitingRef = useRef(false);
    const publish = useCallback((patch) => {
        setState(previous => ({ ...previous, ...patch }));
    }, []);
    const loadNext = useCallback(() => {
        const audio = elementRef.current;
        if (audio === null)
            return;
        const url = queueRef.current.shift();
        if (url === undefined) {
            waitingRef.current = true;
            publish({ ended: true, playing: false, currentTime: 0 });
            return;
        }
        waitingRef.current = false;
        audio.src = url;
        void audio.play().catch(() => {
            // Autoplay may be blocked before the first user gesture; the source is
            // loaded and one tap on the speaker plays it.
            publish({ playing: false });
        });
    }, [publish]);
    useEffect(() => {
        const audio = new Audio();
        elementRef.current = audio;
        const onTime = () => { publish({ currentTime: audio.currentTime }); };
        const onLoaded = () => {
            publish({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
        };
        const onPlay = () => {
            pauseOtherAudio(audio);
            publish({ playing: true, ended: false });
        };
        const onPause = () => {
            publish({ playing: false });
        };
        const onEnded = () => {
            publish({ playing: false, currentTime: 0 });
            loadNext();
        };
        audio.addEventListener('timeupdate', onTime);
        audio.addEventListener('loadedmetadata', onLoaded);
        audio.addEventListener('durationchange', onLoaded);
        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('ended', onEnded);
        setState({ playing: false, currentTime: 0, duration: 0, ended: false });
        const unregister = registerAudioPauser(audio, () => { audio.pause(); });
        return () => {
            unregister();
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
            audio.removeEventListener('timeupdate', onTime);
            audio.removeEventListener('loadedmetadata', onLoaded);
            audio.removeEventListener('durationchange', onLoaded);
            audio.removeEventListener('play', onPlay);
            audio.removeEventListener('pause', onPause);
            audio.removeEventListener('ended', onEnded);
            elementRef.current = null;
        };
    }, [loadNext, publish]);
    const enqueue = useCallback((url) => {
        // The element is null after unmount, so a background run can no longer
        // stock the queue. This is defense-in-depth: SpeakAction's unmount cleanup
        // already invalidates the run, so post-unmount enqueue is unreachable in
        // practice. The null check has to come before the push, or the object URL
        // would accumulate on a dead queue.
        const audio = elementRef.current;
        if (audio === null)
            return;
        queueRef.current.push(url);
        if (audio.src === '' || waitingRef.current)
            loadNext();
    }, [loadNext]);
    const clear = useCallback(() => {
        queueRef.current = [];
        waitingRef.current = false;
        const audio = elementRef.current;
        if (audio === null)
            return;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        publish({ playing: false, currentTime: 0, duration: 0, ended: false });
    }, [publish]);
    const toggle = useCallback(() => {
        const audio = elementRef.current;
        if (audio === null)
            return;
        if (audio.paused) {
            pauseOtherAudio(audio);
            if (audio.ended)
                audio.currentTime = 0;
            void audio.play().catch(() => {
                publish({ playing: false });
            });
        }
        else {
            audio.pause();
        }
    }, [publish]);
    const seek = useCallback((seconds) => {
        const audio = elementRef.current;
        if (audio === null)
            return;
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        const target = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);
        audio.currentTime = target;
        publish({ currentTime: target, ended: false });
    }, [publish]);
    const pause = useCallback(() => {
        const audio = elementRef.current;
        if (audio !== null)
            audio.pause();
    }, []);
    return { state, enqueue, clear, toggle, seek, pause };
}
//# sourceMappingURL=use-audio-queue.js.map