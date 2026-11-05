import test from 'node:test'
import assert from 'node:assert/strict'
import { addVersion, deleteVersion, hasVersion, listRecordings, resynthesize } from '../lib/node/recordings.js'

const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4])

// Exercises the real store under ~/.dsh/mimo-speak-recordings and removes every
// trace it creates, so the user's own history is left untouched.
test('recordings: add → list → resynthesize → delete lifecycle', async () => {
  const text = `语音历史自测-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const { recording, version } = await addVersion(text, '开心', 'mimo_default', 'mimo-v2.5-tts', WAV)
  assert.ok(recording.id, 'recording gets an id')
  assert.equal(recording.text, text)
  assert.equal(version.style, '开心')
  assert.equal(await hasVersion(recording.id, version.id), true)

  let index = await listRecordings()
  let node = index.entries.find(entry => entry.id === recording.id)
  assert.ok(node, 'node is listed')
  assert.equal(node.versions.length, 1)

  const re = await resynthesize(recording.id, undefined, undefined, 'mimo-v2.5-tts', WAV)
  assert.ok(re, 're-synthesis returns a version')
  index = await listRecordings()
  node = index.entries.find(entry => entry.id === recording.id)
  assert.equal(node.versions.length, 2, 'a new version is appended, old kept')

  await deleteVersion(recording.id, version.id)
  index = await listRecordings()
  node = index.entries.find(entry => entry.id === recording.id)
  assert.equal(node.versions.length, 1, 'one version removed')

  // Remove the remaining version; the node should disappear entirely.
  await deleteVersion(recording.id, node.versions[0].id)
  index = await listRecordings()
  assert.equal(index.entries.find(entry => entry.id === recording.id), undefined, 'node gone after last version')
})

test('recordings: groups repeated text under one node', async () => {
  const text = `语音历史分组自测-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const first = await addVersion(text, undefined, undefined, 'mimo-v2.5-tts', WAV)
  const second = await addVersion(text, undefined, undefined, 'mimo-v2.5-tts', WAV)
  assert.equal(first.recording.id, second.recording.id, 'same text → same node')
  assert.equal(second.recording.versions.length, 2, 'both takes grouped')

  // Clean up the whole node.
  for (const v of second.recording.versions) await deleteVersion(second.recording.id, v.id)
})
