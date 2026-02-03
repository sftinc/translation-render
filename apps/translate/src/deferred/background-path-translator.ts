/**
 * Background Path Translation Module
 * Handles fire-and-forget translation of pathname cache misses.
 *
 * Key behavior for deferred mode:
 * - All path translations start in parallel
 * - Each translation writes to DB immediately on completion
 * - On failure: cleans up in-flight store immediately (next page load retries)
 */

import { translateSingle } from '../translation/translate.js'
import { replaceSkipWords, restoreSkipWords } from '../translation/skip-words.js'
import { toAsciiPathname } from '../utils/ascii-pathname.js'
import { batchUpsertPathnames, recordLlmUsage, type LlmUsageRecord, type TokenUsage } from '@pantolingo/db'
import { deleteInFlight, buildInFlightKey } from './in-flight-store.js'

interface UncachedPath {
	original: string
	normalized: string
}

interface BackgroundPathTranslationParams {
	websiteId: number
	lang: string
	sourceLang: string
	uncachedPaths: UncachedPath[]
	skipWords: string[]
	apiKey: string
	context?: { host: string; pathname: string }
}

/**
 * Start background translation of pathnames
 * This function is fire-and-forget - don't await it in the caller.
 *
 * Each path is translated in parallel and written to DB immediately on completion.
 *
 * @param params - Translation parameters
 * @returns Promise that resolves when all translations complete (or fail)
 */
export async function startBackgroundPathTranslation(params: BackgroundPathTranslationParams): Promise<void> {
	const { websiteId, lang, sourceLang, uncachedPaths, skipWords, apiKey, context } = params

	// Aggregate usage stats for logging
	const totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, cost: 0 }
	let successCount = 0
	let failCount = 0

	// Process each path in parallel, writing to DB immediately on completion
	const promises = uncachedPaths.map(async (path) => {
		const inFlightKey = buildInFlightKey(websiteId, lang, path.normalized)

		try {
			// Apply skip words (preserve brand names like "eBay" in paths)
			const { text: textToTranslate, replacements: skipWordReplacements } = replaceSkipWords(
				path.normalized,
				skipWords
			)

			// Translate
			const result = await translateSingle(textToTranslate, 'pathname', sourceLang, lang, apiKey)

			if (result === null) {
				// Translation failed - don't save to DB, next page load will retry
				failCount++
				return
			}

			// Restore skip words in translation
			const withSkipWordsRestored = restoreSkipWords(result.translation, skipWordReplacements)

			// Sanitize to ASCII-safe pathname
			const translated = toAsciiPathname(withSkipWordsRestored)

			// Write to DB immediately
			await batchUpsertPathnames(websiteId, lang, [{ original: path.normalized, translated }])

			// Accumulate usage
			totalUsage.promptTokens += result.usage.promptTokens
			totalUsage.completionTokens += result.usage.completionTokens
			totalUsage.cost += result.usage.cost
			successCount++
		} catch (error) {
			failCount++
			console.error(`[Background Path] Path translation failed:`, error)
		} finally {
			// Always clean up in-flight store
			deleteInFlight(inFlightKey)
		}
	})

	// Wait for all to settle (for logging purposes)
	await Promise.allSettled(promises)

	// Log summary
	const contextInfo = context ? ` for ${context.host}${context.pathname}` : ''
	if (failCount > 0) {
		console.log(`[Background Path] Translated ${successCount}/${uncachedPaths.length} paths${contextInfo} (${failCount} failed)`)
	} else if (successCount > 0) {
		console.log(`[Background Path] Translated ${successCount} paths${contextInfo}`)
	}

	// Record aggregated LLM usage
	if (successCount > 0) {
		const usageRecord: LlmUsageRecord = {
			websiteId,
			feature: 'path_translation',
			promptTokens: totalUsage.promptTokens,
			completionTokens: totalUsage.completionTokens,
			cost: totalUsage.cost,
			apiCalls: successCount,
		}
		recordLlmUsage([usageRecord])
	}
}
