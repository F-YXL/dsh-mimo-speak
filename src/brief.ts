/**
 * Extractive briefing for long replies.
 *
 * A spoken reply does not need every caveat a written one carries: the point of
 * read-aloud is to know what happened. The rule is deliberately mechanical, so
 * the result is predictable and fits in one sentence:
 *
 * **一段一行，只念每段的第一句；整篇只有一段时念前几句。**
 *
 * Table rows, bare links, code notes and horizontal rules are skipped, because
 * reading them aloud conveys nothing. Nothing is invented and no model is
 * called, so a brief always agrees with the reply it came from.
 * @module dsh-mimo-speak/brief
 */

/** Terminators that really end a sentence. */
const STRONG_TERMINATORS = new Set(['。', '！', '？', '；', '!', '?', ';', '…'])

/** Leading decoration that exists for the screen, not the ear. */
const DECORATION = /^[\s#>]*[-+*•·]?\s*/u

/** Whole lines that carry no speakable meaning in a brief. */
const SKIPPED_LINE = /^(?:-{3,}|\*{3,}|_{3,}|代码略[。.]?|code omitted[.]?)$/iu

/**
 * Split one block into sentences, keeping each terminator.
 * @param block - one non-empty line of speakable text.
 * @returns its sentences, in order.
 */
function sentencesOf(block: string): string[] {
  const out: string[] = []
  let buffer = ''
  for (const character of block) {
    buffer += character
    if (STRONG_TERMINATORS.has(character)) {
      out.push(buffer.trim())
      buffer = ''
    }
  }
  if (buffer.trim() !== '') out.push(buffer.trim())
  return out.filter(sentence => sentence !== '')
}

/**
 * Condense text into its opening points.
 * @param text - speakable plain text (already markdown-normalized).
 * @param limit - soft character budget for the result.
 * @param maxSentences - hard cap on spoken sentences.
 * @param prefix - optional lead-in spoken before the brief (e.g. 「简要播报」).
 * @returns the briefed text; the input itself when it is already short.
 */
export function briefText(
  text: string,
  limit = 260,
  maxSentences = 6,
  prefix = '',
): string {
  const blocks = text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      if (trimmed === '') return false
      // Table rows and rules are layout, not speech.
      if (trimmed.startsWith('|')) return false
      if (SKIPPED_LINE.test(trimmed)) return false
      // A bare URL is not worth anyone's reading time.
      if (/^https?:\/\/\S+$/u.test(trimmed)) return false
      return true
    })
    .map(line => line
      // Emphasis markers survive into this stage (Markdown normalization runs
      // later, on the Host), so strip them before decoration: `**重点**：`
      // must not leave a stray `*` at the start of a spoken sentence.
      .replace(/(\*\*|__|~~)/gu, '')
      .replace(/[*_]([^*_\n]+)[*_]/gu, '$1')
      .replace(DECORATION, '')
      .trim())
    .filter(line => line !== '')

  if (blocks.length === 0) return ''
  const whole = blocks.join('\n')
  // Short enough to read whole: a brief would only lose detail.
  if (whole.length <= limit) return whole

  const picks: string[] = []
  let used = 0
  /** @returns whether another sentence still fits. */
  const take = (sentence: string): boolean => {
    if (picks.length > 0 && used + sentence.length > limit) return false
    picks.push(sentence)
    used += sentence.length
    return picks.length < maxSentences
  }

  if (blocks.length === 1) {
    // One long paragraph: read its opening sentences.
    for (const sentence of sentencesOf(blocks[0])) {
      if (!take(sentence)) break
    }
  } else {
    // Structured reply: one line per point, so read each point's first sentence.
    for (const block of blocks) {
      const first = sentencesOf(block)[0]
      if (first === undefined) continue
      if (!take(first)) break
    }
  }

  const body = picks.join('')
  return prefix === '' ? body : `${prefix}${body}`
}
