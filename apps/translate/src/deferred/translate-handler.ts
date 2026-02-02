/**
 * Translation Lookup Handler
 * Handles the /__pantolingo/translate POST endpoint for deferred translation polling
 */

import { getTranslationConfig, batchGetTranslationsByHash } from '@pantolingo/db'
import { applyPatterns, restorePatterns } from '../translation/skip-patterns.js'
import { htmlToPlaceholders, placeholdersToHtml } from '../dom/placeholders.js'

/**
 * Request body structure from the client
 */
interface TranslateRequestBody {
	segments: Array<{
		hash: string
		original: string // Placeholdered text (for pattern restoration)
		originalHtml?: string // Raw innerHTML for HTML segments (for HTML tag restoration)
		kind: 'html' | 'text' | 'attr'
		attr?: string
	}>
}

/**
 * Handle translation lookup request from the deferred script
 * Looks up completed translations by hash and applies pattern/placeholder restoration
 *
 * @param host - Request hostname (to determine website config)
 * @param body - Request body containing segments to look up
 * @returns Flat object mapping hash -> restored translation (only completed translations)
 */
export async function handleTranslateRequest(
	host: string,
	body: TranslateRequestBody
): Promise<Record<string, string>> {
	// Validate request
	if (!body?.segments || !Array.isArray(body.segments)) {
		return {}
	}

	// Get translation config from hostname
	const config = await getTranslationConfig(host.startsWith('localhost') ? host.split(':')[0] : host)
	if (!config) {
		console.warn(`[Translate Handler] No config for host: ${host}`)
		return {}
	}

	const { websiteId, targetLang } = config

	// Extract hashes from request
	const hashes = body.segments.map((s) => s.hash)
	if (hashes.length === 0) {
		return {}
	}

	// Look up translations by hash
	const translationMap = await batchGetTranslationsByHash(websiteId, targetLang, hashes)

	console.log(`[Translate Handler] Looking up ${hashes.length} hashes, found ${translationMap.size} translations`)

	// Build response with pattern/placeholder restoration
	const result: Record<string, string> = {}

	for (const segment of body.segments) {
		const rawTranslation = translationMap.get(segment.hash)
		if (rawTranslation === undefined) {
			// Not yet translated, skip
			continue
		}

		try {
			// Re-extract patterns from placeholdered text
			const patternData = applyPatterns(segment.original)

			// Restore patterns in translation
			let restoredTranslation = restorePatterns(
				rawTranslation,
				patternData.replacements,
				patternData.isUpperCase
			)

			// For HTML segments, also restore HTML placeholders using the raw innerHTML
			if (segment.kind === 'html' && segment.originalHtml) {
				const { replacements } = htmlToPlaceholders(segment.originalHtml)
				restoredTranslation = placeholdersToHtml(restoredTranslation, replacements)
			}

			result[segment.hash] = restoredTranslation
		} catch (error) {
			console.error(`[Translate Handler] Restoration error for hash ${segment.hash}:`, error)
			// Fall back to raw translation without restoration
			result[segment.hash] = rawTranslation
		}
	}

	return result
}
