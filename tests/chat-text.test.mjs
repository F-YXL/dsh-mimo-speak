import test from 'node:test'
import assert from 'node:assert/strict'
import { speakableTextFor } from '../lib/node/client/chat-text.js'

/** Build one assistant-step Chat node as the ui-chat contract materializes it. */
function assistantNode({ anchorSeq, turn, messageId, blocks, visibility = 'visible' }) {
  return {
    kind: 'assistant-step',
    target: 'chat',
    anchorSeq,
    visibility,
    location: { kind: 'turn', turn: { turn } },
    data: {
      status: 'settled',
      turn,
      step: 0,
      blocks,
      time: 0,
      finalNode: { kind: 'assistant', seq: anchorSeq, messageId, time: 0, turn, step: 0, blocks },
    },
  }
}

const blocks = [
  { kind: 'text', text: '第一段。' },
  { kind: 'reasoning', text: '内部推理不应被朗读。' },
  { kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{}' },
  { kind: 'text', text: '第二段。' },
]

test('speakableTextFor returns only the message prose', () => {
  const node = assistantNode({ anchorSeq: 10, turn: 1, messageId: 'm1', blocks })
  const snapshot = { nodes: { values: () => [node] } }
  assert.equal(speakableTextFor(snapshot, 'm1'), '第一段。\n第二段。')
})

test('speakableTextFor ignores reasoning and tool blocks and other messages', () => {
  const mine = assistantNode({ anchorSeq: 10, turn: 1, messageId: 'm1', blocks })
  const other = assistantNode({ anchorSeq: 4, turn: 1, messageId: 'm0', blocks: [{ kind: 'text', text: '别人的。' }] })
  const snapshot = { nodes: { values: () => [other, mine] } }
  assert.equal(speakableTextFor(snapshot, 'm1'), '第一段。\n第二段。')
})

test('speakableTextFor returns undefined for a message outside the loaded window', () => {
  const node = assistantNode({ anchorSeq: 10, turn: 1, messageId: 'm1', blocks })
  const snapshot = { nodes: { values: () => [node] } }
  assert.equal(speakableTextFor(snapshot, 'missing'), undefined)
})

test('speakableTextFor prefers the visible rendering of a duplicated message', () => {
  const hidden = assistantNode({ anchorSeq: 10, turn: 1, messageId: 'm1', blocks: [{ kind: 'text', text: '折叠的。' }], visibility: 'hidden' })
  const visible = assistantNode({ anchorSeq: 11, turn: 1, messageId: 'm1', blocks: [{ kind: 'text', text: '可见的。' }] })
  const snapshot = { nodes: { values: () => [hidden, visible] } }
  assert.equal(speakableTextFor(snapshot, 'm1'), '可见的。')
})


test('brief scope hands the whole prose to the summarizer', () => {
  const long = `总的说有三点。${'细节说明很长很长。'.repeat(30)}`
  const snapshot = {
    nodes: new Map([[
      1,
      assistantNode({
        anchorSeq: 1,
        turn: 1,
        messageId: 'm-1',
        blocks: [
          { kind: 'text', text: long },
          { kind: 'code', language: 'ts', text: 'const a = 1' },
        ],
      }),
    ]]),
  }
  const prose = speakableTextFor(snapshot, 'm-1', 'brief')
  assert.equal(prose, long)
  // Code never reaches the summarizer: it is not speakable prose.
  assert.ok(!prose.includes('const a = 1'), prose)
})
