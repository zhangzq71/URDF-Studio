import type { ConversationHistoryTurn } from '../services/conversationService'
import type { AIConversationChatMessage, AIConversationMessage } from '../types'

export function createConversationMessage(
  role: 'user' | 'assistant',
  content: string,
): AIConversationChatMessage {
  return {
    kind: 'message',
    role,
    content,
  }
}

export function createNewConversationDivider(): AIConversationMessage {
  return {
    kind: 'divider',
    marker: 'new-conversation',
  }
}

export function isConversationChatMessage(
  message: AIConversationMessage,
): message is AIConversationChatMessage {
  return message.kind === 'message'
}

export function isConversationDivider(message: AIConversationMessage): boolean {
  return message.kind === 'divider'
}

function findLastConversationDividerIndex(messages: AIConversationMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (isConversationDivider(messages[index])) {
      return index
    }
  }

  return -1
}

export function getActiveConversationHistory(
  messages: AIConversationMessage[],
): ConversationHistoryTurn[] {
  const history: ConversationHistoryTurn[] = []

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message) {
      continue
    }

    if (isConversationDivider(message)) {
      break
    }

    const content = message.content.trim()
    if (!content) {
      continue
    }

    history.unshift({
      role: message.role,
      content: message.content,
    })
  }

  return history
}

export function removeTrailingAssistantPlaceholder(
  messages: AIConversationMessage[],
): AIConversationMessage[] {
  if (messages.length === 0) {
    return messages
  }

  const nextMessages = [...messages]

  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    const message = nextMessages[index]
    if (!message || isConversationDivider(message)) {
      return nextMessages
    }

    if (message.role !== 'assistant') {
      return nextMessages
    }

    if (message.content.trim()) {
      return nextMessages
    }

    nextMessages.splice(index, 1)
    return nextMessages
  }

  return nextMessages
}

export function startNewConversationTimeline(
  messages: AIConversationMessage[],
): AIConversationMessage[] {
  const normalizedMessages = removeTrailingAssistantPlaceholder(messages)
  if (!normalizedMessages.some(isConversationChatMessage)) {
    return normalizedMessages
  }

  const lastMessage = normalizedMessages[normalizedMessages.length - 1]
  if (lastMessage && isConversationDivider(lastMessage)) {
    return normalizedMessages
  }

  return [...normalizedMessages, createNewConversationDivider()]
}

export function replaceActiveConversationTimeline(
  messages: AIConversationMessage[],
  nextActiveConversationMessages: AIConversationChatMessage[],
): AIConversationMessage[] {
  const lastDividerIndex = findLastConversationDividerIndex(messages)
  if (lastDividerIndex === -1) {
    return [...nextActiveConversationMessages]
  }

  return [
    ...messages.slice(0, lastDividerIndex + 1),
    ...nextActiveConversationMessages,
  ]
}
