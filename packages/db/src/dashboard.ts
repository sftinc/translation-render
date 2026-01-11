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
// Read Queries
// =============================================================================

/**
 * Get all origins with aggregated stats for the overview page
 */
export async function getOriginsWithStats(): Promise<OriginWithStats[]> {
	const result = await pool.query<{
		id: number
		domain: string
		origin_lang: string
		lang_count: string
		segment_count: string
		path_count: string
	}>(`
		SELECT
			o.id,
			o.domain,
			o.origin_lang,
			(SELECT COUNT(DISTINCT target_lang) FROM host h WHERE h.origin_id = o.id) as lang_count,
			(SELECT COUNT(*) FROM origin_segment os WHERE os.origin_id = o.id) as segment_count,
			(SELECT COUNT(*) FROM origin_path op WHERE op.origin_id = o.id) as path_count
		FROM origin o
		ORDER BY o.domain
	`)

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
 */
export async function getOriginById(originId: number): Promise<Origin | null> {
	const result = await pool.query<{
		id: number
		domain: string
		origin_lang: string
	}>('SELECT id, domain, origin_lang FROM origin WHERE id = $1', [originId])

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
 * Update or insert a segment translation
 */
export async function updateSegmentTranslation(
	originSegmentId: number,
	lang: string,
	translatedText: string
): Promise<{ success: boolean; error?: string }> {
	try {
		await pool.query(
			`
			INSERT INTO translated_segment (origin_segment_id, lang, translated_text)
			VALUES ($1, $2, $3)
			ON CONFLICT (origin_segment_id, lang)
			DO UPDATE SET translated_text = $3, updated_at = NOW()
		`,
			[originSegmentId, lang, translatedText]
		)
		return { success: true }
	} catch (error) {
		console.error('Failed to update segment translation:', error)
		return { success: false, error: 'Failed to update translation' }
	}
}

/**
 * Update or insert a path translation
 */
export async function updatePathTranslation(
	originPathId: number,
	lang: string,
	translatedPath: string
): Promise<{ success: boolean; error?: string }> {
	try {
		await pool.query(
			`
			INSERT INTO translated_path (origin_path_id, lang, translated_path)
			VALUES ($1, $2, $3)
			ON CONFLICT (origin_path_id, lang)
			DO UPDATE SET translated_path = $3, updated_at = NOW()
		`,
			[originPathId, lang, translatedPath]
		)
		return { success: true }
	} catch (error) {
		console.error('Failed to update path translation:', error)
		return { success: false, error: 'Failed to update translation' }
	}
}

/**
 * Mark a segment translation as reviewed
 */
export async function markSegmentReviewed(
	originSegmentId: number,
	lang: string
): Promise<{ success: boolean; error?: string }> {
	try {
		const result = await pool.query(
			`
			UPDATE translated_segment
			SET reviewed_at = NOW(), updated_at = NOW()
			WHERE origin_segment_id = $1 AND lang = $2
		`,
			[originSegmentId, lang]
		)
		if (result.rowCount === 0) {
			return { success: false, error: 'Translation not found' }
		}
		return { success: true }
	} catch (error) {
		console.error('Failed to mark segment as reviewed:', error)
		return { success: false, error: 'Failed to mark as reviewed' }
	}
}

/**
 * Mark a path translation as reviewed
 */
export async function markPathReviewed(
	originPathId: number,
	lang: string
): Promise<{ success: boolean; error?: string }> {
	try {
		const result = await pool.query(
			`
			UPDATE translated_path
			SET reviewed_at = NOW(), updated_at = NOW()
			WHERE origin_path_id = $1 AND lang = $2
		`,
			[originPathId, lang]
		)
		if (result.rowCount === 0) {
			return { success: false, error: 'Translation not found' }
		}
		return { success: true }
	} catch (error) {
		console.error('Failed to mark path as reviewed:', error)
		return { success: false, error: 'Failed to mark as reviewed' }
	}
}
