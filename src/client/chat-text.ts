/**
 * Locate one finalized assistant message's speakable text in the Chat snapshot.
 *
 * The `conversation.chat.assistant-actions` seat receives only the durable
 * `messageId`, so the entry derives the words it speaks from the current
 * Conversation binding: the settled assistant node carrying that message id
 * supplies its text blocks. Reasoning and tool-call blocks are never spoken —
 * the message's prose is what the action row belongs to.
 * @module dsh-mimo-speak/client/chat-text
 */

// Type-only: pulls the ui-chat contract's Chat snapshot and node vocabulary.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { AssistantChatData, ChatNode, ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
// Type-only: the durable message identity the action seat carries.
import type { MessageId } from '@deepseek-ai/dsh-api-remotes/client'
import type { ReadScope } from '../settings.ts'

/** One text-bearing block of an assistant message, whatever its kind. */
interface SpeakableBlock {
  kind: string
  text: string
}

/** Code blocks shorter than this many lines are worth speaking in smart mode. */
const SMART_CODE_LINE_LIMIT = 24

/** Whether a block contributes text under the active read scope. */
function blockIncluded(block: SpeakableBlock, scope: ReadScope): boolean {
  if (block.kind === 'text') return true
  // Both text-only scopes skip everything that is not prose; `brief` condenses
  // the prose afterwards, in the speak entry (model summary, else the offline rule).
  if (scope === 'text' || scope === 'brief') return false
  if (block.kind !== 'code') return false
  if (scope === 'all') return true
  // Smart: speak short code snippets only; long listings are skipped.
  const lines = block.text.split('\n').length
  return lines <= SMART_CODE_LINE_LIMIT && block.text.length <= 1200
}

/**
 * Extract the speakable text of one finalized assistant message.
 * @param snapshot - current Chat snapshot of the viewed Session.
 * @param messageId - durable identity of the target assistant message.
 * @param scope - which parts of the reply are read aloud.
 * @returns the message's text blocks joined in order, or undefined when the
 * message is not in the loaded window.
 */
export function speakableTextFor(
  snapshot: ChatSnapshot,
  messageId: MessageId,
  scope: ReadScope = 'text',
): string | undefined {
  const matches: { anchorSeq: number; visibility: string; text: string }[] = []
  for (const node of snapshot.nodes.values()) {
    if (node.kind !== 'assistant-step') continue
    // One narrowing cast: the store's rows are the kind-payload pairs the
    // ui-chat contract declares, keyed exactly as this check reads them.
    const candidate = node as ChatNode<'assistant-step'>
    const data = candidate.data as AssistantChatData
    const blocks = data.finalNode?.blocks ?? data.blocks
    if (data.finalNode?.messageId !== messageId) continue
    const text = blocks
      .filter(block => blockIncluded(block as unknown as SpeakableBlock, scope))
      .map(block => (block as unknown as SpeakableBlock).text)
      .join('\n')
      .trim()
    matches.push({ anchorSeq: candidate.anchorSeq, visibility: candidate.visibility, text })
  }
  if (matches.length === 0) return undefined
  // Prefer the visible rendering of the message; hidden duplicates (folded
  // process views) carry the same words.
  const preferred = matches.find(match => match.visibility === 'visible') ?? matches[0]
  return preferred.text
}

/**
 * Identify the newest finalized assistant message in the Chat snapshot.
 *
 * Automatic read-aloud only ever speaks this message, so a reply that
 * finished while the user scrolled up, or an older reply re-rendered for any
 * other reason, never steals the speaker.
 * @param snapshot - current Chat snapshot of the viewed Session.
 * @returns the message id of the newest assistant step, or an empty string.
 */
export function latestAssistantMessageId(snapshot: ChatSnapshot): string {
  let latestSeq = -1
  let latestId = ''
  for (const node of snapshot.nodes.values()) {
    if (node.kind !== 'assistant-step') continue
    const candidate = node as ChatNode<'assistant-step'>
    const data = candidate.data as AssistantChatData
    const id = data.finalNode?.messageId
    if (typeof id !== 'string' || id === '') continue
    if (candidate.anchorSeq > latestSeq) {
      latestSeq = candidate.anchorSeq
      latestId = id
    }
  }
  return latestId
}
