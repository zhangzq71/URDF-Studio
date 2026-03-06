/**
 * AI Service for robot generation, modification, and inspection
 */

import OpenAI from 'openai'
import type { RobotState, MotorSpec, InspectionReport } from '@/types'
import type { Language } from '@/shared/i18n'
import type { AIResponse } from '../types'
import { getEasterEggResponse } from '../config/easterEggs'
import { getGenerationSystemPrompt, getInspectionSystemPrompt } from '../config/prompts'
import { normalizeAIRobotResponse } from '../utils/normalizeRobotData'
import { processInspectionResults } from '../utils/processInspectionResults'
import { INSPECTION_CRITERIA } from '../utils/inspectionCriteria'

const getAiServiceTexts = (lang: Language) => ({
  apiKeyMissing:
    lang === 'zh'
      ? 'API Key 缺失，请先完成环境配置。'
      : 'API Key is missing. Please configure the environment.',
  noContentFromApi:
    lang === 'zh'
      ? 'API 返回了空内容，请重试。'
      : 'The API returned empty content. Please try again.',
  rawResponse: lang === 'zh' ? '原始响应' : 'Raw response',
  jsonParseFailed: (message: string) =>
    lang === 'zh'
      ? `JSON 解析失败: ${message || '未知错误'}`
      : `Failed to parse JSON: ${message || 'unknown error'}`,
  unknown: lang === 'zh' ? '未知' : 'Unknown',
  suggestedMotorOptions: lang === 'zh' ? '建议的电机选项：' : 'Suggested motor options:',
  generatedRobotSummary: (linkCount: number, jointCount: number) =>
    lang === 'zh'
      ? `已生成机器人结构。包含 ${linkCount} 个链接和 ${jointCount} 个关节。`
      : `Generated robot structure with ${linkCount} links and ${jointCount} joints.`,
  modifiedRobotSummary: (linkCount: number, jointCount: number) =>
    lang === 'zh'
      ? `已修改机器人结构。包含 ${linkCount} 个链接和 ${jointCount} 个关节。`
      : `Modified robot structure with ${linkCount} links and ${jointCount} joints.`,
  processedRequestNoRobotData:
    lang === 'zh'
      ? 'AI 已处理您的请求，但未返回机器人数据。'
      : 'AI processed your request but did not return robot data.',
  apiCallFailed: (message?: string, status?: number) =>
    lang === 'zh'
      ? `API 调用失败: ${message || '未知错误'}${status ? ` (状态码: ${status})` : ''}`
      : `API request failed: ${message || 'unknown error'}${status ? ` (status: ${status})` : ''}`,
  configurationError: lang === 'zh' ? '配置错误' : 'Configuration Error',
  inspectionError: lang === 'zh' ? '检查错误' : 'Inspection Error',
  parseError: lang === 'zh' ? '解析错误' : 'Parse Error',
  failedToGetInspectionResponse:
    lang === 'zh' ? '未能获取检查响应。' : 'Failed to get inspection response.',
  failedToParseInspectionResults:
    lang === 'zh' ? '未能解析检查结果。' : 'Failed to parse inspection results.',
  failedToCompleteInspection:
    lang === 'zh'
      ? '由于 AI 错误，检查未能完成。'
      : 'Failed to complete inspection due to an AI error.',
  inspectionEmptyContent:
    lang === 'zh' ? 'AI 服务返回了空内容。' : 'The AI service returned empty content.',
  aiServiceRequestFailed: (message?: string) =>
    lang === 'zh'
      ? `AI 服务无法处理该请求：${message || '未知错误'}`
      : `The AI service could not process the request: ${message || 'unknown error'}`,
})

/**
 * Create OpenAI client instance
 */
const createOpenAIClient = (): OpenAI => {
  return new OpenAI({
    apiKey: process.env.API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    dangerouslyAllowBrowser: true
  })
}

/**
 * Get model name from environment
 */
const getModelName = (): string => {
  return process.env.OPENAI_MODEL || 'bce/deepseek-v3.2'
}

/**
 * Get simplified robot context for AI prompts
 */
const getContextRobot = (robot: RobotState) => {
  return {
    name: robot.name,
    links: Object.values(robot.links).map(l => ({
      id: l.id,
      name: l.name,
      mass: l.inertial.mass,
      inertia: l.inertial.inertia
    })),
    joints: Object.values(robot.joints).map(j => ({
      id: j.id,
      name: j.name,
      type: j.type,
      parent: j.parentLinkId,
      child: j.childLinkId,
      axis: j.axis
    })),
    rootId: robot.rootLinkId
  }
}

/**
 * Parse JSON from AI response with fallback strategies
 */
const parseJSONResponse = (content: string, lang: Language): { result: unknown; error?: string } => {
  const text = getAiServiceTexts(lang)
  try {
    return { result: JSON.parse(content) }
  } catch (parseError) {
    const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonBlockMatch) {
      try {
        return { result: JSON.parse(jsonBlockMatch[1]) }
      } catch {
        // Continue to next fallback
      }
    }

    const firstOpen = content.indexOf('{')
    const lastClose = content.lastIndexOf('}')
    if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
      try {
        return { result: JSON.parse(content.substring(firstOpen, lastClose + 1)) }
      } catch {
        // Continue to error
      }
    }

    return {
      result: null,
      error: text.jsonParseFailed((parseError as Error)?.message || '')
    }
  }
}

const extractExplanationText = (parsedResult: Record<string, unknown>, lang: Language): string | undefined => {
  const text = getAiServiceTexts(lang)
  let explanationText = parsedResult.explanation as string | undefined
  if (!explanationText) {
    if (parsedResult.recommendation) {
      explanationText = parsedResult.recommendation as string
    } else if (parsedResult.analysis) {
      explanationText =
        typeof parsedResult.analysis === 'string'
          ? parsedResult.analysis
          : JSON.stringify(parsedResult.analysis)
    } else if (
      parsedResult.suggestions &&
      Array.isArray(parsedResult.suggestions) &&
      parsedResult.suggestions.length > 0
    ) {
      explanationText =
        `${text.suggestedMotorOptions}\n` +
        parsedResult.suggestions
          .map(
            (s: Record<string, unknown>, i: number) =>
              `${i + 1}. ${s.name || s.model || text.unknown}: ${s.torque || s.effort || 'N/A'} Nm`
          )
          .join('\n')
    }
  }

  return explanationText
}

const extractRobotData = (parsedResult: Record<string, unknown>): Record<string, unknown> | null => {
  return (parsedResult.robotData ||
    parsedResult.robot ||
    (parsedResult.links || parsedResult.joints ? parsedResult : null)) as Record<string, unknown> | null
}

const buildInspectionCriteriaDescription = (
  selectedItems: Record<string, string[]> | undefined,
  lang: 'en' | 'zh'
): string => {
  return INSPECTION_CRITERIA.map(category => {
    const selectedItemIds = selectedItems?.[category.id] || []
    if (selectedItemIds.length === 0) return null

    const categoryName = lang === 'zh' ? category.nameZh : category.name
    const itemsDesc = category.items
      .filter(item => selectedItemIds.includes(item.id))
      .map(item => {
        const itemName = lang === 'zh' ? item.nameZh : item.name
        const itemDesc = lang === 'zh' ? item.descriptionZh : item.description
        return `    - ${itemName} (${item.id}): ${itemDesc}`
      })
      .join('\n')

    if (itemsDesc) {
      return `  ${category.id} (${categoryName}, weight: ${category.weight * 100}%):\n${itemsDesc}`
    }
    return null
  })
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Generate or modify robot from natural language prompt
 */
export const generateRobotFromPrompt = async (
  prompt: string,
  currentRobot: RobotState,
  motorLibrary: Record<string, MotorSpec[]>,
  lang: Language = 'en'
): Promise<AIResponse | null> => {
  const text = getAiServiceTexts(lang)
  const easterEggResponse = getEasterEggResponse(prompt)
  if (easterEggResponse) {
    return easterEggResponse
  }

  if (!process.env.API_KEY) {
    console.error('API Key missing')
    console.error('Available env vars:', {
      API_KEY: process.env.API_KEY ? '***' : 'missing',
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
      OPENAI_MODEL: process.env.OPENAI_MODEL
    })
    return {
      explanation: text.apiKeyMissing,
      actionType: 'advice'
    }
  }

  const openai = createOpenAIClient()
  const modelName = getModelName()

  console.log('[AI Service] Configuration:', {
    model: modelName,
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    hasApiKey: !!process.env.API_KEY
  })

  const contextRobot = {
    name: currentRobot.name,
    links: Object.values(currentRobot.links).map(l => ({
      id: l.id,
      name: l.name,
      visual: l.visual,
      inertial: l.inertial
    })),
    joints: Object.values(currentRobot.joints).map(j => ({
      id: j.id,
      name: j.name,
      type: j.type,
      parent: j.parentLinkId,
      child: j.childLinkId,
      origin: j.origin,
      axis: j.axis,
      limit: j.limit,
      hardware: j.hardware
    })),
    rootId: currentRobot.rootLinkId
  }

  const contextLibrary = Object.entries(motorLibrary).map(([brand, motors]) => ({
    brand,
    motors: motors.map(m => ({
      name: m.name,
      effort: m.effort,
      velocity: m.velocity,
      weight: m.armature
    }))
  }))

  const systemPrompt = getGenerationSystemPrompt({
    robot: contextRobot,
    motorLibrary: contextLibrary
  })

  try {
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      response_format: {
        type: 'json_object'
      },
      temperature: 0.7
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      console.error('No content in API response')
      return {
        explanation: text.noContentFromApi,
        actionType: 'advice' as const
      }
    }

    console.log('[AI Service] Raw response content:', content.substring(0, 200) + '...')

    const { result, error } = parseJSONResponse(content, lang)
    if (!result) {
      return {
        explanation: `${error}\n\n${text.rawResponse}: ${content.substring(0, 500)}`,
        actionType: 'advice' as const
      }
    }

    const parsedResult = result as Record<string, unknown>
    console.log('[AI Service] Parsed JSON result:', parsedResult)
    console.log('[AI Service] Result keys:', Object.keys(parsedResult))

    const data = extractRobotData(parsedResult)

    console.log('[AI Service] Extracted data:', data ? 'Found robot data' : 'No robot data')
    if (data) {
      console.log('[AI Service] Data keys:', Object.keys(data))
      console.log('[AI Service] Data content:', data)
    }

    const explanationText = extractExplanationText(parsedResult, lang)

    let finalRobotState: Partial<RobotState> | undefined = undefined
    if (data) {
      const normalized = normalizeAIRobotResponse(data)
      if (normalized) {
        console.log('[AI Service] Processed links:', Object.keys(normalized.links).length)
        console.log('[AI Service] Processed joints:', Object.keys(normalized.joints).length)

        finalRobotState = {
          name: normalized.name,
          links: normalized.links,
          joints: normalized.joints,
          rootLinkId: normalized.rootLinkId as string
        }
      }
    }

    let actionType: 'modification' | 'generation' | 'advice' =
      (parsedResult.actionType as 'modification' | 'generation' | 'advice') || 'advice'
    if (finalRobotState && (finalRobotState.links || finalRobotState.joints)) {
      actionType =
        (parsedResult.actionType as 'modification' | 'generation' | 'advice') ||
        (Object.keys(currentRobot.links).length === 0 ? 'generation' : 'modification')
    }

    let explanation = explanationText
    if (!explanation) {
      if (finalRobotState) {
        const linkCount = Object.keys(finalRobotState.links || {}).length
        const jointCount = Object.keys(finalRobotState.joints || {}).length
        explanation =
          actionType === 'generation'
            ? text.generatedRobotSummary(linkCount, jointCount)
            : text.modifiedRobotSummary(linkCount, jointCount)
      } else {
        explanation = text.processedRequestNoRobotData
      }
    }

    console.log('[AI Service] Final response:', {
      explanation: explanation?.substring(0, 50) + '...',
      actionType,
      hasRobotData: !!finalRobotState
    })

    return {
      explanation,
      actionType,
      robotData: finalRobotState
    }
  } catch (e: unknown) {
    const error = e as { message?: string; status?: number; code?: string; response?: unknown }
    console.error('OpenAI API call failed', e)
    console.error('Error details:', {
      message: error?.message,
      status: error?.status,
      code: error?.code,
      response: error?.response
    })

    return {
      explanation: text.apiCallFailed(error?.message, error?.status),
      actionType: 'advice' as const
    }
  }
}

/**
 * Run robot inspection with AI
 */
export const runRobotInspection = async (
  robot: RobotState,
  selectedItems?: Record<string, string[]>,
  lang: Language = 'en'
): Promise<InspectionReport | null> => {
  const text = getAiServiceTexts(lang)
  if (!process.env.API_KEY) {
    console.error('API Key missing')
    return {
      summary: text.apiKeyMissing,
      issues: [
        {
          type: 'error',
          title: text.configurationError,
          description: text.apiKeyMissing
        }
      ]
    }
  }

  const openai = createOpenAIClient()
  const modelName = getModelName()
  const contextRobot = getContextRobot(robot)

  const criteriaDescription = buildInspectionCriteriaDescription(selectedItems, lang)
  const systemPrompt = getInspectionSystemPrompt(lang, { criteriaDescription })

  try {
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Inspect this robot structure:\n${JSON.stringify(contextRobot)}` }
      ],
      response_format: {
        type: 'json_object'
      },
      temperature: 0.7
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return {
        summary: text.failedToGetInspectionResponse,
        issues: [
          {
            type: 'error',
            title: text.inspectionError,
            description: text.inspectionEmptyContent
          }
        ]
      }
    }

    console.log('[Inspection] Raw response content:', content.substring(0, 200) + '...')

    const { result, error } = parseJSONResponse(content, lang)
    if (!result) {
      return {
        summary: text.failedToParseInspectionResults,
        issues: [
          {
            type: 'error',
            title: text.parseError,
            description: `${error}\n\n${text.rawResponse}: ${content.substring(0, 500)}`
          }
        ]
      }
    }

    return processInspectionResults(result, selectedItems, lang)
  } catch (e: unknown) {
    const error = e as { message?: string }
    console.error('Inspection failed', e)
    return {
      summary: text.failedToCompleteInspection,
      issues: [
        {
          type: 'error',
          title: text.inspectionError,
          description: text.aiServiceRequestFailed(error?.message)
        }
      ]
    }
  }
}
