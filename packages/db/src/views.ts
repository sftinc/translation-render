import { pool } from './pool.js'

/**
 * Record a page view for a website path + language combination.
 * Increments hit_count if already exists for today, otherwise inserts.
 * Non-blocking - errors are logged but don't throw.
 */
export async function recordPageView(
	websitePathId: number,
	lang: string
): Promise<void> {
	try {
		await pool.query(
			`INSERT INTO stats_page_view (website_path_id, lang, view_date, hit_count)
			 VALUES ($1, $2, CURRENT_DATE, 1)
			 ON CONFLICT (website_path_id, lang, view_date)
			 DO UPDATE SET hit_count = stats_page_view.hit_count + 1`,
			[websitePathId, lang]
		)
	} catch (error) {
		console.error('Failed to record page view:', error)
	}
}

/**
 * Update last_used_on for translated segments that were fetched from cache.
 * Only updates if the current date is different (to minimize writes).
 * Non-blocking - errors are logged but don't throw.
 *
 * @param websiteId - Website ID
 * @param lang - Target language code
 * @param textHashes - Array of text hashes for segments that were used
 */
export async function updateSegmentLastUsed(
	websiteId: number,
	lang: string,
	textHashes: string[]
): Promise<void> {
	if (textHashes.length === 0) return

	try {
		await pool.query(
			`UPDATE translation_segment ts
			 SET last_used_on = CURRENT_DATE
			 FROM website_segment ws
			 WHERE ts.website_segment_id = ws.id
			   AND ws.website_id = $1
			   AND ts.lang = $2
			   AND ws.text_hash = ANY($3::text[])
			   AND (ts.last_used_on IS NULL OR ts.last_used_on < CURRENT_DATE)`,
			[websiteId, lang, textHashes]
		)
	} catch (error) {
		console.error('Failed to update segment last_used_on:', error)
	}
}

/**
 * Update last_used_on for translated paths that were fetched from cache.
 * Only updates if the current date is different (to minimize writes).
 * Non-blocking - errors are logged but don't throw.
 *
 * @param websiteId - Website ID
 * @param lang - Target language code
 * @param paths - Array of original paths that were used
 */
export async function updatePathLastUsed(
	websiteId: number,
	lang: string,
	paths: string[]
): Promise<void> {
	if (paths.length === 0) return

	try {
		await pool.query(
			`UPDATE translation_path tp
			 SET last_used_on = CURRENT_DATE
			 FROM website_path wp
			 WHERE tp.website_path_id = wp.id
			   AND wp.website_id = $1
			   AND tp.lang = $2
			   AND wp.path = ANY($3::text[])
			   AND (tp.last_used_on IS NULL OR tp.last_used_on < CURRENT_DATE)`,
			[websiteId, lang, paths]
		)
	} catch (error) {
		console.error('Failed to update path last_used_on:', error)
	}
}
