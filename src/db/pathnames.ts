/**
 * Pathname mapping queries
 * Batch operations for bidirectional URL lookup
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
 * Bidirectional pathname lookup
 * Looks up by BOTH path (forward) and translated_path (reverse)
 *
 * @param hostId - Host ID
 * @param pathname - Incoming pathname (could be original or translated)
 * @returns { originalPath, translatedPath } or null if not found
 *
 * SQL: 1 query
 */
export async function lookupPathname(hostId: number, pathname: string): Promise<PathnameResult | null> {
	try {
		const result = await pool.query<{
			path: string
			translated_path: string
		}>(
			`SELECT path, translated_path
			FROM pathname
			WHERE host_id = $1 AND (path = $2 OR translated_path = $2)
			LIMIT 1`,
			[hostId, pathname]
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
 * @param hostId - Host ID
 * @param paths - Array of original paths to look up
 * @returns Map<originalPath, translatedPath>
 *
 * SQL: 1 query
 */
export async function batchLookupPathnames(hostId: number, paths: string[]): Promise<Map<string, string>> {
	if (paths.length === 0) {
		return new Map()
	}

	try {
		const result = await pool.query<{
			path: string
			translated_path: string
		}>(
			`SELECT path, translated_path
			FROM pathname
			WHERE host_id = $1 AND path = ANY($2::text[])`,
			[hostId, paths]
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
 * Increments hit_count on conflict
 *
 * @param hostId - Host ID
 * @param mappings - Array of { original, translated } pairs
 *
 * SQL: 1 query with UNNEST
 */
export async function batchUpsertPathnames(hostId: number, mappings: PathnameMapping[]): Promise<void> {
	if (mappings.length === 0) {
		return
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

		await pool.query(
			`INSERT INTO pathname (host_id, path, translated_path, hit_count)
			SELECT $1, unnest($2::text[]), unnest($3::text[]), 1
			ON CONFLICT (host_id, path)
			DO UPDATE SET hit_count = pathname.hit_count + 1`,
			[hostId, originals, translated]
		)

		// console.log(`[DB PATHNAME UPDATE] host_id=${hostId} → +${mappings.length} pathnames`)
	} catch (error) {
		console.error('DB pathname batch upsert failed:', error)
		// Fail open - don't throw
	}
}
