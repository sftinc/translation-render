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
		kind: 'html' | 'text' | 'attr'
		content: string // Raw content (innerHTML for html, text for text, value for attr)
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
			let textForPatterns = segment.content
			let htmlReplacements: ReturnType<typeof htmlToPlaceholders>['replacements'] | undefined

			// For HTML segments, first convert HTML to placeholders
			if (segment.kind === 'html') {
				const htmlData = htmlToPlaceholders(segment.content)
				textForPatterns = htmlData.text
				htmlReplacements = htmlData.replacements
			}

			// Extract patterns from the text (after HTML placeholdering if applicable)
			const patternData = applyPatterns(textForPatterns)

			// Restore patterns in translation
			let restoredTranslation = restorePatterns(
				rawTranslation,
				patternData.replacements,
				patternData.isUpperCase
			)

			// For HTML segments, restore HTML placeholders
			if (htmlReplacements) {
				restoredTranslation = placeholdersToHtml(restoredTranslation, htmlReplacements)
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
