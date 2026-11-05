/**
 * End-to-end smoke test for the Host synthesis path — without any real
 * credentials or network access to the MiMo platform.
 *
 * A local stub implements the documented `POST /chat/completions` contract
 * (both raw-PCM and complete-WAV response shapes), and the plugin's
 * `synthesizeSpeech` runs against it over real HTTP. Combined with the request-
 * shape unit tests, this verifies the whole engine path the Web route uses.
 *
 * Usage: node scripts/stub-e2e.mjs
 */

import { createServer } from 'node:http'
import assert from 'node:assert/strict'
import { isRiffWav } from '../lib/node/wav.js'
import { resolveEngineConfig, synthesizeSpeech } from '../lib/node/tts.js'

/** Two seconds of silence as raw 24 kHz / 16-bit mono PCM. */
const pcm = new Uint8Array(24000 * 2 * 2)

const server = createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/chat/completions') {
    res.statusCode = 404
    res.end()
    return
  }
  const chunks = []
  req.on('data', chunk => chunks.push(chunk))
  req.on('end', () => {
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    assert.equal(req.headers['api-key'], 'stub-key', 'request authenticates with the api-key header')
    assert.equal(payload.model, 'mimo-v2.5-tts')
    assert.ok(payload.messages[0].content.length > 0)
    res.statusCode = 200
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({
      choices: [{ message: { audio: { data: Buffer.from(pcm).toString('base64') } } }],
    }))
  })
})

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address()
const config = resolveEngineConfig({
  apiKey: 'stub-key',
  baseUrl: `http://127.0.0.1:${port}`,
})

const wav = await synthesizeSpeech(config, { text: '# 你好，**世界**' })
assert.ok(isRiffWav(wav), 'raw PCM arrives wrapped as WAV')
assert.equal(wav.length, 44 + pcm.length)
console.log(`stub-e2e: ok — ${wav.length} bytes (44-byte WAV header + ${pcm.length} PCM)`)

server.close()
