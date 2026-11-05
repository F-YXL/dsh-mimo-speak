import test from 'node:test'
import assert from 'node:assert/strict'
import { clampText, toSpeakableText } from '../lib/node/normalize.js'

test('toSpeakableText strips Markdown decoration and keeps the words', () => {
  const markdown = [
    '# 标题',
    '',
    '这是 **加粗** 与 *斜体*，还有 `行内代码`。',
    '',
    '```ts',
    'const x = 1',
    '```',
    '',
    '- 列表项一',
    '1. 列表项二',
    '',
    '> 引用一句',
    '',
    '| A | B |',
    '| --- | --- |',
    '| 一 | 二 |',
    '',
    '链接 [示例文字](https://example.com/x) 与图片 ![图](img.png)。',
    '<b>标签</b> 内容',
  ].join('\n')
  const speakable = toSpeakableText(markdown)
  assert.match(speakable, /标题/)
  assert.match(speakable, /这是 加粗 与 斜体，还有 行内代码。/)
  assert.match(speakable, /代码略。/)
  assert.doesNotMatch(speakable, /const x = 1/)
  assert.doesNotMatch(speakable, /https?:\/\//)
  assert.doesNotMatch(speakable, /```|\*\*|<b>/)
  assert.match(speakable, /示例文字/)
  assert.match(speakable, /一，二/)
})

test('toSpeakableText keeps escaped punctuation and collapses whitespace', () => {
  assert.equal(toSpeakableText('a\\*b    c\n\n\nd'), 'a*b c\nd')
})

test('clampText keeps short text and cuts long text at a sentence boundary', () => {
  assert.equal(clampText('短句。', 10), '短句。')
  const long = '第一句内容较长一些。第二句内容。'
  const clamped = clampText(long, 10)
  assert.ok(clamped.length <= 10)
  assert.equal(clamped, '第一句内容较长一些。')
  // No boundary inside the budget: a hard cut is still a valid prefix.
  assert.equal(clampText('abcdefghijk', 5), 'abcde')
})
