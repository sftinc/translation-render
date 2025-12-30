/**
 * Pattern-based text normalization for translation caching and PII redaction
 *
 * Replaces patterns with indexed placeholders before translation to:
 * - Enable cache hits across similar content with different numbers
 * - Prevent sensitive data (emails) from being sent to translation API or stored in cache
 *
 * Current patterns:
 * - [P] for PII - emails (e.g., "user@example.com")
 * - [N] for numbers (e.g., "123.45", "1,000")
 *
 * Future patterns: [D] dates, [T] times, [C] currency
 *
 * Each pattern type uses a unique placeholder for regex-based restoration.
 */

import type { PatternType, PatternReplacement, PatternizedText } from '../types.js'

// Regex for numeric pattern: matches numbers with commas and decimals
// Requires at least one digit to avoid false matches on pure punctuation like "..."
const NUMERIC_PATTERN = /[0-9.,]*\d[0-9.,]*/g
const NUMERIC_PLACEHOLDER_PREFIX = '[N'

// Email pattern: Simple regex catches 99% of real-world emails
// Matches: user@example.com, first.last+tag@sub.domain.co.uk
// Does NOT match: user@@example.com, user@, @example.com (malformed emails)
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const PII_PLACEHOLDER_PREFIX = '[P'

/**
 * Detect if text is all uppercase
 * @param text - Text to check
 * @returns true if all alphabetic characters are uppercase, false otherwise
 */
function isAllUpperCase(text: string): boolean {
	const alphaChars = text.replace(/[^a-zA-Z]/g, '')
	return alphaChars.length > 0 && alphaChars === alphaChars.toUpperCase()
}

/**
 * Apply case formatting to text
 * @param text - Text to format
 * @param isUpperCase - Whether to apply uppercase transformation
 * @returns Formatted text
 */
function applyCaseFormat(text: string, isUpperCase: boolean): string {
	return isUpperCase ? text.toUpperCase() : text
}

/**
 * Apply pattern replacements to text
 * Replaces numbers like "123.00" with indexed placeholders "[N1]", "[N2]", etc.
 *
 * @param text - The text to normalize
 * @param enabledPatterns - Array of patterns to apply
 * @returns PatternizedText with original, normalized text, and replacement data
 */
export function applyPatterns(
	text: string,
	enabledPatterns: PatternType[]
): PatternizedText {
	// Detect if text is all uppercase
	const isUpperCase = isAllUpperCase(text)

	if (!enabledPatterns || enabledPatterns.length === 0) {
		return { original: text, normalized: text, replacements: [], isUpperCase }
	}

	const replacements: PatternReplacement[] = []
	let normalized = text

	// Process PII pattern (emails) - Must run BEFORE numeric to prevent user123@example.com → user[N1]@example.com
	if (enabledPatterns.includes('pii')) {
		const values: string[] = []
		let index = 1

		// Replace each email with indexed placeholder
		normalized = normalized.replace(EMAIL_PATTERN, (match) => {
			values.push(match)
			return `[P${index++}]`
		})

		if (values.length > 0) {
			replacements.push({
				pattern: 'pii',
				placeholder: PII_PLACEHOLDER_PREFIX,
				values,
			})
		}
	}

	// Process numeric pattern
	if (enabledPatterns.includes('numeric')) {
		const values: string[] = []
		let index = 1

		// Replace each match with indexed placeholder
		normalized = text.replace(NUMERIC_PATTERN, (match) => {
			values.push(match)
			return `[N${index++}]`
		})

		if (values.length > 0) {
			replacements.push({
				pattern: 'numeric',
				placeholder: NUMERIC_PLACEHOLDER_PREFIX, // Stores prefix for future use
				values,
			})
		}
	}

	return { original: text, normalized, replacements, isUpperCase }
}

/**
 * Restore patterns in translated text
 * Replaces "[N1]", "[N2]", etc. placeholders with actual numeric values
 * Also applies uppercase formatting if the original text was all uppercase
 *
 * @param text - The translated text with placeholders
 * @param replacements - Array of replacement data from applyPatterns()
 * @param isUpperCase - Whether original text was all uppercase
 * @returns Text with placeholders replaced by original values and case formatting applied
 */
export function restorePatterns(
	text: string,
	replacements: PatternReplacement[],
	isUpperCase?: boolean
): string {
	if (!replacements || replacements.length === 0) {
		// No patterns to restore, just apply case formatting
		return applyCaseFormat(text, isUpperCase ?? false)
	}

	let result = text

	// Process replacements in REVERSE order to handle nested placeholders correctly
	// Example: If PII is applied first, then numeric, we must restore numeric first, then PII
	for (let i = replacements.length - 1; i >= 0; i--) {
		const replacement = replacements[i]

		// Determine placeholder letter based on pattern type
		const placeholderLetter =
			replacement.pattern === 'numeric' ? 'N' :
			replacement.pattern === 'pii' ? 'P' : '?'

		// Replace each indexed placeholder with its corresponding value
		for (let j = 0; j < replacement.values.length; j++) {
			const placeholder = `[${placeholderLetter}${j + 1}]`
			result = result.replaceAll(placeholder, replacement.values[j])
		}
	}

	// Apply case formatting after pattern restoration
	return applyCaseFormat(result, isUpperCase ?? false)
}
