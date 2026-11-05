/**
 * WAV container helpers.
 *
 * The MiMo TTS endpoint returns either a complete WAV (RIFF) or raw PCM;
 * browsers need a container to seek, so raw PCM is wrapped as 24 kHz / 16-bit
 * mono PCM — the format the endpoint documents for its audio output.
 * @module dsh-mimo-speak/wav
 */
/** Sample rate the MiMo TTS endpoint emits raw PCM at. */
export const PCM_SAMPLE_RATE = 24_000;
/** Bits per sample the MiMo TTS endpoint emits raw PCM at. */
export const PCM_BITS_PER_SAMPLE = 16;
/** Channel count the MiMo TTS endpoint emits raw PCM at. */
export const PCM_CHANNELS = 1;
/**
 * Test whether the bytes already carry a RIFF/WAVE container.
 * @param bytes - audio payload as decoded from the provider response.
 * @returns true when the payload starts with a `RIFF…WAVE` header.
 */
export function isRiffWav(bytes) {
    return bytes.length >= 12
        && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 // RIFF
        && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45; // WAVE
}
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
export function wrapPcmAsWav(pcm, sampleRate = PCM_SAMPLE_RATE, bitsPerSample = PCM_BITS_PER_SAMPLE, channels = PCM_CHANNELS) {
    const blockAlign = (channels * bitsPerSample) / 8;
    const byteRate = sampleRate * blockAlign;
    const wav = new Uint8Array(44 + pcm.length);
    const view = new DataView(wav.buffer);
    const ascii = (offset, text) => {
        for (let index = 0; index < text.length; index += 1)
            wav[offset + index] = text.charCodeAt(index);
    };
    ascii(0, 'RIFF');
    view.setUint32(4, 36 + pcm.length, true);
    ascii(8, 'WAVE');
    ascii(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM fmt chunk size
    view.setUint16(20, 1, true); // format: PCM
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    ascii(36, 'data');
    view.setUint32(40, pcm.length, true);
    wav.set(pcm, 44);
    return wav;
}
//# sourceMappingURL=wav.js.map