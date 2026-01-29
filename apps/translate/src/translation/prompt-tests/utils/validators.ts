/**
 * Validation functions for prompt testing
 */

// Placeholder pattern: [N1], [S1], [HA1], [/HA1], etc.
const PLACEHOLDER_PATTERN = /\[\/?[A-Z]+\d+\]/g

/**
 * Extract all placeholders from a string
 */
export function extractPlaceholders(text: string): string[] {
	return text.match(PLACEHOLDER_PATTERN) ?? []
}

/**
 * Validate all placeholders from input appear in output
 */
export function validatePlaceholdersPreserved(
	input: string,
	output: string
): { valid: boolean; missing: string[]; extra: string[] } {
	const inputPlaceholders = extractPlaceholders(input)
	const outputPlaceholders = extractPlaceholders(output)

	const inputSet = new Set(inputPlaceholders)
	const outputSet = new Set(outputPlaceholders)

	const missing = inputPlaceholders.filter((p) => !outputSet.has(p))
	const extra = outputPlaceholders.filter((p) => !inputSet.has(p))

	return {
		valid: missing.length === 0 && extra.length === 0,
		missing: [...new Set(missing)],
		extra: [...new Set(extra)],
	}
}

/**
 * Validate paired placeholders like [HA1]...[/HA1] are properly paired
 */
export function validatePairedPlaceholders(output: string): {
	valid: boolean
	unpaired: string[]
} {
	const placeholders = extractPlaceholders(output)
	const openTags = new Map<string, number>()
	const closeTags = new Map<string, number>()

	for (const p of placeholders) {
		if (p.startsWith('[/')) {
			// Close tag like [/HA1]
			const tag = p.slice(2, -1) // "HA1"
			closeTags.set(tag, (closeTags.get(tag) ?? 0) + 1)
		} else {
			// Open tag like [HA1]
			const tag = p.slice(1, -1) // "HA1"
			// Only count as open if it has a corresponding close pattern (paired tags)
			if (tag.match(/^H[A-Z]\d+$/)) {
				openTags.set(tag, (openTags.get(tag) ?? 0) + 1)
			}
		}
	}

	const unpaired: string[] = []

	// Check all open tags have matching close tags
	for (const [tag, count] of openTags) {
		const closeCount = closeTags.get(tag) ?? 0
		if (closeCount !== count) {
			unpaired.push(`[${tag}] (open: ${count}, close: ${closeCount})`)
		}
	}

	// Check for close tags without open tags
	for (const [tag, count] of closeTags) {
		if (!openTags.has(tag)) {
			unpaired.push(`[/${tag}] (close without open: ${count})`)
		}
	}

	return {
		valid: unpaired.length === 0,
		unpaired,
	}
}

/**
 * Validate pathname structure is preserved
 */
export function validatePathStructure(
	input: string,
	output: string
): { valid: boolean; errors: string[] } {
	const errors: string[] = []

	// Must start with /
	if (!output.startsWith('/')) {
		errors.push('Output must start with /')
	}

	// No double slashes
	if (output.includes('//')) {
		errors.push('Output contains double slashes //')
	}

	// Same segment count
	const inputSegments = input.split('/').filter((s) => s !== '')
	const outputSegments = output.split('/').filter((s) => s !== '')
	if (inputSegments.length !== outputSegments.length) {
		errors.push(
			`Segment count mismatch: input has ${inputSegments.length}, output has ${outputSegments.length}`
		)
	}

	return {
		valid: errors.length === 0,
		errors,
	}
}

/**
 * Validate output contains only ASCII-safe pathname characters
 */
export function validateAsciiSafe(output: string): {
	valid: boolean
	invalidChars: string[]
} {
	// Allowed: A-Z, a-z, 0-9, -, ., _, ~, /, [, ]
	// Brackets allowed for placeholders
	const invalidChars: string[] = []
	for (const char of output) {
		if (!/[A-Za-z0-9\-._~\/\[\]]/.test(char)) {
			invalidChars.push(char)
		}
	}

	return {
		valid: invalidChars.length === 0,
		invalidChars: [...new Set(invalidChars)],
	}
}

/**
 * Validate output is ALL CAPS (excluding placeholders)
 */
export function validateAllCaps(output: string): { valid: boolean; reason?: string } {
	// Remove placeholders for checking
	const textOnly = output.replace(PLACEHOLDER_PATTERN, '')

	// Check if all letters are uppercase
	const letters = textOnly.match(/[a-zA-Z]/g) ?? []
	if (letters.length === 0) {
		return { valid: true }
	}

	const uppercaseLetters = letters.filter((c) => c === c.toUpperCase())
	const valid = uppercaseLetters.length === letters.length

	return {
		valid,
		reason: valid ? undefined : 'Output contains lowercase letters',
	}
}

/**
 * Validate trailing slash is preserved
 */
export function validateTrailingSlash(
	input: string,
	output: string
): { valid: boolean; reason?: string } {
	const inputHasTrailing = input.endsWith('/') && input.length > 1
	const outputHasTrailing = output.endsWith('/') && output.length > 1

	if (inputHasTrailing !== outputHasTrailing) {
		return {
			valid: false,
			reason: inputHasTrailing
				? 'Trailing slash was removed'
				: 'Trailing slash was added',
		}
	}

	return { valid: true }
}

/**
 * Validate specific tokens appear unchanged in output
 */
export function validateTokensUnchanged(
	tokens: string[],
	output: string
): { valid: boolean; missing: string[] } {
	const missing = tokens.filter((token) => !output.includes(token))

	return {
		valid: missing.length === 0,
		missing,
	}
}

/**
 * Validate output differs from input (translation occurred)
 */
export function validateTranslated(
	input: string,
	output: string
): { valid: boolean; reason?: string } {
	if (input === output) {
		return {
			valid: false,
			reason: 'Output is identical to input - no translation occurred',
		}
	}
	return { valid: true }
}

/**
 * Validate output equals input exactly (for placeholder-only cases)
 */
export function validateUnchanged(
	input: string,
	output: string
): { valid: boolean; reason?: string } {
	if (input !== output) {
		return {
			valid: false,
			reason: `Output differs from input. Expected: "${input}", Got: "${output}"`,
		}
	}
	return { valid: true }
}

/**
 * Check if input contains only placeholders and non-translatable content
 */
export function isPlaceholderOnly(input: string): boolean {
	// Remove placeholders
	const withoutPlaceholders = input.replace(PLACEHOLDER_PATTERN, '')
	// Remove whitespace, punctuation, and brand names that shouldn't be translated
	const withoutNonTranslatable = withoutPlaceholders.replace(
		/[\s.,!?;:'"()\-\/\\]/g,
		''
	)
	// Check for known brands that should be preserved
	const knownBrands = ['eBay', 'PayPal', 'Google', 'Apple', 'Amazon']
	let remaining = withoutNonTranslatable
	for (const brand of knownBrands) {
		remaining = remaining.replace(new RegExp(brand, 'gi'), '')
	}
	return remaining.trim() === ''
}
