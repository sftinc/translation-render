/**
 * Dashboard queries for the www app
 * Provides aggregated stats and CRUD operations for origins, languages, segments, and paths
 */

import { pool } from './pool.js'

// =============================================================================
// Types
// =============================================================================

export interface OriginWithStats {
	id: number
	domain: string
	originLang: string
	langCount: number
	segmentCount: number
	pathCount: number
}

export interface LangWithStats {
	targetLang: string
	translatedSegmentCount: number
	translatedPathCount: number
	unreviewedSegmentCount: number
	unreviewedPathCount: number
}

export interface SegmentWithTranslation {
	id: number
	originSegmentId: number
	text: string
	translatedText: string | null
	reviewedAt: Date | null
}

export interface PathWithTranslation {
	id: number
	originPathId: number
	path: string
	translatedPath: string | null
	reviewedAt: Date | null
}

export interface PaginatedResult<T> {
	items: T[]
	total: number
	page: number
	limit: number
	totalPages: number
}

export interface Origin {
	id: number
	domain: string
	originLang: string
}

export interface PathOption {
	id: number
	path: string
}

// =============================================================================
// Authorization
// =============================================================================

/**
 * Check if a profile can access an origin
 * @param profileId - Profile ID
 * @param originId - Origin ID
 * @returns true if the profile has access via account_profile
 */
export async function canAccessOrigin(profileId: number, originId: number): Promise<boolean> {
	const result = await pool.query(
		`SELECT 1 FROM origin o
		 JOIN account_profile ap ON ap.account_id = o.account_id
		 WHERE o.id = $1 AND ap.profile_id = $2
		 LIMIT 1`,
		[originId, profileId]
	)
	return (result.rowCount ?? 0) > 0
}

// =============================================================================
// Read Queries
// =============================================================================

/**
 * Get origins with aggregated stats for the overview page
 * @param profileId - Filter to origins the profile has access to via account_profile
 */
export async function getOriginsWithStats(profileId: number): Promise<OriginWithStats[]> {
	const result = await pool.query<{
		id: number
		domain: string
		origin_lang: string
		lang_count: string
		segment_count: string
		path_count: string
	}>(
		`
		SELECT
			o.id,
			o.domain,
			o.origin_lang,
			(SELECT COUNT(DISTINCT target_lang) FROM host h WHERE h.origin_id = o.id) as lang_count,
			(SELECT COUNT(*) FROM origin_segment os WHERE os.origin_id = o.id) as segment_count,
			(SELECT COUNT(*) FROM origin_path op WHERE op.origin_id = o.id) as path_count
		FROM origin o
		JOIN account_profile ap ON ap.account_id = o.account_id
		WHERE ap.profile_id = $1
		ORDER BY o.domain
	`,
		[profileId]
	)

	return result.rows.map((row) => ({
		id: row.id,
		domain: row.domain,
		originLang: row.origin_lang,
		langCount: parseInt(row.lang_count, 10),
		segmentCount: parseInt(row.segment_count, 10),
		pathCount: parseInt(row.path_count, 10),
	}))
}

/**
 * Get a single origin by ID
 * Note: Authorization should be checked separately with canAccessOrigin()
 * @param originId - Origin ID
 */
export async function getOriginById(originId: number): Promise<Origin | null> {
	const result = await pool.query<{
		id: number
		domain: string
		origin_lang: string
	}>(
		`SELECT id, domain, origin_lang FROM origin WHERE id = $1`,
		[originId]
	)

	if (result.rows.length === 0) return null

	const row = result.rows[0]
	return {
		id: row.id,
		domain: row.domain,
		originLang: row.origin_lang,
	}
}

/**
 * Get all languages for an origin with translation stats
 * Uses CTEs to scan translated_segment and translated_path once each instead of per-language
 */
export async function getLangsForOrigin(originId: number): Promise<LangWithStats[]> {
	const result = await pool.query<{
		target_lang: string
		translated_segment_count: string
		translated_path_count: string
		unreviewed_segment_count: string
		unreviewed_path_count: string
	}>(
		`
		WITH segment_stats AS (
			SELECT ts.lang,
				COUNT(*) as total,
				COUNT(*) FILTER (WHERE ts.reviewed_at IS NULL) as unreviewed
			FROM translated_segment ts
			JOIN origin_segment os ON os.id = ts.origin_segment_id
			WHERE os.origin_id = $1
			GROUP BY ts.lang
		),
		path_stats AS (
			SELECT tp.lang,
				COUNT(*) as total,
				COUNT(*) FILTER (WHERE tp.reviewed_at IS NULL) as unreviewed
			FROM translated_path tp
			JOIN origin_path op ON op.id = tp.origin_path_id
			WHERE op.origin_id = $1
			GROUP BY tp.lang
		)
		SELECT DISTINCT
			h.target_lang,
			COALESCE(ss.total, 0) as translated_segment_count,
			COALESCE(ps.total, 0) as translated_path_count,
			COALESCE(ss.unreviewed, 0) as unreviewed_segment_count,
			COALESCE(ps.unreviewed, 0) as unreviewed_path_count
		FROM host h
		LEFT JOIN segment_stats ss ON ss.lang = h.target_lang
		LEFT JOIN path_stats ps ON ps.lang = h.target_lang
		WHERE h.origin_id = $1
		ORDER BY h.target_lang
	`,
		[originId]
	)

	return result.rows.map((row) => ({
		targetLang: row.target_lang,
		translatedSegmentCount: parseInt(row.translated_segment_count, 10),
		translatedPathCount: parseInt(row.translated_path_count, 10),
		unreviewedSegmentCount: parseInt(row.unreviewed_segment_count, 10),
		unreviewedPathCount: parseInt(row.unreviewed_path_count, 10),
	}))
}

/**
 * Check if a language exists for an origin (for route validation)
 */
export async function isValidLangForOrigin(originId: number, lang: string): Promise<boolean> {
	const result = await pool.query<{ exists: boolean }>(
		'SELECT EXISTS(SELECT 1 FROM host WHERE origin_id = $1 AND target_lang = $2) as exists',
		[originId, lang]
	)
	return result.rows[0]?.exists ?? false
}

/**
 * Get all paths for an origin (for path filter dropdown)
 * Only returns paths that have at least one segment linked
 */
export async function getPathsForOrigin(originId: number): Promise<PathOption[]> {
	const result = await pool.query<{ id: number; path: string }>(
		`SELECT op.id, op.path FROM origin_path op
		WHERE op.origin_id = $1
		  AND EXISTS (SELECT 1 FROM origin_path_segment ops WHERE ops.origin_path_id = op.id)
		ORDER BY op.path`,
		[originId]
	)
	return result.rows
}

/**
 * Get segments for an origin/language with pagination and filtering
 * @param originId - Origin ID
 * @param lang - Target language code
 * @param filter - 'unreviewed' (translated but not reviewed) or 'all'
 * @param page - Page number (1-indexed)
 * @param limit - Items per page
 * @param pathId - Optional path filter: undefined = all, 'none' = orphans, number = specific path
 */
export async function getSegmentsForLang(
	originId: number,
	lang: string,
	filter: 'unreviewed' | 'all',
	page: number,
	limit: number,
	pathId?: number | 'none'
): Promise<PaginatedResult<SegmentWithTranslation>> {
	const offset = (page - 1) * limit

	// Build query parts based on filters
	let fromClause = 'FROM origin_segment os'
	let whereClause = 'WHERE os.origin_id = $1'
	const params: (number | string)[] = [originId, lang]

	// Path filter
	if (typeof pathId === 'number') {
		// Filter to segments on a specific path
		fromClause += ' INNER JOIN origin_path_segment ops ON ops.origin_segment_id = os.id'
		whereClause += ` AND ops.origin_path_id = $${params.length + 1}`
		params.push(pathId)
	} else if (pathId === 'none') {
		// Filter to orphan segments (no path association)
		whereClause += ' AND NOT EXISTS (SELECT 1 FROM origin_path_segment ops WHERE ops.origin_segment_id = os.id)'
	}

	// Review filter
	if (filter === 'unreviewed') {
		whereClause += ' AND ts.id IS NOT NULL AND ts.reviewed_at IS NULL'
	}

	// Get total count
	const countResult = await pool.query<{ count: string }>(
		`
		SELECT COUNT(*) as count
		${fromClause}
		LEFT JOIN translated_segment ts ON ts.origin_segment_id = os.id AND ts.lang = $2
		${whereClause}
	`,
		params
	)
	const total = parseInt(countResult.rows[0].count, 10)

	// Get paginated items
	const itemsResult = await pool.query<{
		id: number
		origin_segment_id: number
		text: string
		translated_text: string | null
		reviewed_at: Date | null
	}>(
		`
		SELECT
			COALESCE(ts.id, 0) as id,
			os.id as origin_segment_id,
			os.text,
			ts.translated_text,
			ts.reviewed_at
		${fromClause}
		LEFT JOIN translated_segment ts ON ts.origin_segment_id = os.id AND ts.lang = $2
		${whereClause}
		ORDER BY os.id
		LIMIT $${params.length + 1} OFFSET $${params.length + 2}
	`,
		[...params, limit, offset]
	)

	return {
		items: itemsResult.rows.map((row) => ({
			id: row.id,
			originSegmentId: row.origin_segment_id,
			text: row.text,
			translatedText: row.translated_text,
			reviewedAt: row.reviewed_at,
		})),
		total,
		page,
		limit,
		totalPages: Math.ceil(total / limit),
	}
}

/**
 * Get paths for an origin/language with pagination and filtering
 * @param originId - Origin ID
 * @param lang - Target language code
 * @param filter - 'unreviewed' (translated but not reviewed) or 'all'
 * @param page - Page number (1-indexed)
 * @param limit - Items per page
 */
export async function getPathsForLang(
	originId: number,
	lang: string,
	filter: 'unreviewed' | 'all',
	page: number,
	limit: number
): Promise<PaginatedResult<PathWithTranslation>> {
	const offset = (page - 1) * limit

	// Build query based on filter
	let whereClause = 'WHERE op.origin_id = $1'
	if (filter === 'unreviewed') {
		whereClause += ' AND tp.id IS NOT NULL AND tp.reviewed_at IS NULL'
	}

	// Get total count
	const countResult = await pool.query<{ count: string }>(
		`
		SELECT COUNT(*) as count
		FROM origin_path op
		LEFT JOIN translated_path tp ON tp.origin_path_id = op.id AND tp.lang = $2
		${whereClause}
	`,
		[originId, lang]
	)
	const total = parseInt(countResult.rows[0].count, 10)

	// Get paginated items
	const itemsResult = await pool.query<{
		id: number
		origin_path_id: number
		path: string
		translated_path: string | null
		reviewed_at: Date | null
	}>(
		`
		SELECT
			COALESCE(tp.id, 0) as id,
			op.id as origin_path_id,
			op.path,
			tp.translated_path,
			tp.reviewed_at
		FROM origin_path op
		LEFT JOIN translated_path tp ON tp.origin_path_id = op.id AND tp.lang = $2
		${whereClause}
		ORDER BY op.id
		LIMIT $3 OFFSET $4
	`,
		[originId, lang, limit, offset]
	)

	return {
		items: itemsResult.rows.map((row) => ({
			id: row.id,
			originPathId: row.origin_path_id,
			path: row.path,
			translatedPath: row.translated_path,
			reviewedAt: row.reviewed_at,
		})),
		total,
		page,
		limit,
		totalPages: Math.ceil(total / limit),
	}
}

// =============================================================================
// Write Queries
// =============================================================================

/**
 * Update a segment translation
 * Note: Authorization should be checked separately with canAccessOrigin()
 * @param originId - Origin ID (for origin-segment binding validation)
 * @param originSegmentId - Origin segment ID
 * @param lang - Target language code
 * @param translatedText - Translation text
 * @returns Success status - mutation only succeeds if segment belongs to claimed origin
 */
export async function updateSegmentTranslation(
	originId: number,
	originSegmentId: number,
	lang: string,
	translatedText: string
): Promise<{ success: boolean; error?: string }> {
	try {
		await pool.query(
			`UPDATE translated_segment ts
			 SET translated_text = $4, updated_at = NOW()
			 FROM origin_segment os
			 WHERE ts.origin_segment_id = $2
			   AND ts.lang = $3
			   AND os.id = ts.origin_segment_id
			   AND os.origin_id = $1`,
			[originId, originSegmentId, lang, translatedText]
		)
		return { success: true }
	} catch (error) {
		console.error('Failed to update segment translation:', error)
		return { success: false, error: 'Failed to update translation' }
	}
}

/**
 * Update a path translation
 * Note: Authorization should be checked separately with canAccessOrigin()
 * @param originId - Origin ID (for origin-path binding validation)
 * @param originPathId - Origin path ID
 * @param lang - Target language code
 * @param translatedPath - Translated path
 * @returns Success status - mutation only succeeds if path belongs to claimed origin
 */
export async function updatePathTranslation(
	originId: number,
	originPathId: number,
	lang: string,
	translatedPath: string
): Promise<{ success: boolean; error?: string }> {
	try {
		await pool.query(
			`UPDATE translated_path tp
			 SET translated_path = $4, updated_at = NOW()
			 FROM origin_path op
			 WHERE tp.origin_path_id = $2
			   AND tp.lang = $3
			   AND op.id = tp.origin_path_id
			   AND op.origin_id = $1`,
			[originId, originPathId, lang, translatedPath]
		)
		return { success: true }
	} catch (error) {
		console.error('Failed to update path translation:', error)
		return { success: false, error: 'Failed to update translation' }
	}
}

/**
 * Mark a segment translation as reviewed
 * Note: Authorization should be checked separately with canAccessOrigin()
 * @param originId - Origin ID (for origin-segment binding validation)
 * @param originSegmentId - Origin segment ID
 * @param lang - Target language code
 * @returns Success status - mutation only succeeds if segment belongs to claimed origin
 */
export async function markSegmentReviewed(
	originId: number,
	originSegmentId: number,
	lang: string
): Promise<{ success: boolean; error?: string }> {
	try {
		await pool.query(
			`UPDATE translated_segment ts
			 SET reviewed_at = NOW(), updated_at = NOW()
			 FROM origin_segment os
			 WHERE ts.origin_segment_id = $2
			   AND ts.lang = $3
			   AND os.id = ts.origin_segment_id
			   AND os.origin_id = $1`,
			[originId, originSegmentId, lang]
		)
		return { success: true }
	} catch (error) {
		console.error('Failed to mark segment as reviewed:', error)
		return { success: false, error: 'Failed to mark as reviewed' }
	}
}

/**
 * Mark a path translation as reviewed
 * Note: Authorization should be checked separately with canAccessOrigin()
 * @param originId - Origin ID (for origin-path binding validation)
 * @param originPathId - Origin path ID
 * @param lang - Target language code
 * @returns Success status - mutation only succeeds if path belongs to claimed origin
 */
export async function markPathReviewed(
	originId: number,
	originPathId: number,
	lang: string
): Promise<{ success: boolean; error?: string }> {
	try {
		await pool.query(
			`UPDATE translated_path tp
			 SET reviewed_at = NOW(), updated_at = NOW()
			 FROM origin_path op
			 WHERE tp.origin_path_id = $2
			   AND tp.lang = $3
			   AND op.id = tp.origin_path_id
			   AND op.origin_id = $1`,
			[originId, originPathId, lang]
		)
		return { success: true }
	} catch (error) {
		console.error('Failed to mark path as reviewed:', error)
		return { success: false, error: 'Failed to mark as reviewed' }
	}
}
