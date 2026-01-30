/**
 * URL pathname translation utilities
 *
 * Translates URL pathnames using the same pattern normalization as text segments.
 * Example: /products/item-123 → /products/item-[N1] → translate → /productos/articulo-[N1] → /productos/articulo-123
 */

import type { TokenUsage } from '@pantolingo/db'
import type { PatternReplacement, Content, PathnameMapping } from '../types.js'
import { applyPatterns, restorePatterns } from './skip-patterns.js'
import { toAsciiPathname } from './ascii-pathname.js'

/** Result from translateFn with usage tracking */
export interface TranslateFnResult {
	translations: string[]
	usage: TokenUsage
	apiCallCount: number
}

/**
 * Normalize a pathname by applying pattern replacements (numeric, PII, etc.)
 *
 * @param pathname - The pathname to normalize (e.g., "/products/item-123")
 * @returns Object with normalized pathname and replacement data
 */
export function normalizePathname(pathname: string): {
	normalized: string
	replacements: PatternReplacement[]
} {
	// Apply pattern normalization (numeric and PII)
	const patternized = applyPatterns(pathname)

	return {
		normalized: patternized.normalized,
		replacements: patternized.replacements,
	}
}

/**
 * Denormalize a pathname by restoring original values for placeholders
 *
 * @param normalizedPathname - The normalized pathname (e.g., "/productos/articulo-[N1]")
 * @param replacements - Replacement data from normalizePathname()
 * @returns Original pathname with placeholders restored (e.g., "/productos/articulo-123")
 */
export function denormalizePathname(normalizedPathname: string, replacements: PatternReplacement[]): string {
	return restorePatterns(normalizedPathname, replacements)
}

/**
 * Look up cached pathname translation
 * Helper function to avoid code duplication in translatePathname() and translatePathnamesBatch()
 *
 * @param normalized - Normalized pathname
 * @param replacements - Pattern replacements for denormalization
 * @param pathnameMapping - Pathname mapping cache from KV
 * @returns Denormalized translated pathname, or null if cache miss
 */
function lookupCachedPathname(
	normalized: string,
	replacements: PatternReplacement[],
	pathnameMapping: PathnameMapping | null
): string | null {
	if (!pathnameMapping) {
		return null
	}

	const translatedNormalized = pathnameMapping.source[normalized]
	if (!translatedNormalized) {
		return null
	}

	return denormalizePathname(translatedNormalized, replacements)
}

/**
 * Check if a pathname should be skipped from translation
 *
 * @param pathname - The pathname to check
 * @param skipPath - Array of patterns (string or regex) to skip
 * @returns true if pathname matches any skip pattern, false otherwise
 */
export function shouldSkipPath(pathname: string, skipPath: (string | RegExp)[] | undefined): boolean {
	// Always skip root pathname regardless of skipPath configuration
	if (pathname === '/') return true

	if (!skipPath || skipPath.length === 0) {
		return false
	}

	for (const pattern of skipPath) {
		if (typeof pattern === 'string') {
			// String pattern: check if substring is found anywhere in pathname
			if (pathname.includes(pattern)) {
				return true
			}
		} else if (pattern instanceof RegExp) {
			// Regex pattern: test against pathname
			if (pattern.test(pathname)) {
				return true
			}
		}
	}

	return false
}

/**
 * Translate a pathname using cache if available, otherwise call translation function
 *
 * @param originalPathname - The original English pathname (e.g., "/products/item-123")
 * @param targetLang - Target language code (e.g., "es")
 * @param pathnameMapping - Pathname mapping cache (or null if not available)
 * @param translateFn - Function to translate text (called if cache miss)
 * @param skipPath - Array of path patterns to skip translation
 * @returns Object with translated pathname and segment for caching
 */
export async function translatePathname(
	originalPathname: string,
	_targetLang: string,
	pathnameMapping: PathnameMapping | null,
	translateFn: (text: string) => Promise<string>,
	skipPath: (string | RegExp)[] | undefined
): Promise<{
	translated: string
	segment: Content | null
	replacements: PatternReplacement[]
}> {
	// Check if pathname should be skipped
	if (shouldSkipPath(originalPathname, skipPath)) {
		return {
			translated: originalPathname,
			segment: null,
			replacements: [],
		}
	}

	// Normalize pathname
	const { normalized, replacements } = normalizePathname(originalPathname)

	// Check pathname mapping cache
	const cachedTranslation = lookupCachedPathname(normalized, replacements, pathnameMapping)
	if (cachedTranslation) {
		// Cache hit - return without translation
		return {
			translated: cachedTranslation,
			segment: null, // No new segment to cache
			replacements,
		}
	}

	// Cache miss - translate the normalized pathname
	const translatedNormalized = toAsciiPathname(await translateFn(normalized))

	// Denormalize the translated result
	const translated = denormalizePathname(translatedNormalized, replacements)

	// Create segment for caching
	const segment: Content = {
		kind: 'path',
		value: normalized,
	}

	return {
		translated,
		segment,
		replacements,
	}
}

/**
 * Batch translate multiple pathnames using cache + single API call
 * Dramatically improves performance by:
 * 1. Fetching pathname mapping cache once (not per-pathname)
 * 2. Batching all uncached pathnames into single API call (vs 12 separate calls)
 * 3. Reusing translateSegments() batching infrastructure
 *
 * @param pathnames - Set of unique pathnames to translate
 * @param pathnameMapping - Pre-fetched pathname mapping cache (key: normalized original, value: normalized translated)
 * @param translateFn - Function to translate array of segments (called once with all uncached pathnames)
 * @param skipPath - Path patterns to skip translation
 * @returns Object with { pathnameMap, newSegments, newTranslations, usage, apiCallCount } for caching
 */
export async function translatePathnamesBatch(
	pathnames: Set<string>,
	pathnameMapping: PathnameMapping | null,
	translateFn: (segments: Content[]) => Promise<TranslateFnResult>,
	skipPath: (string | RegExp)[] | undefined
): Promise<{
	pathnameMap: Map<string, string>
	newSegments: Content[]
	newTranslations: string[]
	usage: TokenUsage
	apiCallCount: number
}> {
	const pathnameMap = new Map<string, string>()
	const uncachedPathnames: Array<{
		original: string
		normalized: string
		replacements: PatternReplacement[]
	}> = []

	// Process each pathname
	for (const pathname of pathnames) {
		// Skip pathnames matching skipPath patterns
		if (shouldSkipPath(pathname, skipPath)) {
			pathnameMap.set(pathname, pathname)
			continue
		}

		// Normalize pathname (apply pattern replacements for cache)
		const { normalized, replacements } = normalizePathname(pathname)

		// Check pathname mapping cache
		const cachedTranslation = lookupCachedPathname(normalized, replacements, pathnameMapping)
		if (cachedTranslation) {
			// Cache hit - add to map and continue
			pathnameMap.set(pathname, cachedTranslation)
			continue
		}

		// Cache miss - will translate in batch
		uncachedPathnames.push({
			original: pathname,
			normalized,
			replacements,
		})
	}

	// If all pathnames were cached or skipped, return early
	if (uncachedPathnames.length === 0) {
		return {
			pathnameMap,
			newSegments: [],
			newTranslations: [],
			usage: { promptTokens: 0, completionTokens: 0, cost: 0 },
			apiCallCount: 0,
		}
	}

	// Batch translate all uncached pathnames with SINGLE API call
	const segmentsToTranslate: Content[] = uncachedPathnames.map((p) => ({
		kind: 'path',
		value: p.normalized,
	}))

	const translateResult = await translateFn(segmentsToTranslate)

	// Process translated results and add to pathnameMap
	const newSegments: Content[] = []
	const newTranslations: string[] = []

	for (let i = 0; i < uncachedPathnames.length; i++) {
		const { original, replacements } = uncachedPathnames[i]
		const translatedNorm = toAsciiPathname(translateResult.translations[i])

		// Denormalize the translated pathname (restore placeholders)
		const denormalized = denormalizePathname(translatedNorm, replacements)
		pathnameMap.set(original, denormalized)

		// Track for KV caching (store normalized versions for cache intelligence)
		newSegments.push(segmentsToTranslate[i])
		newTranslations.push(translatedNorm)
	}

	return {
		pathnameMap,
		newSegments,
		newTranslations,
		usage: translateResult.usage,
		apiCallCount: translateResult.apiCallCount,
	}
}
