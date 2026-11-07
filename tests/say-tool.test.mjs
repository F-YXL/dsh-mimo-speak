/**
 * 语音工具：文件名、时长解析、落盘位置、失败语义。
 * 只测离线部分（合成调用是注入的，不打网络）。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SAY_TOOL, SPEECH_DIR, createSayTool, speechFileName, wavDurationMs } from '../lib/node/tool.js'
import { wrapPcmAsWav } from '../lib/node/wav.js'

test('speechFileName：时间戳 + 8 位随机，扩展名 wav', () => {
  const name = speechFileName(Date.parse('2026-10-29T11:30:05Z'), '12345678-aaaa-bbbb-cccc-dddddddddddd')
  assert.match(name, /^speech-\d{8}-\d{6}-[0-9a-f]{8}\.wav$/)
  assert.ok(name.includes('12345678'))
})

test('wavDurationMs：24kHz/16bit/mono 的 1 秒 PCM = 1000ms', () => {
  const pcm = new Uint8Array(24_000 * 2) // 1 秒 16bit 单声道
  const wav = wrapPcmAsWav(pcm)
  assert.equal(wavDurationMs(wav), 1000)
})

test('wavDurationMs：不是 WAV / 头不完整就返回 0，不瞎算', () => {
  assert.equal(wavDurationMs(new Uint8Array([1, 2, 3])), 0)
  assert.equal(wavDurationMs(new Uint8Array(44)), 0)
})

test('createSayTool：合成后写进 <cwd>/tts/ 并返回产物信息', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mimo-speak-say-'))
  try {
    const wav = wrapPcmAsWav(new Uint8Array(24_000 * 2))
    const tool = createSayTool({
      synthesize: async (request) => {
        assert.equal(request.text, '你好')
        assert.equal(request.style, '开心')
        return { wav, model: 'mimo-v2-tts', style: '开心', voice: 'mimo_default' }
      },
    })
    assert.equal(tool.name, SAY_TOOL)
    const result = await tool.execute(
      { text: '  你好  ', style: '开心' },
      { agent: { session: { header: { id: 's1', cwd: dir } } } }
    )
    assert.ok(result.path.startsWith(join(dir, SPEECH_DIR)))
    assert.equal(existsSync(result.path), true)
    assert.equal(readFileSync(result.path).length, wav.length)
    assert.equal(result.durationMs, 1000)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('createSayTool：缺 text / 没工作区都直接报错', async () => {
  const tool = createSayTool({ synthesize: async () => ({ wav: new Uint8Array(0), model: '', style: '', voice: '' }) })
  await assert.rejects(
    () => tool.execute({ text: '   ' }, { agent: { session: { header: { cwd: 'C:/tmp' } } } }),
    /缺少要念的文本/
  )
  await assert.rejects(() => tool.execute({ text: '你好' }, { agent: {} }), /拿不到当前会话的工作区/)
})
