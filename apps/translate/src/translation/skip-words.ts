/**
 * Skip word handling for translation proxy
 * Replaces brand names and product names with placeholders before translation
 * to prevent them from being altered by the translation API
 */

import type { SkipWordReplacement } from '../types.js'

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replace skip words with placeholders in text
 * Uses case-insensitive whole-word matching with punctuation flexibility
 *
 * Example: "Use Find-Your-Item, it's great" → "Use [S1], it's great"
 *
 * @param text - The text to process
 * @param skipWords - Array of words to skip (e.g., ['Find-Your-Item', 'eBay'])
 * @returns Object with modified text and replacement mapping
 */
export function replaceSkipWords(
	text: string,
	skipWords: string[]
): { text: string; replacements: SkipWordReplacement[] } {
	if (!skipWords || skipWords.length === 0) {
		return { text, replacements: [] }
	}

	const replacements: SkipWordReplacement[] = []
	let modifiedText = text
	let placeholderIndex = 1

	// Process each skip word
	for (const skipWord of skipWords) {
		// Build regex for case-insensitive whole-word matching
		// \b ensures word boundaries (handles hyphens in Find-Your-Item)
		// The pattern allows punctuation after the word
		const escapedWord = escapeRegex(skipWord)
		const regex = new RegExp(`\\b${escapedWord}\\b`, 'gi')

		let match
		const matchPositions: Array<{ start: number; end: number }> = []

		// Find all matches in modifiedText (not original text)
		// This ensures positions are valid after previous replacements
		while ((match = regex.exec(modifiedText)) !== null) {
			matchPositions.push({
				start: match.index,
				end: match.index + match[0].length,
			})
		}

		// Process matches in reverse order to maintain correct positions
		for (let i = matchPositions.length - 1; i >= 0; i--) {
			const pos = matchPositions[i]
			const placeholder = `[S${placeholderIndex}]`

			// Extract the actual matched text (preserves original casing)
			const originalText = modifiedText.substring(pos.start, pos.end)

			// Record the replacement
			replacements.unshift({
				original: originalText,
				placeholder,
			})

			// Replace in the modified text
			modifiedText = modifiedText.substring(0, pos.start) + placeholder + modifiedText.substring(pos.end)
			placeholderIndex++
		}
	}

	return { text: modifiedText, replacements }
}

/**
 * Restore skip words from placeholders in translated text
 * Replaces [S1], [S2], etc. with their original words
 *
 * Example: "Usar [S1], es genial" → "Usar Find-Your-Item, es genial"
 *
 * @param text - The translated text with placeholders
 * @param replacements - Array of replacement mappings from replaceSkipWords
 * @returns Text with placeholders replaced by original words
 */
export function restoreSkipWords(text: string, replacements: SkipWordReplacement[]): string {
	if (!replacements || replacements.length === 0) {
		return text
	}

	let restoredText = text

	// Replace each placeholder with its original word
	// Use replaceAll in case the same placeholder appears multiple times in the translation
	for (let i = 0; i < replacements.length; i++) {
		const { placeholder, original } = replacements[i]
		restoredText = restoredText.replaceAll(placeholder, original)
	}

	return restoredText
}

/**
 * Convert skip words array to a Set for efficient O(1) lookup
 * Stores lowercase versions for case-insensitive matching
 *
 * @param skipWords - Array of skip words
 * @returns Set of lowercase skip words
 */
export function buildSkipWordsSet(skipWords: string[] | undefined): Set<string> {
	if (!skipWords || skipWords.length === 0) {
		return new Set()
	}

	return new Set(skipWords.map((word) => word.toLowerCase()))
}
