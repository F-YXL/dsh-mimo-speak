/**
 * The playback engine behind every player this plugin renders: one hidden
 * `HTMLAudioElement` per mounted player, mirrored into React state, with a
 * module-local registry so starting one player pauses the other.
 *
 * The registry is deliberately module-local mutable UI state: it coordinates
 * components of this one plugin bundle and lives in the browser only. Business
 * and transport state stay in the settings namespace and the Host routes.
 * @module dsh-mimo-speak/client/use-audio-player
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { pauseOtherAudio, registerAudioPauser } from "./audio-bus.js";
const IDLE = { playing: false, currentTime: 0, duration: 0, ended: false };
/**
 * Bind one audio source to playback state and controls.
 *
 * A new `source` replaces the element: the old one pauses and detaches, and
 * playback state returns to zero. Passing null keeps the hook idle.
 * @param source - object URL of the WAV to play, or null.
 * @returns playback state plus the toggle and seek controls.
 */
export function useAudioPlayer(source) {
    const [state, setState] = useState(IDLE);
    const elementRef = useRef(null);
    useEffect(() => {
        if (source === null)
            return;
        const audio = new Audio(source);
        elementRef.current = audio;
        const publish = (patch) => {
            setState(previous => ({ ...previous, ...patch }));
        };
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
            publish({ playing: false, ended: true, currentTime: 0 });
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
    }, [source]);
    const toggle = useCallback(() => {
        const audio = elementRef.current;
        if (audio === null)
            return;
        if (audio.paused) {
            // Starting one player retires every other one before it advances.
            pauseOtherAudio(audio);
            if (audio.ended)
                audio.currentTime = 0;
            void audio.play().catch(() => {
                setState(previous => ({ ...previous, playing: false }));
            });
        }
        else {
            audio.pause();
        }
    }, []);
    const seek = useCallback((seconds) => {
        const audio = elementRef.current;
        if (audio === null)
            return;
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        const target = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);
        audio.currentTime = target;
        setState(previous => ({ ...previous, currentTime: target, ended: false }));
    }, []);
    const pause = useCallback(() => {
        const audio = elementRef.current;
        if (audio !== null)
            audio.pause();
    }, []);
    return { state, toggle, seek, pause };
}
//# sourceMappingURL=use-audio-player.js.map