// Lexical-specific utilities for placeholder handling
// Includes tokenization, validation, and serialization

import {
	type StandaloneKind,
	type PairedKind,
	PLACEHOLDER_REGEX,
	STANDALONE_KINDS,
	PAIRED_KINDS,
	isStandaloneKind,
	isPairedKind,
} from '../placeholder-shared'

// ============================================================================
// Types
// ============================================================================

export interface OrderedToken {
	token: string // Full token like "[HB1]" or "[/HB1]"
	kind: string // "HB", "N", etc.
	index: number // 1, 2, 3...
	isOpen: boolean // true for opening paired tags
	isClose: boolean // true for closing tags
	isStandalone: boolean // true for N, P, S, HV
	id: string // "HB1", "N1" - identifier for matching
}

export interface ValidationResult {
	valid: boolean
	missing: string[] // Placeholders in original but not translated
	extra: string[] // Placeholders in translated but not original
	errors: string[] // Human-readable error messages
}

// ============================================================================
// Token Extraction
// ============================================================================

/**
 * Extract all placeholder tokens from text as a Set
 * Used for simple presence checking
 */
export function extractPlaceholderTokens(text: string): Set<string> {
	const tokens = new Set<string>()
	const regex = new RegExp(PLACEHOLDER_REGEX.source, 'g')
	let match: RegExpExecArray | null

	while ((match = regex.exec(text)) !== null) {
		tokens.add(match[0])
	}

	return tokens
}

/**
 * Extract all placeholder tokens in order with metadata
 * Used for nesting validation
 */
export function extractOrderedTokens(text: string): OrderedToken[] {
	const tokens: OrderedToken[] = []
	const regex = new RegExp(PLACEHOLDER_REGEX.source, 'g')
	let match: RegExpExecArray | null

	while ((match = regex.exec(text)) !== null) {
		const kindPart = match[1]
		const index = parseInt(match[2], 10)
		const isClose = kindPart.startsWith('/')
		const kind = isClose ? kindPart.slice(1) : kindPart
		const isStandalone = isStandaloneKind(kind)
		const isOpen = !isClose && isPairedKind(kind)

		tokens.push({
			token: match[0],
			kind,
			index,
			isOpen,
			isClose,
			isStandalone,
			id: `${kind}${index}`,
		})
	}

	return tokens
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Find unmatched opening tags (no corresponding closing tag)
 */
function findUnmatchedOpenTags(text: string): string[] {
	const openCounts = new Map<string, number>() // "HB1" -> count
	const tokens = extractOrderedTokens(text)

	for (const token of tokens) {
		if (token.isStandalone) continue

		if (token.isOpen) {
			openCounts.set(token.id, (openCounts.get(token.id) || 0) + 1)
		} else if (token.isClose) {
			const count = openCounts.get(token.id) || 0
			if (count > 0) {
				openCounts.set(token.id, count - 1)
			}
		}
	}

	const unmatched: string[] = []
	for (const [id, count] of openCounts) {
		for (let i = 0; i < count; i++) {
			unmatched.push(`[${id}]`)
		}
	}

	return unmatched
}

/**
 * Find unmatched closing tags (no corresponding opening tag)
 */
function findUnmatchedCloseTags(text: string): string[] {
	const openCounts = new Map<string, number>() // "HB1" -> count
	const unmatched: string[] = []
	const tokens = extractOrderedTokens(text)

	for (const token of tokens) {
		if (token.isStandalone) continue

		if (token.isOpen) {
			openCounts.set(token.id, (openCounts.get(token.id) || 0) + 1)
		} else if (token.isClose) {
			const count = openCounts.get(token.id) || 0
			if (count > 0) {
				openCounts.set(token.id, count - 1)
			} else {
				unmatched.push(`[/${token.id}]`)
			}
		}
	}

	return unmatched
}

/**
 * Validate proper nesting (LIFO order, no interleaving)
 * Detects interleaved tags like [HB1][HA2][/HB1][/HA2]
 */
function validateNesting(text: string): string[] {
	const stack: string[] = [] // Stack of open tag identifiers
	const errors: string[] = []
	const tokens = extractOrderedTokens(text)

	for (const token of tokens) {
		if (token.isStandalone) continue

		if (token.isOpen) {
			stack.push(token.id) // e.g., "HB1"
		} else if (token.isClose) {
			if (stack.length === 0) continue // Handled by findUnmatchedCloseTags

			const expected = stack[stack.length - 1]
			if (token.id !== expected) {
				errors.push(`Invalid nesting: [/${token.id}] closes before [/${expected}]`)
			}
			// Pop even if mismatched to continue validation
			const idx = stack.lastIndexOf(token.id)
			if (idx !== -1) {
				stack.splice(idx, 1)
			}
		}
	}

	return errors
}

/**
 * Full validation of translated text against original
 */
export function validatePlaceholders(original: string, translated: string): ValidationResult {
	const errors: string[] = []

	// 1. Token presence check
	const originalTokens = extractPlaceholderTokens(original)
	const translatedTokens = extractPlaceholderTokens(translated)
	const missing = [...originalTokens].filter((t) => !translatedTokens.has(t))
	const extra = [...translatedTokens].filter((t) => !originalTokens.has(t))

	if (missing.length) errors.push(`Missing: ${missing.join(', ')}`)
	if (extra.length) errors.push(`Unexpected: ${extra.join(', ')}`)

	// 2. Paired tag matching (every open has a close)
	const unmatchedOpen = findUnmatchedOpenTags(translated)
	const unmatchedClose = findUnmatchedCloseTags(translated)
	if (unmatchedOpen.length) errors.push(`Unclosed tags: ${unmatchedOpen.join(', ')}`)
	if (unmatchedClose.length) errors.push(`Extra closing tags: ${unmatchedClose.join(', ')}`)

	// 3. Proper nesting (LIFO order, no interleaving)
	const nestingErrors = validateNesting(translated)
	errors.push(...nestingErrors)

	return {
		valid: errors.length === 0,
		missing,
		extra,
		errors,
	}
}

// ============================================================================
// Serialization Helpers
// ============================================================================

/**
 * Parse a token string to determine its type and properties
 */
export function parseToken(token: string): {
	kind: string
	index: number
	isClose: boolean
	isStandalone: boolean
	isPaired: boolean
} | null {
	const regex = new RegExp(PLACEHOLDER_REGEX.source)
	const match = regex.exec(token)
	if (!match) return null

	const kindPart = match[1]
	const index = parseInt(match[2], 10)
	const isClose = kindPart.startsWith('/')
	const kind = isClose ? kindPart.slice(1) : kindPart
	const isStandalone = isStandaloneKind(kind)
	const isPaired = isPairedKind(kind)

	return { kind, index, isClose, isStandalone, isPaired }
}

/**
 * Create a standalone placeholder token string
 */
export function createStandaloneToken(kind: StandaloneKind, index: number): string {
	return `[${kind}${index}]`
}

/**
 * Create paired placeholder token strings
 */
export function createPairedTokens(
	kind: PairedKind,
	index: number
): { open: string; close: string } {
	return {
		open: `[${kind}${index}]`,
		close: `[/${kind}${index}]`,
	}
}
