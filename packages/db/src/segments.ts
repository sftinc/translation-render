/**
 * Translation cache queries
 * Batch operations to minimize SQL round trips
 *
 * Uses normalized schema:
 * - origin_segment: source text stored once per origin
 * - translated_segment: translations scoped to origin + lang
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
 * @param originId - Origin ID from getHostConfig()
 * @param lang - Target language code
 * @param texts - Array of normalized text strings to look up
 * @returns Map of original text -> translated text (only cache hits)
 *
 * SQL: 1 query joining origin_segment -> translated_segment
 */
export async function batchGetTranslations(
	originId: number,
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
			`SELECT os.text, ts.translated_text
			FROM origin_segment os
			JOIN translated_segment ts ON ts.origin_segment_id = os.id
			WHERE os.origin_id = $1
			  AND ts.lang = $2
			  AND os.text_hash = ANY($3::text[])`,
			[originId, lang, hashes]
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
 * Two-step upsert: origin_segment first, then translated_segment
 *
 * @param originId - Origin ID
 * @param lang - Target language code
 * @param translations - Array of translation items
 * @returns Map of text_hash -> translated_segment.id
 *
 * SQL: 2 queries - one for origin_segment, one for translated_segment
 */
export async function batchUpsertTranslations(
	originId: number,
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

		// Step 1: Upsert origin_segment (source text)
		await pool.query(
			`INSERT INTO origin_segment (origin_id, text, text_hash)
			SELECT $1, unnest($2::text[]), unnest($3::text[])
			ON CONFLICT (origin_id, text_hash) DO NOTHING`,
			[originId, originals, hashes]
		)

		// Step 2: Upsert translated_segment (translations)
		const result = await pool.query<{ id: number; text_hash: string }>(
			`INSERT INTO translated_segment (origin_id, lang, origin_segment_id, translated_text)
			SELECT $1, $2, os.id, t.translated
			FROM unnest($3::text[], $4::text[]) AS t(hash, translated)
			JOIN origin_segment os ON os.origin_id = $1 AND os.text_hash = t.hash
			ON CONFLICT (origin_segment_id, lang) DO NOTHING
			RETURNING id, (SELECT text_hash FROM origin_segment WHERE id = origin_segment_id) AS text_hash`,
			[originId, lang, hashes, translated]
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
 * @param originId - Origin ID
 * @param lang - Target language code
 * @param textHashes - Array of text hashes to look up
 * @returns Map of text_hash -> translated_segment.id
 *
 * SQL: 1 query joining origin_segment -> translated_segment
 */
export async function batchGetTranslationIds(
	originId: number,
	lang: string,
	textHashes: string[]
): Promise<Map<string, number>> {
	if (textHashes.length === 0) {
		return new Map()
	}

	try {
		const result = await pool.query<{ text_hash: string; id: number }>(
			`SELECT os.text_hash, ts.id
			FROM origin_segment os
			JOIN translated_segment ts ON ts.origin_segment_id = os.id
			WHERE os.origin_id = $1
			  AND ts.lang = $2
			  AND os.text_hash = ANY($3::text[])`,
			[originId, lang, textHashes]
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
 * Batch lookup origin segment IDs by text hash
 * Used to link origin segments to origin paths (language-independent)
 *
 * @param originId - Origin ID
 * @param textHashes - Array of text hashes to look up
 * @returns Map of text_hash -> origin_segment.id
 *
 * SQL: 1 query on origin_segment
 */
export async function batchGetOriginSegmentIds(
	originId: number,
	textHashes: string[]
): Promise<Map<string, number>> {
	if (textHashes.length === 0) {
		return new Map()
	}

	try {
		const result = await pool.query<{ text_hash: string; id: number }>(
			`SELECT text_hash, id
			FROM origin_segment
			WHERE origin_id = $1
			  AND text_hash = ANY($2::text[])`,
			[originId, textHashes]
		)

		const idMap = new Map<string, number>()
		for (const row of result.rows) {
			idMap.set(row.text_hash, row.id)
		}
		return idMap
	} catch (error) {
		console.error('DB origin segment ID lookup failed:', error)
		return new Map() // Fail open
	}
}
