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
/**
 * Register one player's pause control.
 * @param token - the player's stable identity (a ref object or Audio element).
 * @param pause - stops that player without toggling its state.
 * @returns a disposer that unregisters the player.
 */
export declare function registerAudioPauser(token: object, pause: () => void): () => void;
/**
 * Pause every registered player except the caller.
 * @param self - the caller's identity token, left untouched.
 */
export declare function pauseOtherAudio(self: object): void;
/**
 * Subscribe to microphone capture starts.
 * @param listener - called once per successful audio capture request.
 * @returns the unsubscribe function.
 */
export declare function onAudioCaptureStart(listener: () => void): () => void;
