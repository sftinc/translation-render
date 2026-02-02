/**
 * Translation cache queries
 * Batch operations to minimize SQL round trips
 *
 * Uses normalized schema:
 * - website_segment: source text stored once per website
 * - translation_segment: translations scoped to website + lang
 */

import { pool } from './pool.js'
import { hashText } from './utils/hash.js'

/**
 * Translation item for batch upsert
 */
export interface TranslationItem {
	original: string
	translated: string
}

/**
 * Batch lookup translations by text
 * Uses text_hash for efficient indexed lookups
 *
 * @param websiteId - Website ID from getTranslationConfig()
 * @param lang - Target language code
 * @param texts - Array of normalized text strings to look up
 * @returns Map of original text -> translated text (only cache hits)
 *
 * SQL: 1 query joining website_segment -> translation_segment
 */
export async function batchGetTranslations(
	websiteId: number,
	lang: string,
	texts: string[]
): Promise<Map<string, string>> {
	if (texts.length === 0) {
		return new Map()
	}

	try {
		// Generate hashes for all input texts
		const hashes = texts.map((t) => hashText(t))

		const result = await pool.query<{
			text: string
			translated_text: string
		}>(
			`SELECT ws.text, ts.translated_text
			FROM website_segment ws
			JOIN translation_segment ts ON ts.website_segment_id = ws.id
			WHERE ws.website_id = $1
			  AND ts.lang = $2
			  AND ws.text_hash = ANY($3::text[])`,
			[websiteId, lang, hashes]
		)

		// Build map for O(1) lookups
		const translationMap = new Map<string, string>()
		for (const row of result.rows) {
			translationMap.set(row.text, row.translated_text)
		}

		return translationMap
	} catch (error) {
		console.error('DB translation batch lookup failed:', error)
		return new Map() // Fail open - treat as cache miss
	}
}

/**
 * Batch insert/update translations
 * Two-step upsert: website_segment first, then translated_segment
 *
 * @param websiteId - Website ID
 * @param lang - Target language code
 * @param translations - Array of translation items
 * @returns Map of text_hash -> translated_segment.id
 *
 * SQL: 2 queries - one for website_segment, one for translation_segment
 */
export async function batchUpsertTranslations(
	websiteId: number,
	lang: string,
	translations: TranslationItem[]
): Promise<Map<string, number>> {
	if (translations.length === 0) {
		return new Map()
	}

	try {
		// Deduplicate by original text (last one wins)
		const uniqueMap = new Map<string, TranslationItem>()
		for (const t of translations) {
			uniqueMap.set(t.original, t)
		}
		const uniqueTranslations = Array.from(uniqueMap.values())

		// Prepare parallel arrays for UNNEST
		const originals: string[] = []
		const translated: string[] = []
		const hashes: string[] = []

		for (const t of uniqueTranslations) {
			originals.push(t.original)
			translated.push(t.translated)
			hashes.push(hashText(t.original))
		}

		// Step 1: Upsert website_segment (source text)
		await pool.query(
			`INSERT INTO website_segment (website_id, text, text_hash)
			SELECT $1, unnest($2::text[]), unnest($3::text[])
			ON CONFLICT (website_id, text_hash) DO NOTHING`,
			[websiteId, originals, hashes]
		)

		// Step 2: Upsert translation_segment (translations)
		const result = await pool.query<{ id: number; text_hash: string }>(
			`INSERT INTO translation_segment (website_segment_id, lang, translated_text)
			SELECT ws.id, $2, t.translated
			FROM unnest($3::text[], $4::text[]) AS t(hash, translated)
			JOIN website_segment ws ON ws.website_id = $1 AND ws.text_hash = t.hash
			ON CONFLICT (website_segment_id, lang) DO NOTHING
			RETURNING id, (SELECT text_hash FROM website_segment WHERE id = website_segment_id) AS text_hash`,
			[websiteId, lang, hashes, translated]
		)

		// Return map: text_hash -> id
		const idMap = new Map<string, number>()
		for (const row of result.rows) {
			idMap.set(row.text_hash, row.id)
		}
		return idMap
	} catch (error) {
		console.error('DB translation batch upsert failed:', error)
		return new Map() // Fail open
	}
}

/**
 * Batch lookup translation IDs by text hash
 * Used to link cached translations to pathnames
 *
 * @param websiteId - Website ID
 * @param lang - Target language code
 * @param textHashes - Array of text hashes to look up
 * @returns Map of text_hash -> translated_segment.id
 *
 * SQL: 1 query joining website_segment -> translation_segment
 */
export async function batchGetTranslationIds(
	websiteId: number,
	lang: string,
	textHashes: string[]
): Promise<Map<string, number>> {
	if (textHashes.length === 0) {
		return new Map()
	}

	try {
		const result = await pool.query<{ text_hash: string; id: number }>(
			`SELECT ws.text_hash, ts.id
			FROM website_segment ws
			JOIN translation_segment ts ON ts.website_segment_id = ws.id
			WHERE ws.website_id = $1
			  AND ts.lang = $2
			  AND ws.text_hash = ANY($3::text[])`,
			[websiteId, lang, textHashes]
		)

		const idMap = new Map<string, number>()
		for (const row of result.rows) {
			idMap.set(row.text_hash, row.id)
		}
		return idMap
	} catch (error) {
		console.error('DB translation ID lookup failed:', error)
		return new Map() // Fail open
	}
}

/**
 * Batch lookup website segment IDs by text hash
 * Used to link website segments to website paths (language-independent)
 *
 * @param websiteId - Website ID
 * @param textHashes - Array of text hashes to look up
 * @returns Map of text_hash -> website_segment.id
 *
 * SQL: 1 query on website_segment
 */
export async function batchGetWebsiteSegmentIds(
	websiteId: number,
	textHashes: string[]
): Promise<Map<string, number>> {
	if (textHashes.length === 0) {
		return new Map()
	}

	try {
		const result = await pool.query<{ text_hash: string; id: number }>(
			`SELECT text_hash, id
			FROM website_segment
			WHERE website_id = $1
			  AND text_hash = ANY($2::text[])`,
			[websiteId, textHashes]
		)

		const idMap = new Map<string, number>()
		for (const row of result.rows) {
			idMap.set(row.text_hash, row.id)
		}
		return idMap
	} catch (error) {
		console.error('DB website segment ID lookup failed:', error)
		return new Map() // Fail open
	}
}

/**
 * Batch lookup translations by text hash (for deferred polling)
 * Used by the /__pantolingo/translate endpoint to fetch completed translations
 *
 * @param websiteId - Website ID
 * @param lang - Target language code
 * @param hashes - Array of text hashes to look up
 * @returns Map of text_hash -> translated_text (only for completed translations)
 *
 * SQL: 1 query joining website_segment -> translation_segment
 */
export async function batchGetTranslationsByHash(
	websiteId: number,
	lang: string,
	hashes: string[]
): Promise<Map<string, string>> {
	if (hashes.length === 0) {
		return new Map()
	}

	try {
		const result = await pool.query<{
			text_hash: string
			translated_text: string
		}>(
			`SELECT ws.text_hash, ts.translated_text
			FROM website_segment ws
			JOIN translation_segment ts ON ts.website_segment_id = ws.id
			WHERE ws.website_id = $1
			  AND ts.lang = $2
			  AND ws.text_hash = ANY($3::text[])`,
			[websiteId, lang, hashes]
		)

		const translationMap = new Map<string, string>()
		for (const row of result.rows) {
			translationMap.set(row.text_hash, row.translated_text)
		}
		return translationMap
	} catch (error) {
		console.error('DB translation hash lookup failed:', error)
		return new Map() // Fail open - treat as cache miss
	}
}
