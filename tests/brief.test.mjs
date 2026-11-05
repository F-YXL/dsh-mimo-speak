import test from 'node:test'
import assert from 'node:assert/strict'
import { briefText } from '../lib/node/brief.js'

const PAD = '这一句是用来把文本推过阈值的补充说明，内容本身并不重要。'

test('short text is returned whole, without a false summary', () => {
  const text = '任务完成。三个文件都改好了。'
  assert.equal(briefText(text, 260, 6), text)
})

test('each block contributes only its first sentence', () => {
  const text = `${PAD}${PAD}${PAD}\n${PAD}细节一。细节二。\n${PAD}更多细节。`
  const brief = briefText(text, 100, 6)
  // Three blocks, one opening sentence each, in order.
  assert.equal(brief, `${PAD}${PAD}${PAD}`, brief)
  assert.ok(!brief.includes('细节一'), brief)
})

test('a single long block contributes its opening sentences', () => {
  const text = '第一句。第二句。第三句。第四句。'.repeat(10)
  const brief = briefText(text, 100, 2)
  assert.equal(brief, '第一句。第二句。')
})

test('tables, bare links and rules are never spoken', () => {
  const text = `${PAD}${PAD}${PAD}\n| 方案 | 结论 |\n| --- | --- |\nhttps://example.com/x\n---`
  const brief = briefText(text, 120, 6)
  assert.ok(!brief.includes('|'), brief)
  assert.ok(!brief.includes('http'), brief)
  assert.ok(!brief.includes('---'), brief)
})

test('emphasis markers never leak a stray asterisk into speech', () => {
  const text = `**重点**：${PAD}${PAD}${PAD}\n**第二点**：${PAD}`
  const brief = briefText(text, 200, 6)
  assert.ok(!brief.includes('*'), brief)
  assert.ok(brief.startsWith('重点：'), brief)
})

test('prefix is spoken before the brief', () => {
  const text = `${PAD}${PAD}${PAD}\n${PAD}`
  const brief = briefText(text, 100, 6, '简要播报。')
  assert.ok(brief.startsWith('简要播报。'), brief)
})

test('empty input yields empty output', () => {
  assert.equal(briefText('   \n\n  '), '')
})
