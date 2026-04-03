import OpenAI from 'openai'
import { translations, type Language } from '@/shared/i18n'
import { getConversationSystemPrompt, type ConversationMode } from '../config/prompts'

export interface ConversationHistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface SendConversationTurnInput {
  mode: ConversationMode
  lang?: Language
  context: string
  history?: ConversationHistoryTurn[]
  userMessage: string
}

export interface SendConversationTurnStreamInput extends SendConversationTurnInput {
  signal?: AbortSignal
  onReplyDelta?: (delta: string) => void
}

export interface ConversationTurnResult {
  reply: string
}

export interface ConversationTurnStreamResult extends ConversationTurnResult {
  status: 'completed' | 'aborted' | 'error'
}

interface ConversationStreamChunkLike {
  choices?: Array<{
    delta?: {
      content?: string | null
    }
  }>
}

interface ConversationCompletionLike {
  choices?: Array<{
    message?: {
      content?: string | Array<unknown> | null
    }
  }>
}

const MAX_HISTORY_TURNS = 8

const getApiKey = (): string => {
  const candidates = [
    process.env.API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.GEMINI_API_KEY,
  ]

  for (const candidate of candidates) {
    const value = candidate?.trim()
    if (value) {
      return value
    }
  }

  return ''
}

const getBaseUrl = (): string => {
  return process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1'
}

const createOpenAIClient = (apiKey: string): OpenAI => {
  return new OpenAI({
    apiKey,
    baseURL: getBaseUrl(),
    dangerouslyAllowBrowser: true,
  })
}

const getModelName = (): string => {
  return process.env.OPENAI_MODEL?.trim() || 'bce/deepseek-v3.2'
}

const getConversationTexts = (lang: Language) => {
  const t = translations[lang]
  return {
    missingApiKey: t.apiKeyMissing,
    emptyResponse: t.aiServiceReturnedEmptyContent,
    unknownError: t.unknownError,
    requestFailed: (message?: string) =>
      t.aiServiceCouldNotProcessRequest.replace('{message}', message || t.unknownError.toLowerCase()),
  }
}

const sanitizeHistoryTurn = (turn: ConversationHistoryTurn): ConversationHistoryTurn | null => {
  if (!turn.content) return null
  const content = turn.content.trim()
  if (!content) return null
  if (turn.role !== 'user' && turn.role !== 'assistant') return null
  return {
    role: turn.role,
    content,
  }
}

export const buildConversationMessages = (
  history: ConversationHistoryTurn[] | undefined,
  userMessage: string
): Array<{ role: 'user' | 'assistant'; content: string }> => {
  const normalizedHistory = (history || [])
    .map(sanitizeHistoryTurn)
    .filter((turn): turn is ConversationHistoryTurn => Boolean(turn))
    .slice(-MAX_HISTORY_TURNS)

  const normalizedUserMessage = userMessage.trim()
  const messages = normalizedHistory.map(turn => ({
    role: turn.role,
    content: turn.content,
  }))

  messages.push({
    role: 'user',
    content: normalizedUserMessage,
  })

  return messages
}

export const serializeConversationHistory = (history: ConversationHistoryTurn[] | undefined): string => {
  const normalizedHistory = (history || [])
    .map(sanitizeHistoryTurn)
    .filter((turn): turn is ConversationHistoryTurn => Boolean(turn))
    .slice(-MAX_HISTORY_TURNS)

  return JSON.stringify(normalizedHistory)
}

const fallbackReplyForError = (lang: Language, message: string): ConversationTurnResult => {
  return {
    reply: lang === 'zh' ? `对话服务错误：${message}` : `Conversation service error: ${message}`,
  }
}

export const isConversationAbortError = (error: unknown): boolean => {
  return error instanceof OpenAI.APIUserAbortError
    || (error instanceof Error && error.name === 'AbortError')
}

export const extractConversationDelta = (chunk: ConversationStreamChunkLike | null | undefined): string => {
  if (!chunk?.choices?.length) {
    return ''
  }

  return chunk.choices
    .map((choice) => choice.delta?.content ?? '')
    .join('')
}

const extractConversationCompletionTextPart = (part: unknown): string => {
  if (typeof part === 'string') {
    return part
  }

  if (!part || typeof part !== 'object') {
    return ''
  }

  const text = (part as { text?: unknown }).text
  if (typeof text === 'string') {
    return text
  }

  if (text && typeof text === 'object') {
    const value = (text as { value?: unknown }).value
    if (typeof value === 'string') {
      return value
    }
  }

  return ''
}

const extractConversationCompletionText = (
  completion: ConversationCompletionLike | null | undefined
): string => {
  if (!completion?.choices?.length) {
    return ''
  }

  return completion.choices
    .map((choice) => {
      const content = choice.message?.content
      if (typeof content === 'string') {
        return content
      }

      if (!Array.isArray(content)) {
        return ''
      }

      return content
        .map(extractConversationCompletionTextPart)
        .join('')
    })
    .join('')
    .trim()
}

const shouldRetryWithoutStream = (error: unknown, partialReply: string): boolean => {
  if (partialReply.trim()) {
    return false
  }

  if (error instanceof OpenAI.APIConnectionTimeoutError || error instanceof OpenAI.APIConnectionError) {
    return true
  }

  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return message.includes('connection error')
    || message.includes('failed to fetch')
    || message.includes('fetch failed')
    || message.includes('network')
    || message.includes('stream')
}

export const sendConversationTurnStream = async ({
  mode,
  lang = 'en',
  context,
  history = [],
  userMessage,
  signal,
  onReplyDelta,
}: SendConversationTurnStreamInput): Promise<ConversationTurnStreamResult> => {
  const text = getConversationTexts(lang)
  const trimmedMessage = userMessage.trim()

  if (!trimmedMessage) {
    const fallback = fallbackReplyForError(lang, text.emptyResponse)
    return {
      reply: fallback.reply,
      status: 'error',
    }
  }

  const apiKey = getApiKey()
  if (!apiKey) {
    const fallback = fallbackReplyForError(lang, text.missingApiKey)
    return {
      reply: fallback.reply,
      status: 'error',
    }
  }

  const systemPrompt = getConversationSystemPrompt(lang, {
    mode,
    context,
    history: serializeConversationHistory(history),
  })

  const openai = createOpenAIClient(apiKey)
  const modelName = getModelName()
  const messages = buildConversationMessages(history, trimmedMessage)
  const requestMessages = [{ role: 'system' as const, content: systemPrompt }, ...messages]
  let reply = ''

  try {
    const stream = await openai.chat.completions.create({
      model: modelName,
      messages: requestMessages,
      temperature: 0.3,
      stream: true,
    }, {
      signal,
    })

    for await (const chunk of stream) {
      const delta = extractConversationDelta(chunk)
      if (!delta) {
        continue
      }

      reply += delta
      onReplyDelta?.(delta)
    }

    const normalizedReply = reply.trim()
    if (!normalizedReply) {
      const fallback = fallbackReplyForError(lang, text.emptyResponse)
      return {
        reply: fallback.reply,
        status: 'error',
      }
    }

    return {
      reply: normalizedReply,
      status: 'completed',
    }
  } catch (error) {
    if (isConversationAbortError(error) || signal?.aborted) {
      return {
        reply: reply.trim(),
        status: 'aborted',
      }
    }

    if (shouldRetryWithoutStream(error, reply)) {
      console.warn('Conversation stream request failed, retrying without stream', error)

      try {
        const completion = await openai.chat.completions.create({
          model: modelName,
          messages: requestMessages,
          temperature: 0.3,
        }, {
          signal,
        })

        const recoveredReply = extractConversationCompletionText(completion)
        if (recoveredReply) {
          return {
            reply: recoveredReply,
            status: 'completed',
          }
        }

        const fallback = fallbackReplyForError(lang, text.emptyResponse)
        return {
          reply: fallback.reply,
          status: 'error',
        }
      } catch (fallbackError) {
        if (isConversationAbortError(fallbackError) || signal?.aborted) {
          return {
            reply: reply.trim(),
            status: 'aborted',
          }
        }

        console.error('Conversation non-stream fallback failed', fallbackError)
        error = fallbackError
      }
    }

    const e = error as { message?: string }
    console.error('Conversation request failed', error)
    return {
      ...fallbackReplyForError(lang, text.requestFailed(e?.message)),
      status: 'error',
    }
  }
}

export const sendConversationTurn = async (input: SendConversationTurnInput): Promise<ConversationTurnResult> => {
  const result = await sendConversationTurnStream(input)
  return { reply: result.reply }
}
