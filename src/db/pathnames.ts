/**
 * Pathname mapping queries
 * Batch operations for bidirectional URL lookup
 *
 * Uses normalized schema:
 * - origin_path: source paths stored once per origin
 * - translated_path: path translations scoped to origin + lang
 */

import { pool } from './pool'

/**
 * Pathname mapping result
 */
export interface PathnameResult {
	originalPath: string
	translatedPath: string
}

/**
 * Pathname mapping for batch upsert
 */
export interface PathnameMapping {
	original: string
	translated: string
}

/**
 * Path IDs returned from batch upsert
 * Contains both origin and translated IDs for junction table linking
 */
export interface PathIds {
	originPathId: number
	translatedPathId: number
}

/**
 * Bidirectional pathname lookup
 * Looks up by BOTH path (forward) and translated_path (reverse)
 *
 * @param originId - Origin ID
 * @param lang - Target language code
 * @param pathname - Incoming pathname (could be original or translated)
 * @returns { originalPath, translatedPath } or null if not found
 *
 * SQL: 1 query joining origin_path -> translated_path
 */
export async function lookupPathname(
	originId: number,
	lang: string,
	pathname: string
): Promise<PathnameResult | null> {
	try {
		const result = await pool.query<{
			path: string
			translated_path: string
		}>(
			`SELECT op.path, tp.translated_path
			FROM origin_path op
			JOIN translated_path tp ON tp.origin_path_id = op.id
			WHERE op.origin_id = $1
			  AND tp.lang = $2
			  AND (op.path = $3 OR tp.translated_path = $3)
			LIMIT 1`,
			[originId, lang, pathname]
		)

		if (result.rows.length === 0) {
			return null
		}

		const row = result.rows[0]
		return {
			originalPath: row.path,
			translatedPath: row.translated_path,
		}
	} catch (error) {
		console.error('DB pathname lookup failed:', error)
		return null // Fail open
	}
}

/**
 * Batch lookup pathnames for link rewriting
 * Returns map of original path -> translated path
 *
 * @param originId - Origin ID
 * @param lang - Target language code
 * @param paths - Array of original paths to look up
 * @returns Map<originalPath, translatedPath>
 *
 * SQL: 1 query joining origin_path -> translated_path
 */
export async function batchLookupPathnames(
	originId: number,
	lang: string,
	paths: string[]
): Promise<Map<string, string>> {
	if (paths.length === 0) {
		return new Map()
	}

	try {
		const result = await pool.query<{
			path: string
			translated_path: string
		}>(
			`SELECT op.path, tp.translated_path
			FROM origin_path op
			JOIN translated_path tp ON tp.origin_path_id = op.id
			WHERE op.origin_id = $1
			  AND tp.lang = $2
			  AND op.path = ANY($3::text[])`,
			[originId, lang, paths]
		)

		const pathMap = new Map<string, string>()
		for (const row of result.rows) {
			pathMap.set(row.path, row.translated_path)
		}

		return pathMap
	} catch (error) {
		console.error('DB pathname batch lookup failed:', error)
		return new Map() // Fail open
	}
}

/**
 * Batch insert/update pathname mappings
 * Two-step upsert: origin_path first, then translated_path
 * Increments hit_count on conflict
 *
 * @param originId - Origin ID
 * @param lang - Target language code
 * @param mappings - Array of { original, translated } pairs
 * @returns Map of path -> { originPathId, translatedPathId }
 *
 * SQL: 2 queries - one for origin_path, one for translated_path
 */
export async function batchUpsertPathnames(
	originId: number,
	lang: string,
	mappings: PathnameMapping[]
): Promise<Map<string, PathIds>> {
	if (mappings.length === 0) {
		return new Map()
	}

	try {
		// Deduplicate by original path (last one wins)
		const uniqueMap = new Map<string, PathnameMapping>()
		for (const m of mappings) {
			uniqueMap.set(m.original, m)
		}
		const uniqueMappings = Array.from(uniqueMap.values())

		// Prepare parallel arrays for UNNEST
		const originals: string[] = []
		const translated: string[] = []

		for (const m of uniqueMappings) {
			originals.push(m.original)
			translated.push(m.translated)
		}

		// Step 1: Upsert origin_path (source paths)
		await pool.query(
			`INSERT INTO origin_path (origin_id, path)
			SELECT $1, unnest($2::text[])
			ON CONFLICT (origin_id, path) DO NOTHING`,
			[originId, originals]
		)

		// Step 2: Upsert translated_path (translations)
		const result = await pool.query<{ id: number; origin_path_id: number; path: string }>(
			`INSERT INTO translated_path (origin_id, lang, origin_path_id, translated_path, hit_count)
			SELECT $1, $2, op.id, t.translated, 1
			FROM unnest($3::text[], $4::text[]) AS t(original, translated)
			JOIN origin_path op ON op.origin_id = $1 AND op.path = t.original
			ON CONFLICT (origin_path_id, lang)
			DO UPDATE SET hit_count = translated_path.hit_count + 1
			RETURNING id, origin_path_id, (SELECT path FROM origin_path WHERE id = origin_path_id) AS path`,
			[originId, lang, originals, translated]
		)

		// Return map: path -> { originPathId, translatedPathId }
		const idMap = new Map<string, PathIds>()
		for (const row of result.rows) {
			idMap.set(row.path, {
				originPathId: row.origin_path_id,
				translatedPathId: row.id,
			})
		}
		return idMap
	} catch (error) {
		console.error('DB pathname batch upsert failed:', error)
		return new Map() // Fail open
	}
}
