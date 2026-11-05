/**
 * One pause registry for every player this plugin owns.
 *
 * The plugin plays audio through three different engines — the chunk queue
 * (`<audio>` elements), the progressive PCM stream (`AudioContext`), and the
 * settings-page sample player. Each used to keep its own module-local registry,
 * so a stream starting while a queued reply played left both audible. Routing
 * every engine through this one bus means starting audio anywhere pauses
 * everything else, whichever engine produced it.
 * @module dsh-mimo-speak/client/audio-bus
 */
/** Pause callbacks keyed by the owning player's identity token. */
const pausers = new Map();
/**
 * Register one player's pause control.
 * @param token - the player's stable identity (a ref object or Audio element).
 * @param pause - stops that player without toggling its state.
 * @returns a disposer that unregisters the player.
 */
export function registerAudioPauser(token, pause) {
    pausers.set(token, pause);
    return () => {
        pausers.delete(token);
    };
}
/**
 * Pause every registered player except the caller.
 * @param self - the caller's identity token, left untouched.
 */
export function pauseOtherAudio(self) {
    for (const [token, pause] of pausers) {
        if (token === self)
            continue;
        try {
            pause();
        }
        catch {
            // A disposed player must never break the one taking over.
        }
    }
}
/**
 * Listeners told when page code starts capturing microphone audio.
 *
 * Reading aloud while the microphone is open is self-defeating: the recorder
 * captures the assistant's own voice and the transcript comes back as the
 * reply it just spoke. The official voice-input bundle records through
 * `getUserMedia`, so watching that one call covers any recorder — no coupling
 * to another plugin's internals, and no cooperation needed from it.
 */
const captureListeners = new Set();
/** Whether `getUserMedia` is already wrapped in this page. */
let captureWatchInstalled = false;
/**
 * Subscribe to microphone capture starts.
 * @param listener - called once per successful audio capture request.
 * @returns the unsubscribe function.
 */
export function onAudioCaptureStart(listener) {
    captureListeners.add(listener);
    installCaptureWatch();
    return () => {
        captureListeners.delete(listener);
    };
}
/** Wrap `getUserMedia` once per page, leaving its behavior untouched. */
function installCaptureWatch() {
    if (captureWatchInstalled)
        return;
    const devices = navigator.mediaDevices;
    if (devices === undefined || typeof devices.getUserMedia !== 'function')
        return;
    captureWatchInstalled = true;
    const original = devices.getUserMedia.bind(devices);
    devices.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        const wantsAudio = constraints?.audio !== undefined && constraints.audio !== false;
        if (!wantsAudio)
            return stream;
        for (const listener of captureListeners) {
            try {
                listener();
            }
            catch {
                // A reader that cannot stop must not break the microphone request.
            }
        }
        return stream;
    };
}
//# sourceMappingURL=audio-bus.js.map