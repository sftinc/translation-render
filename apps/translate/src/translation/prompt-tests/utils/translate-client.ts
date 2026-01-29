/**
 * Test API wrapper for translation prompt testing
 * Always makes live API calls
 */

import dotenv from 'dotenv'
import { resolve } from 'path'

// Load env vars from monorepo root
dotenv.config({ path: resolve(process.cwd(), '.env') })

export type TranslationType = 'segment' | 'pathname'

export interface TranslateOptions {
	type: TranslationType
	sourceLanguageCode: string
	targetLanguageCode: string
	text: string
	style?: 'literal' | 'balanced' | 'natural'
	prompt: string
}

export interface TranslateResult {
	input: string
	output: string
	model: string
	usage?: {
		promptTokens: number
		completionTokens: number
		totalTokens: number
	}
}

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'anthropic/claude-haiku-4.5'

/**
 * Build XML input for translation API
 */
function buildXmlInput(options: TranslateOptions): string {
	if (options.type === 'segment') {
		return `<translate>
  <sourceLanguageCode>${options.sourceLanguageCode}</sourceLanguageCode>
  <targetLanguageCode>${options.targetLanguageCode}</targetLanguageCode>
  <style>${options.style ?? 'balanced'}</style>
  <text>${options.text}</text>
</translate>`
	} else {
		return `<translate>
  <sourceLanguageCode>${options.sourceLanguageCode}</sourceLanguageCode>
  <targetLanguageCode>${options.targetLanguageCode}</targetLanguageCode>
  <text>${options.text}</text>
</translate>`
	}
}

/**
 * Translate text using OpenRouter API
 */
export async function translate(
	options: TranslateOptions
): Promise<TranslateResult> {
	const { text, prompt } = options

	const apiKey = process.env.OPENROUTER_API_KEY
	if (!apiKey) {
		throw new Error('OPENROUTER_API_KEY environment variable required')
	}

	const xmlInput = buildXmlInput(options)

	const response = await fetch(OPENROUTER_ENDPOINT, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'X-Title': 'Prompt Test Framework',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: MODEL,
			messages: [
				{ role: 'system', content: prompt },
				{ role: 'user', content: xmlInput },
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

	const output = data.choices[0].message.content.trim()

	return {
		input: text,
		output,
		model: MODEL,
		usage: data.usage
			? {
					promptTokens: data.usage.prompt_tokens,
					completionTokens: data.usage.completion_tokens,
					totalTokens: data.usage.prompt_tokens + data.usage.completion_tokens,
				}
			: undefined,
	}
}
