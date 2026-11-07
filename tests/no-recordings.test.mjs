/**
 * 语音历史已移除的回归护栏：模块文件、路由常量、HTTP 路由、客户端 API、
 * 设置页 slot 与工具归档钩子都不应再存在。
 * 旧的代码上（这些符号/文件还在）这里的断言会失败。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const libNode = join(here, '..', 'lib', 'node')
const libClient = join(here, '..', 'lib', 'client.js')

test('recordings 模块与设置页组件已从构建产物中移除', () => {
  assert.equal(
    existsSync(join(libNode, 'recordings.js')),
    false,
    'lib/node/recordings.js 不应存在：语音历史已删除',
  )
  assert.equal(
    existsSync(join(libNode, 'client', 'RecordingsPage.js')),
    false,
    'lib/node/client/RecordingsPage.js 不应存在：语音历史设置页已删除',
  )
  assert.equal(
    existsSync(join(libNode, 'client', 'RecordingsList.js')),
    false,
    'lib/node/client/RecordingsList.js 不应存在：语音历史列表已删除',
  )
})

test('settings 不再导出语音历史路由常量', async () => {
  const settings = await import('../lib/node/settings.js')
  assert.equal(
    'MIMOSPEAK_RECORDINGS_PATH' in settings,
    false,
    'settings 不应再导出 MIMOSPEAK_RECORDINGS_PATH',
  )
  assert.equal(
    'MIMOSPEAK_RECORDING_HEADER' in settings,
    false,
    'settings 不应再导出 MIMOSPEAK_RECORDING_HEADER',
  )
})

test('Host 半侧不再注册语音历史 HTTP 路由', () => {
  const index = readFileSync(join(libNode, 'index.js'), 'utf8')
  assert.equal(index.includes('MIMOSPEAK_RECORDINGS_PATH'), false, 'index.js 不应再引用路由常量')
  assert.equal(index.includes('recordings/resynth'), false, 'index.js 不应再注册 /recordings/resynth')
  assert.equal(index.includes('recordings/version'), false, 'index.js 不应再注册 /recordings/version')
  assert.equal(index.includes('recordings/file'), false, 'index.js 不应再注册 /recordings/file')
})

test('say 工具不再带 persist 归档钩子', () => {
  const tool = readFileSync(join(libNode, 'tool.js'), 'utf8')
  assert.equal(tool.includes('persist'), false, 'tool.js 不应再包含 persist 钩子')
})

test('浏览器半侧不再带语音历史客户端 API 或设置页 slot', () => {
  const client = readFileSync(libClient, 'utf8')
  assert.equal(client.includes('requestRecording'), false, 'client.js 不应再导出 requestRecording')
  assert.equal(client.includes('fetchRecordings'), false, 'client.js 不应再导出 fetchRecordings')
  assert.equal(client.includes('resynthesizeRecording'), false, 'client.js 不应再导出 resynthesizeRecording')
  assert.equal(client.includes('deleteRecordingVersion'), false, 'client.js 不应再导出 deleteRecordingVersion')
  assert.equal(client.includes('recordingFileUrl'), false, 'client.js 不应再导出 recordingFileUrl')
  assert.equal(client.includes('settings.section'), false, 'client.js 不应再注册 settings.section')
  assert.equal(client.includes('RecordingsPage'), false, 'client.js 不应再包含 RecordingsPage')
})
