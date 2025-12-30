/**
 * Deduplication and chunking logic for translation
 * Optimizes translation API calls by deduping repeated strings
 * and chunking large batches within API limits
 */

import { Content } from '../types.js'
import { MAX_TRANSLATE_CHARS, MAX_TRANSLATE_ITEMS } from '../config.js'

/**
 * Result of deduplication
 */
export interface DedupeResult {
	unique: string[] // Deduplicated list of strings
	indexMap: Map<string, number[]> // Maps unique string -> array of original indices
}

/**
 * Deduplicate segments, returning unique strings and index mapping
 * @param segments - Array of Segment objects
 * @returns DedupeResult with unique strings and index mapping
 */
export function deduplicateSegments(segments: Content[]): DedupeResult {
	const uniqueStrings = new Set<string>()
	const unique: string[] = []
	const indexMap = new Map<string, number[]>()

	for (let i = 0; i < segments.length; i++) {
		const value = segments[i].value

		if (!uniqueStrings.has(value)) {
			uniqueStrings.add(value)
			unique.push(value)
			indexMap.set(value, [])
		}

		indexMap.get(value)!.push(i)
	}

	return { unique, indexMap }
}

/**
 * Chunk strings into batches respecting API limits
 * @param strings - Array of strings to chunk
 * @param maxChars - Maximum characters per chunk (default: 30000)
 * @param maxItems - Maximum items per chunk (default: 128)
 * @returns Array of chunks, each chunk is an array of strings
 */
export function chunkStrings(
	strings: string[],
	maxChars: number = MAX_TRANSLATE_CHARS,
	maxItems: number = MAX_TRANSLATE_ITEMS
): string[][] {
	const chunks: string[][] = []
	let currentChunk: string[] = []
	let currentChars = 0

	for (const str of strings) {
		// Calculate bytes for this string (approximate UTF-8 length)
		const strLength = Buffer.byteLength(str, 'utf8')

		// Check if adding this string would exceed limits
		const wouldExceedCount = currentChunk.length >= maxItems
		const wouldExceedChars = currentChars + strLength > maxChars

		if (currentChunk.length > 0 && (wouldExceedCount || wouldExceedChars)) {
			// Start a new chunk
			chunks.push(currentChunk)
			currentChunk = []
			currentChars = 0
		}

		currentChunk.push(str)
		currentChars += strLength
	}

	// Add remaining chunk
	if (currentChunk.length > 0) {
		chunks.push(currentChunk)
	}

	return chunks
}

/**
 * Reconstruct translations in original segment order
 * @param originalSegments - Original segments array
 * @param dedupeResult - Result from deduplication
 * @param translatedUnique - Translations of unique strings in same order as dedupeResult.unique
 * @returns Translations aligned to original segment order
 */
export function reconstructTranslations(
	originalSegments: Content[],
	dedupeResult: DedupeResult,
	translatedUnique: string[]
): string[] {
	const translations: string[] = new Array(originalSegments.length)

	// Build a map of unique string -> translated string
	const translationMap = new Map<string, string>()
	for (let i = 0; i < dedupeResult.unique.length; i++) {
		translationMap.set(dedupeResult.unique[i], translatedUnique[i])
	}

	// Reconstruct translations in original order
	for (let i = 0; i < originalSegments.length; i++) {
		const original = originalSegments[i].value
		const translated = translationMap.get(original)
		translations[i] = translated || original // Fallback to original if not found
	}

	return translations
}

/**
 * Full translation preprocessing: dedupe and chunk
 * @param segments - Original segments to translate
 * @returns Object with chunks and dedup info for reassembly
 */
export interface TranslationPreprocessingResult {
	chunks: string[][]
	dedupeResult: DedupeResult
	totalUnique: number
}

export function preprocessForTranslation(segments: Content[]): TranslationPreprocessingResult {
	const dedupeResult = deduplicateSegments(segments)
	const chunks = chunkStrings(dedupeResult.unique)

	return {
		chunks,
		dedupeResult,
		totalUnique: dedupeResult.unique.length,
	}
}
