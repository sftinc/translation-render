/**
 * Translation configuration queries
 * Replaces HOST_SETTINGS lookup with database query
 */

import { pool } from './pool.js'

/**
 * Translation configuration from database
 * Matches structure needed by index.ts
 */
export interface TranslationConfig {
	translationId: number
	websiteId: number // website.id - used for translation lookups
	websiteHostname: string // website.hostname
	sourceLang: string // website.source_lang
	targetLang: string // translation.target_lang
	skipWords: string[]
	skipPath: (string | RegExp)[]
	skipSelectors: string[] // CSS selectors for elements to skip during translation
	translatePath: boolean
	cacheDisabledUntil: Date | null // website.cache_disabled_until - dev override for caching
}

// In-memory cache for hot path (translation config rarely changes)
const translationCache = new Map<string, { config: TranslationConfig | null; expiresAt: number }>()
const TRANSLATION_CACHE_TTL = 60_000 // 60 seconds

/**
 * Parse skip_path array from database format
 * Database stores: ['includes:/api/', 'regex:^/admin']
 * Returns: ['/api/', /^\/admin/]
 */
function parseSkipPath(dbArray: string[] | null): (string | RegExp)[] {
	if (!dbArray || dbArray.length === 0) return []

	return dbArray.map((pattern) => {
		if (pattern.startsWith('regex:')) {
			return new RegExp(pattern.slice(6))
		} else if (pattern.startsWith('includes:')) {
			return pattern.slice(9)
		}
		// Plain string (legacy format)
		return pattern
	})
}

/**
 * Get translation configuration by hostname
 * Uses in-memory cache to avoid DB hit on every request
 *
 * @param hostname - Request hostname (e.g., 'es.esnipe.com')
 * @returns TranslationConfig or null if not found/disabled
 *
 * SQL: 1 query (translation JOIN website)
 */
export async function getTranslationConfig(hostname: string): Promise<TranslationConfig | null> {
	// Check in-memory cache first
	const now = Date.now()
	const cached = translationCache.get(hostname)
	if (cached && cached.expiresAt > now) {
		return cached.config
	}

	try {
		const result = await pool.query<{
			translation_id: number
			website_id: number
			target_lang: string
			skip_words: string[] | null
			skip_path: string[] | null
			skip_selectors: string[] | null
			translate_path: boolean | null
			cache_disabled_until: Date | null
			website_hostname: string
			source_lang: string
		}>(
			`SELECT
				t.id AS translation_id,
				t.website_id,
				t.target_lang,
				w.skip_words,
				w.skip_path,
				w.skip_selectors,
				w.translate_path,
				w.cache_disabled_until,
				w.hostname AS website_hostname,
				w.source_lang
			FROM translation t
			JOIN website w ON w.id = t.website_id
			WHERE t.hostname = $1 AND t.enabled = TRUE`,
			[hostname]
		)

		if (result.rows.length === 0) {
			// Cache the miss too (prevents repeated queries for unknown hostnames)
			translationCache.set(hostname, { config: null, expiresAt: now + TRANSLATION_CACHE_TTL })
			return null
		}

		const row = result.rows[0]
		const config: TranslationConfig = {
			translationId: row.translation_id,
			websiteId: row.website_id,
			websiteHostname: row.website_hostname,
			sourceLang: row.source_lang,
			targetLang: row.target_lang,
			skipWords: row.skip_words || [],
			skipPath: parseSkipPath(row.skip_path),
			skipSelectors: row.skip_selectors || [],
			translatePath: row.translate_path ?? true,
			cacheDisabledUntil: row.cache_disabled_until,
		}

		// Cache the result
		translationCache.set(hostname, { config, expiresAt: now + TRANSLATION_CACHE_TTL })
		return config
	} catch (error) {
		console.error('DB translation config lookup failed:', error)
		return null // Fail open
	}
}

/**
 * Clear translation config cache
 * Useful for testing or after config changes
 */
export function clearTranslationCache(): void {
	translationCache.clear()
}
