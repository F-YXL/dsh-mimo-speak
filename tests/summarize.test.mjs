import test from 'node:test'
import assert from 'node:assert/strict'
import { polishSummary } from '../lib/node/summarize.js'

test('polishSummary strips markdown and keeps at most two sentences', () => {
  const raw = '**结论：三个 bug 都修好了。** 第二句是补充说明。第三句不该出现。'
  assert.equal(polishSummary(raw), '结论：三个 bug 都修好了。第二句是补充说明。')
})

test('polishSummary collapses whitespace and list markers', () => {
  assert.equal(polishSummary('- 第一点\n- 第二点'), '第一点 第二点')
})

test('polishSummary caps a runaway one-liner', () => {
  const out = polishSummary('很长的一句话'.repeat(40))
  assert.ok(out.length <= 111, String(out.length))
  assert.ok(out.endsWith('…'), out)
})

test('polishSummary returns empty for empty input', () => {
  assert.equal(polishSummary('   \n  '), '')
})

test('summarizeForSpeech returns undefined without an llm service', async () => {
  const { summarizeForSpeech } = await import('../lib/node/summarize.js')
  assert.equal(await summarizeForSpeech({}, '一段回复'), undefined)
})

test('summarizeForSpeech streams text from the selected model', async () => {
  const { summarizeForSpeech } = await import('../lib/node/summarize.js')
  const ctx = {
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: {
      stream: async function* () {
        yield { type: 'text-delta', index: 0, text: '结论是三个 bug 都修好了。' }
        yield { type: 'text-delta', index: 0, text: '顺带换掉了旧音色。' }
        yield { type: 'finish', reason: 'stop' }
      },
    },
  }
  assert.equal(await summarizeForSpeech(ctx, '很长的一段回复'), '结论是三个 bug 都修好了。顺带换掉了旧音色。')
})

test('summarizeForSpeech swallows provider failures', async () => {
  const { summarizeForSpeech } = await import('../lib/node/summarize.js')
  const ctx = {
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: {
      stream: async function* () {
        throw new Error('rate limited')
        yield { type: 'finish', reason: 'stop' }
      },
    },
  }
  assert.equal(await summarizeForSpeech(ctx, '一段回复'), undefined)
})

test('summarizeForSpeech resolves services through ctx.reflect', async () => {
  const { summarizeForSpeech } = await import('../lib/node/summarize.js')
  const services = {
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: {
      stream: async function* () {
        yield { type: 'text-delta', index: 0, text: '通过 reflect 拿到的服务。' }
      },
    },
  }
  const ctx = { reflect: { get: name => services[name] } }
  assert.equal(await summarizeForSpeech(ctx, '一段回复'), '通过 reflect 拿到的服务。')
})
