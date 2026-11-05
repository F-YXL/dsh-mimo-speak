import test from 'node:test'
import assert from 'node:assert/strict'
import { isRiffWav, wrapPcmAsWav } from '../lib/node/wav.js'

test('wrapPcmAsWav writes a canonical 44-byte PCM container', () => {
  const pcm = new Uint8Array([1, 2, 3, 4])
  const wav = wrapPcmAsWav(pcm)
  assert.equal(wav.length, 48)
  const view = new DataView(wav.buffer)
  const ascii = (offset, length) => String.fromCharCode(...wav.subarray(offset, offset + length))
  assert.equal(ascii(0, 4), 'RIFF')
  assert.equal(view.getUint32(4, true), 36 + pcm.length)
  assert.equal(ascii(8, 4), 'WAVE')
  assert.equal(ascii(12, 4), 'fmt ')
  assert.equal(view.getUint32(16, true), 16)
  assert.equal(view.getUint16(20, true), 1, 'PCM format')
  assert.equal(view.getUint16(22, true), 1, 'mono')
  assert.equal(view.getUint32(24, true), 24000, '24 kHz')
  assert.equal(view.getUint32(28, true), 48000, 'byte rate')
  assert.equal(view.getUint16(32, true), 2, 'block align')
  assert.equal(view.getUint16(34, true), 16, '16-bit')
  assert.equal(ascii(36, 4), 'data')
  assert.equal(view.getUint32(40, true), pcm.length)
  assert.deepEqual([...wav.subarray(44)], [1, 2, 3, 4])
})

test('isRiffWav recognizes containers and rejects raw PCM', () => {
  assert.equal(isRiffWav(wrapPcmAsWav(new Uint8Array(2))), true)
  assert.equal(isRiffWav(new Uint8Array([0, 1, 2, 3])), false)
  assert.equal(isRiffWav(new Uint8Array(0)), false)
})
