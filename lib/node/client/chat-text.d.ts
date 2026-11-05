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
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client';
import type { MessageId } from '@deepseek-ai/dsh-api-remotes/client';
import type { ReadScope } from '../settings.ts';
/**
 * Extract the speakable text of one finalized assistant message.
 * @param snapshot - current Chat snapshot of the viewed Session.
 * @param messageId - durable identity of the target assistant message.
 * @param scope - which parts of the reply are read aloud.
 * @returns the message's text blocks joined in order, or undefined when the
 * message is not in the loaded window.
 */
export declare function speakableTextFor(snapshot: ChatSnapshot, messageId: MessageId, scope?: ReadScope): string | undefined;
/**
 * Identify the newest finalized assistant message in the Chat snapshot.
 *
 * Automatic read-aloud only ever speaks this message, so a reply that
 * finished while the user scrolled up, or an older reply re-rendered for any
 * other reason, never steals the speaker.
 * @param snapshot - current Chat snapshot of the viewed Session.
 * @returns the message id of the newest assistant step, or an empty string.
 */
export declare function latestAssistantMessageId(snapshot: ChatSnapshot): string;
