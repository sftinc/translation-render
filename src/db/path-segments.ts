/**
 * Origin path-segment junction table operations
 * Links origin paths to origin segments (language-independent)
 *
 * Uses normalized schema:
 * - origin_path_segment links origin_path to origin_segment
 * - Stores relationship once per page, not per language
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
