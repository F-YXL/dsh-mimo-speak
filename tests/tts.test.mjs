import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveEngineConfig, synthesizeSpeech, TtsError } from '../lib/node/tts.js'
import { isRiffWav } from '../lib/node/wav.js'

const baseConfig = resolveEngineConfig({ apiKey: 'test-key' })

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function audioResponse(pcmBase64, status = 200) {
  return jsonResponse({ choices: [{ message: { audio: { data: pcmBase64 } } }] }, status)
}

test('resolveEngineConfig fills every default', () => {
  const config = resolveEngineConfig({})
  assert.equal(config.baseUrl, 'https://api.xiaomimimo.com/v1')
  assert.equal(config.model, 'mimo-v2.5-tts')
  assert.equal(config.voice, 'mimo_default')
  assert.equal(config.maxChars, 2000)
  assert.equal(config.timeoutMs, 60000)
  assert.equal(config.apiKey, '')
})

test('synthesizeSpeech builds the documented request and wraps raw PCM', async () => {
  let captured
  const deps = {
    fetch: async (url, init) => {
      captured = { url, init }
      // 4 bytes of raw PCM → the engine wraps it as WAV.
      return audioResponse(Buffer.from([1, 2, 3, 4]).toString('base64'))
    },
    readVoiceSample: async () => { throw new Error('unreachable') },
  }
  const wav = await synthesizeSpeech(baseConfig, { text: '# 你好\n\n**世界**' }, deps)
  assert.equal(captured.url, 'https://api.xiaomimimo.com/v1/chat/completions')
  assert.equal(captured.init.method, 'POST')
  assert.equal(captured.init.headers['api-key'], 'test-key')
  const payload = JSON.parse(captured.init.body)
  assert.equal(payload.model, 'mimo-v2.5-tts')
  assert.deepEqual(payload.audio, { format: 'wav', voice: 'mimo_default' })
  assert.deepEqual(payload.messages, [{ role: 'assistant', content: '你好\n世界' }])
  assert.ok(isRiffWav(wav), 'raw PCM arrives wrapped as WAV')
})

test('synthesizeSpeech applies style and voice overrides', async () => {
  let captured
  const deps = {
    fetch: async (url, init) => {
      captured = JSON.parse(init.body)
      return audioResponse(Buffer.from([0, 0]).toString('base64'))
    },
    readVoiceSample: async () => { throw new Error('unreachable') },
  }
  await synthesizeSpeech(
    { ...baseConfig, style: '默认风格' },
    { text: '内容', style: '开心', voice: 'alloy' },
    deps,
  )
  assert.equal(captured.messages[0].content, '<style>开心</style>内容')
  assert.equal(captured.audio.voice, 'alloy')
})

test('synthesizeSpeech sends the voice-clone sample instead of a preset voice', async () => {
  let captured
  const deps = {
    fetch: async (url, init) => {
      captured = JSON.parse(init.body)
      return audioResponse(Buffer.from([0, 0]).toString('base64'))
    },
    readVoiceSample: async (path) => {
      assert.equal(path, '/samples/me.wav')
      return new Uint8Array([9, 9])
    },
  }
  await synthesizeSpeech({ ...baseConfig, voiceSamplePath: '/samples/me.wav' }, { text: '内容' }, deps)
  assert.equal(captured.audio.voice, undefined)
  assert.deepEqual(captured.audio.voice_audio, { format: 'wav', data: Buffer.from([9, 9]).toString('base64') })
})

test('synthesizeSpeech passes a complete WAV response through untouched', async () => {
  const source = new Uint8Array(44 + 2)
  source.set([0x52, 0x49, 0x46, 0x46], 0) // RIFF
  source.set([0x57, 0x41, 0x56, 0x45], 8) // WAVE
  const deps = {
    fetch: async () => audioResponse(Buffer.from(source).toString('base64')),
    readVoiceSample: async () => { throw new Error('unreachable') },
  }
  const wav = await synthesizeSpeech(baseConfig, { text: '内容' }, deps)
  assert.deepEqual([...wav], [...source])
})

test('synthesizeSpeech refuses without a key and without speakable text', async () => {
  const deps = {
    fetch: async () => { throw new Error('unreachable') },
    readVoiceSample: async () => { throw new Error('unreachable') },
  }
  await assert.rejects(
    () => synthesizeSpeech(resolveEngineConfig({}), { text: '内容' }, deps),
    error => error instanceof TtsError && error.code === 'not-configured',
  )
  await assert.rejects(
    () => synthesizeSpeech(baseConfig, { text: '   ' }, deps),
    error => error instanceof TtsError && error.code === 'bad-request',
  )
})

test('synthesizeSpeech maps upstream failures onto stable codes', async () => {
  const expectCode = async (response, code) => {
    await assert.rejects(
      () => synthesizeSpeech(baseConfig, { text: '内容' }, {
        fetch: async () => response,
        readVoiceSample: async () => { throw new Error('unreachable') },
      }),
      (error) => {
        assert.ok(error instanceof TtsError)
        assert.equal(error.code, code)
        return true
      },
    )
  }
  await expectCode(jsonResponse({ error: { message: 'quota' } }, 429), 'upstream-error')
  // A response without any audio block is a provider anomaly, not transport.
  await expectCode(jsonResponse({ choices: [{ message: {} }] }), 'invalid-audio')
})

test('synthesizeSpeech clamps long text at the configured budget', async () => {
  let captured
  const deps = {
    fetch: async (url, init) => {
      captured = JSON.parse(init.body)
      return audioResponse(Buffer.from([0, 0]).toString('base64'))
    },
    readVoiceSample: async () => { throw new Error('unreachable') },
  }
  await synthesizeSpeech({ ...baseConfig, maxChars: 5 }, { text: '一二三四五六七八九十' }, deps)
  assert.equal(captured.messages[0].content.length, 5)
})
