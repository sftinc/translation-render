/**
 * Junction table operations
 * Links paths to segments for tracking which translations appear on which pages
 *
 * Tables:
 * - origin_path_segment: links origin_path to origin_segment (language-independent)
 * - pathname_translation: links translated_path to translated_segment
 */

import { pool } from './pool'

/**
 * Link an origin path to multiple origin segments
 * Uses ON CONFLICT DO NOTHING for idempotency
 *
 * @param originPathId - Origin path ID from batchUpsertPathnames
 * @param originSegmentIds - Array of origin segment IDs to link
 *
 * SQL: 1 query with UNNEST
 */
export async function linkPathSegments(
	originPathId: number,
	originSegmentIds: number[]
): Promise<void> {
	if (originSegmentIds.length === 0) {
		return
	}

	try {
		await pool.query(
			`INSERT INTO origin_path_segment (origin_path_id, origin_segment_id)
			SELECT $1, unnest($2::int[])
			ON CONFLICT (origin_path_id, origin_segment_id) DO NOTHING`,
			[originPathId, originSegmentIds]
		)
	} catch (error) {
		console.error('Failed to link path segments:', error)
		// Non-blocking - don't throw
	}
}

/**
 * Link a translated path to multiple translated segments
 * Uses ON CONFLICT DO NOTHING for idempotency
 *
 * @param translatedPathId - Translated path ID from batchUpsertPathnames
 * @param translatedSegmentIds - Array of translated segment IDs to link
 *
 * SQL: 1 query with UNNEST
 */
export async function linkPathnameTranslations(
	translatedPathId: number,
	translatedSegmentIds: number[]
): Promise<void> {
	if (translatedSegmentIds.length === 0) {
		return
	}

	try {
		await pool.query(
			`INSERT INTO pathname_translation (translated_path_id, translated_segment_id)
			SELECT $1, unnest($2::int[])
			ON CONFLICT (translated_path_id, translated_segment_id) DO NOTHING`,
			[translatedPathId, translatedSegmentIds]
		)
	} catch (error) {
		console.error('Failed to link pathname translations:', error)
		// Non-blocking - don't throw
	}
}
