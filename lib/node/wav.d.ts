/**
 * WAV container helpers.
 *
 * The MiMo TTS endpoint returns either a complete WAV (RIFF) or raw PCM;
 * browsers need a container to seek, so raw PCM is wrapped as 24 kHz / 16-bit
 * mono PCM — the format the endpoint documents for its audio output.
 * @module dsh-mimo-speak/wav
 */
/** Sample rate the MiMo TTS endpoint emits raw PCM at. */
export declare const PCM_SAMPLE_RATE = 24000;
/** Bits per sample the MiMo TTS endpoint emits raw PCM at. */
export declare const PCM_BITS_PER_SAMPLE = 16;
/** Channel count the MiMo TTS endpoint emits raw PCM at. */
export declare const PCM_CHANNELS = 1;
/**
 * Test whether the bytes already carry a RIFF/WAVE container.
 * @param bytes - audio payload as decoded from the provider response.
 * @returns true when the payload starts with a `RIFF…WAVE` header.
 */
export declare function isRiffWav(bytes: Uint8Array): boolean;
/**
 * Wrap raw PCM samples in a minimal canonical WAV container.
 *
 * The layout is the 44-byte `RIFF`/`fmt `/`data` header every browser audio
 * decoder seeks: no `fact` chunk, no extended format.
 * @param pcm - interleaved little-endian PCM samples.
 * @param sampleRate - samples per second per channel.
 * @param bitsPerSample - bits per sample.
 * @param channels - channel count.
 * @returns a complete WAV file.
 */
export declare function wrapPcmAsWav(pcm: Uint8Array, sampleRate?: number, bitsPerSample?: number, channels?: number): Uint8Array;
