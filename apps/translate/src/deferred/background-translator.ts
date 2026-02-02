/**
 * Background Translation Module
 * Handles fire-and-forget translation of cache misses.
 * On success: saves to DB and cleans up in-flight store.
 * On failure: cleans up in-flight store immediately (next page load retries).
 */

import type { Content } from '../types.js'
import type { TranslationConfig } from '@pantolingo/db'
import { translateSegments } from '../translation/translate-segments.js'
import { batchUpsertTranslations, hashText, recordLlmUsage, type LlmUsageRecord } from '@pantolingo/db'
import { deleteInFlight, buildInFlightKey } from './in-flight-store.js'

interface BackgroundTranslationParams {
	websiteId: number
	lang: string
	sourceLang: string
	segments: Content[]
	hashes: string[]
	skipWords: string[]
	apiKey: string
	projectId: string
	context?: { host: string; pathname: string }
}

/**
 * Start background translation of segments
 * This function is fire-and-forget - don't await it in the caller.
 *
 * @param params - Translation parameters
 * @returns Promise that resolves when translation completes (or fails)
 */
export async function startBackgroundTranslation(params: BackgroundTranslationParams): Promise<void> {
	const {
		websiteId,
		lang,
		sourceLang,
		segments,
		hashes,
		skipWords,
		apiKey,
		projectId,
		context,
	} = params

	// Build in-flight keys for cleanup
	const inFlightKeys = hashes.map((hash) => buildInFlightKey(websiteId, lang, hash))

	try {
		// Translate segments
		const result = await translateSegments(
			segments,
			sourceLang,
			lang,
			projectId,
			apiKey,
			skipWords,
			'balanced',
			context
		)

		// Build translation items for DB upsert
		const translations = segments.map((seg, i) => ({
			original: seg.value,
			translated: result.translations[i],
		}))

		// Save to database
		if (translations.length > 0) {
			await batchUpsertTranslations(websiteId, lang, translations)
		}

		// Record LLM usage
		if (result.apiCallCount > 0) {
			const usageRecord: LlmUsageRecord = {
				websiteId,
				feature: 'segment_translation',
				promptTokens: result.usage.promptTokens,
				completionTokens: result.usage.completionTokens,
				cost: result.usage.cost,
				apiCalls: result.apiCallCount,
			}
			recordLlmUsage([usageRecord])
		}

		// Log success
		const uniqueCount = result.uniqueCount
		console.log(`[Background] Translated ${translations.length} segments (${uniqueCount} unique) for ${lang}`)
	} catch (error) {
		// Log failure - next page load will retry
		console.error(`[Background] Translation failed for ${lang}:`, error)
	} finally {
		// Always clean up in-flight store (success or failure)
		for (const key of inFlightKeys) {
			deleteInFlight(key)
		}
	}
}
