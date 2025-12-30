/**
 * Content translation orchestration
 * Handles deduplication, chunking, skip words, and batch translation
 */

import { Content, SkipWordReplacement, TranslateStats, TranslationItem } from '../types.js'
import { reconstructTranslations, preprocessForTranslation } from './deduplicator.js'
import { replaceSkipWords, restoreSkipWords } from './skip-words.js'
import { translateBatch } from './translate.js'

/**
 * Translate content items using Google Cloud Translation API REST
 * @param segments - Array of Content objects to translate
 * @param sourceLanguageCode - Source language code (e.g., 'en')
 * @param targetLanguageCode - Target language code (e.g., 'es', 'fr')
 * @param projectId - Google Cloud project ID
 * @param serviceAccountJson - Service account JSON string
 * @param skipWords - Optional array of words to skip during translation
 * @returns TranslateStats with translations aligned to original content
 */
export async function translateSegments(
	segments: Content[],
	sourceLanguageCode: string,
	targetLanguageCode: string,
	projectId: string,
	serviceAccountJson: string,
	skipWords?: string[]
): Promise<TranslateStats> {
	if (segments.length === 0) {
		return {
			translations: [],
			uniqueCount: 0,
			batchCount: 0,
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
		const translatedUnique = await translateBatch(
			translationItems,
			sourceLanguageCode,
			targetLanguageCode,
			serviceAccountJson
		)

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
		}
	} catch (error) {
		throw new Error(`Failed to translate content: ${error instanceof Error ? error.message : String(error)}`)
	}
}
