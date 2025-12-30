/**
 * OpenRouter Translation API integration
 * Handles translation with type-specific prompts for segments vs pathnames
 */

import { PATHNAME_PROMPT, SEGMENT_PROMPT } from './prompts.js'

export interface TranslationItem {
	text: string
	type: 'segment' | 'pathname'
}

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'anthropic/claude-haiku-4.5'

/**
 * Translate a single item using OpenRouter API
 * @param text - Text to translate
 * @param type - Translation type ('segment' or 'pathname')
 * @param sourceLanguageCode - Source language (e.g., 'en')
 * @param targetLanguageCode - Target language (e.g., 'es', 'fr')
 * @param apiKey - OpenRouter API key
 * @returns Translated text
 */
async function translateSingle(
	text: string,
	type: 'segment' | 'pathname',
	sourceLanguageCode: string,
	targetLanguageCode: string,
	apiKey: string
): Promise<string> {
	const prompt = type === 'segment' ? SEGMENT_PROMPT : PATHNAME_PROMPT
	const startTime = Date.now()

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
                            <text>${text}</text>
                        </translate>`,
					},
				],
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

		const translatedText = data.choices[0].message.content.trim()
		const duration = Date.now() - startTime
		// console.log(`[Translation Single] Type: ${type}, Duration: ${duration}ms, Result: "${translatedText.substring(0, 100)}${translatedText.length > 100 ? '...' : ''}"`)
		return translatedText
	} catch (error) {
		// console.error(`Translation failed for "${text}":`, error)
		throw error
	}
}

/**
 * Translate a batch of items in parallel
 * All items are processed simultaneously
 * @param items - Array of translation items with type discrimination
 * @param sourceLanguageCode - Source language (e.g., 'en')
 * @param targetLanguageCode - Target language (e.g., 'es', 'fr')
 * @param apiKey - OpenRouter API key
 * @returns Array of translated strings in same order as input
 */
export async function translateBatch(
	items: TranslationItem[],
	sourceLanguageCode: string,
	targetLanguageCode: string,
	apiKey: string
): Promise<string[]> {
	const startTime = Date.now()

	if (items.length === 0) {
		return []
	}

	// console.log(`[translateBatch] Starting ${items.length} parallel API calls`)

	// Translate all items in parallel (1 API call per item)
	const translationPromises = items.map((item) =>
		translateSingle(item.text, item.type, sourceLanguageCode, targetLanguageCode, apiKey)
	)

	const results = await Promise.all(translationPromises)

	const duration = Date.now() - startTime
	// console.log(`[translateBatch] COMPLETED - Total duration: ${duration}ms, API calls: ${items.length}`)

	return results
}

/**
 * Translate multiple strings using parallel API calls
 * Backward compatibility wrapper for existing code
 *
 * @param strings - Array of strings to translate
 * @param projectId - IGNORED (kept for backward compatibility)
 * @param sourceLanguageCode - Source language (e.g., 'en')
 * @param targetLanguageCode - Target language (e.g., 'es', 'fr')
 * @param apiKey - OpenRouter API key (repurposed from serviceAccountJson parameter)
 * @returns Array of translated strings in same order
 */
export async function translateStringsParallel(
	strings: string[],
	_projectId: string,
	sourceLanguageCode: string,
	targetLanguageCode: string,
	apiKey: string
): Promise<string[]> {
	const items: TranslationItem[] = strings.map((text) => ({
		text,
		type: 'segment' as const,
	}))

	return translateBatch(items, sourceLanguageCode, targetLanguageCode, apiKey)
}
