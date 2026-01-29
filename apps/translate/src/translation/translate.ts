/**
 * OpenRouter Translation API integration
 * Handles translation with type-specific prompts for segments vs pathnames
 */

import { PATHNAME_PROMPT, SEGMENT_PROMPT } from './prompts.js'
import type { TokenUsage } from '@pantolingo/db'

export interface TranslationItem {
	text: string
	type: 'segment' | 'pathname'
}

export type TranslationStyle = 'literal' | 'balanced' | 'natural'

interface TranslateSingleResult {
	translation: string
	usage: TokenUsage
}

export interface TranslateBatchResult {
	translations: string[]
	totalUsage: TokenUsage
	apiCallCount: number
}

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'anthropic/claude-haiku-4.5'

/**
 * Translate a single item using OpenRouter API
 * @param text - Text to translate
 * @param type - Translation type ('segment' or 'pathname')
 * @param sourceLanguageCode - Source language BCP 47 code (e.g., 'en-us')
 * @param targetLanguageCode - Target language BCP 47 code (e.g., 'es-mx', 'fr-fr')
 * @param apiKey - OpenRouter API key
 * @param style - Translation style (only applies to segments, not pathnames)
 * @returns Translated text
 */
async function translateSingle(
	text: string,
	type: 'segment' | 'pathname',
	sourceLanguageCode: string,
	targetLanguageCode: string,
	apiKey: string,
	style: TranslationStyle = 'balanced'
): Promise<TranslateSingleResult> {
	const prompt = type === 'segment' ? SEGMENT_PROMPT : PATHNAME_PROMPT
	const startTime = Date.now()

	// Include <style> tag only for segments, not pathnames
	const styleTag = type === 'segment' ? `<style>${style}</style>` : ''

	// console.log(`[Translation Single] Type: ${type}, Input: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`)

	try {
		const response = await fetch(OPENROUTER_ENDPOINT, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				// 'HTTP-Referer': 'https://find-your-item.com',
				'X-Title': 'Translation Proxy',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: MODEL,
				messages: [
					{
						role: 'system',
						content: prompt,
					},
					{
						role: 'user',
						content: `
                        <translate>
                            <sourceLanguageCode>${sourceLanguageCode}</sourceLanguageCode>
                            <targetLanguageCode>${targetLanguageCode}</targetLanguageCode>
                            ${styleTag}
                            <text>${text}</text>
                        </translate>`,
					},
				],
				temperature: 0,
				provider: {
					sort: 'throughput',
				},
				reasoning: {
					enabled: false,
				},
				stream: false,
			}),
		})

		if (!response.ok) {
			const errorText = await response.text()
			throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}\n${errorText}`)
		}

		const data = (await response.json()) as any

		if (!data.choices || !data.choices[0] || !data.choices[0].message) {
			throw new Error(`Unexpected response format: ${JSON.stringify(data)}`)
		}

		// Warn if cost is missing (detect silent data loss)
		if (data.usage?.cost === undefined) {
			console.warn('[LLM Usage] Missing cost in OpenRouter response')
		}

		const usage: TokenUsage = {
			promptTokens: data.usage?.prompt_tokens ?? 0,
			completionTokens: data.usage?.completion_tokens ?? 0,
			cost: data.usage?.cost ?? 0,
		}

		const translatedText = data.choices[0].message.content.trim()
		const duration = Date.now() - startTime
		// console.log(`[Translation Single] Type: ${type}, Duration: ${duration}ms, Result: "${translatedText.substring(0, 100)}${translatedText.length > 100 ? '...' : ''}"`)
		return { translation: translatedText, usage }
	} catch (error) {
		// console.error(`Translation failed for "${text}":`, error)
		throw error
	}
}

/**
 * Translate a batch of items in parallel
 * All items are processed simultaneously
 * @param items - Array of translation items with type discrimination
 * @param sourceLanguageCode - Source language BCP 47 code (e.g., 'en-us')
 * @param targetLanguageCode - Target language BCP 47 code (e.g., 'es-mx', 'fr-fr')
 * @param apiKey - OpenRouter API key
 * @param style - Translation style (only applies to segments, not pathnames)
 * @returns Array of translated strings in same order as input
 */
export async function translateBatch(
	items: TranslationItem[],
	sourceLanguageCode: string,
	targetLanguageCode: string,
	apiKey: string,
	style: TranslationStyle = 'balanced'
): Promise<TranslateBatchResult> {
	const startTime = Date.now()

	if (items.length === 0) {
		return {
			translations: [],
			totalUsage: { promptTokens: 0, completionTokens: 0, cost: 0 },
			apiCallCount: 0,
		}
	}

	// console.log(`[translateBatch] Starting ${items.length} parallel API calls`)

	// Translate all items in parallel (1 API call per item)
	const translationPromises = items.map((item) =>
		translateSingle(item.text, item.type, sourceLanguageCode, targetLanguageCode, apiKey, style)
	)

	const results = await Promise.all(translationPromises)

	// Aggregate usage across all API calls
	const totalUsage = results.reduce(
		(acc, r) => ({
			promptTokens: acc.promptTokens + r.usage.promptTokens,
			completionTokens: acc.completionTokens + r.usage.completionTokens,
			cost: acc.cost + r.usage.cost,
		}),
		{ promptTokens: 0, completionTokens: 0, cost: 0 }
	)

	const duration = Date.now() - startTime
	// console.log(`[translateBatch] COMPLETED - Total duration: ${duration}ms, API calls: ${items.length}`)

	return {
		translations: results.map((r) => r.translation),
		totalUsage,
		apiCallCount: items.length,
	}
}

