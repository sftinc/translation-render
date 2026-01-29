/**
 * Content translation orchestration
 * Handles deduplication, chunking, skip words, and batch translation
 */

import type { TokenUsage } from '@pantolingo/db'
import { Content, SkipWordReplacement, TranslateStats, TranslationItem } from '../types.js'
import { reconstructTranslations, preprocessForTranslation } from './deduplicator.js'
import { replaceSkipWords, restoreSkipWords } from './skip-words.js'
import { translateBatch, TranslationStyle } from './translate.js'

/** TranslateStats extended with LLM usage tracking */
export interface TranslateStatsWithUsage extends TranslateStats {
	usage: TokenUsage
	apiCallCount: number
}

/**
 * Translate content items using OpenRouter API
 * @param segments - Array of Content objects to translate
 * @param sourceLanguageCode - Source language BCP 47 code (e.g., 'en-us')
 * @param targetLanguageCode - Target language BCP 47 code (e.g., 'es-mx', 'fr-fr')
 * @param projectId - Unused (kept for backward compatibility)
 * @param serviceAccountJson - OpenRouter API key
 * @param skipWords - Optional array of words to skip during translation
 * @param style - Translation style (only applies to segments, not pathnames)
 * @returns TranslateStats with translations aligned to original content
 */
export async function translateSegments(
	segments: Content[],
	sourceLanguageCode: string,
	targetLanguageCode: string,
	projectId: string,
	serviceAccountJson: string,
	skipWords?: string[],
	style: TranslationStyle = 'balanced'
): Promise<TranslateStatsWithUsage> {
	if (segments.length === 0) {
		return {
			translations: [],
			uniqueCount: 0,
			batchCount: 0,
			usage: { promptTokens: 0, completionTokens: 0, cost: 0 },
			apiCallCount: 0,
		}
	}

	try {
		// Preprocess: dedupe and chunk
		const { chunks, dedupeResult, totalUnique } = preprocessForTranslation(segments)

		// Flatten chunks into single array of unique strings for parallel translation
		const uniqueStrings = chunks.flat()

		// Replace skip words with placeholders before translation
		// Track replacements per unique string
		const itemReplacements: SkipWordReplacement[][] = []

		let stringsToTranslate = uniqueStrings
		if (skipWords && skipWords.length > 0) {
			stringsToTranslate = uniqueStrings.map((text) => {
				const { text: replacedText, replacements } = replaceSkipWords(text, skipWords)
				itemReplacements.push(replacements)
				return replacedText
			})
		}

		// Build TranslationItem array with correct types
		// Check if these are pathname segments (kind: 'path') or content segments
		const isPathname = segments.length > 0 && segments[0].kind === 'path'
		const translationType: 'segment' | 'pathname' = isPathname ? 'pathname' : 'segment'

		const translationItems: TranslationItem[] = stringsToTranslate.map((text) => ({
			text,
			type: translationType,
		}))

		// Translate all items in parallel with type-specific prompts
		const batchResult = await translateBatch(
			translationItems,
			sourceLanguageCode,
			targetLanguageCode,
			serviceAccountJson,
			style
		)

		const translatedUnique = batchResult.translations

		// Restore skip words in translations
		if (skipWords && skipWords.length > 0) {
			for (let i = 0; i < translatedUnique.length; i++) {
				if (itemReplacements[i] && itemReplacements[i].length > 0) {
					translatedUnique[i] = restoreSkipWords(translatedUnique[i], itemReplacements[i])
				}
			}
		}

		// Reconstruct in original order
		const finalTranslations = reconstructTranslations(segments, dedupeResult, translatedUnique)

		return {
			translations: finalTranslations,
			uniqueCount: totalUnique,
			batchCount: chunks.length,
			usage: batchResult.totalUsage,
			apiCallCount: batchResult.apiCallCount,
		}
	} catch (error) {
		throw new Error(`Failed to translate content: ${error instanceof Error ? error.message : String(error)}`)
	}
}
