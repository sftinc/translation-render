/**
 * Dashboard queries for the www app
 * Provides aggregated stats and CRUD operations for websites, languages, segments, and paths
 */

import { pool } from './pool.js'

// =============================================================================
// Types
// =============================================================================

export interface WebsiteWithStats {
	id: number
	domain: string
	sourceLang: string
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
	websiteSegmentId: number
	text: string
	translatedText: string | null
	reviewedAt: Date | null
}

export interface PathWithTranslation {
	id: number
	websitePathId: number
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

export interface Website {
	id: number
	domain: string
	sourceLang: string
}

export interface PathOption {
	id: number
	path: string
}

// =============================================================================
// Authorization
// =============================================================================

/**
 * Check if an account can access a website
 * @param accountId - Account ID
 * @param websiteId - Website ID
 * @returns true if the account has access via account_website
 */
export async function canAccessWebsite(accountId: number, websiteId: number): Promise<boolean> {
	const result = await pool.query(
		`SELECT 1 FROM account_website WHERE website_id = $1 AND account_id = $2 LIMIT 1`,
		[websiteId, accountId]
	)
	return (result.rowCount ?? 0) > 0
}

// =============================================================================
// Read Queries
// =============================================================================

/**
 * Get websites with aggregated stats for the overview page
 * @param accountId - Filter to websites the account has access to via account_website
 */
export async function getWebsitesWithStats(accountId: number): Promise<WebsiteWithStats[]> {
	const result = await pool.query<{
		id: number
		domain: string
		source_lang: string
		lang_count: string
		segment_count: string
		path_count: string
	}>(
		`
		SELECT
			w.id,
			w.domain,
			w.source_lang,
			(SELECT COUNT(DISTINCT target_lang) FROM host h WHERE h.website_id = w.id) as lang_count,
			(SELECT COUNT(*) FROM translated_segment ts JOIN website_segment ws ON ws.id = ts.website_segment_id WHERE ws.website_id = w.id) as segment_count,
			(SELECT COUNT(*) FROM translated_path tp JOIN website_path wp ON wp.id = tp.website_path_id WHERE wp.website_id = w.id AND EXISTS (SELECT 1 FROM website_path_segment wps WHERE wps.website_path_id = wp.id)) as path_count
		FROM account_website aw
		JOIN website w ON w.id = aw.website_id
		WHERE aw.account_id = $1
		ORDER BY w.domain
	`,
		[accountId]
	)

	return result.rows.map((row) => ({
		id: row.id,
		domain: row.domain,
		sourceLang: row.source_lang,
		langCount: parseInt(row.lang_count, 10),
		segmentCount: parseInt(row.segment_count, 10),
		pathCount: parseInt(row.path_count, 10),
	}))
}

/**
 * Get a single website by ID
 * Note: Authorization should be checked separately with canAccessWebsite()
 * @param websiteId - Website ID
 */
export async function getWebsiteById(websiteId: number): Promise<Website | null> {
	const result = await pool.query<{
		id: number
		domain: string
		source_lang: string
	}>(
		`SELECT id, domain, source_lang FROM website WHERE id = $1`,
		[websiteId]
	)

	if (result.rows.length === 0) return null

	const row = result.rows[0]
	return {
		id: row.id,
		domain: row.domain,
		sourceLang: row.source_lang,
	}
}

/**
 * Get all languages for a website with translation stats
 * Uses CTEs to scan translated_segment and translated_path once each instead of per-language
 */
export async function getLangsForWebsite(websiteId: number): Promise<LangWithStats[]> {
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
			JOIN website_segment ws ON ws.id = ts.website_segment_id
			WHERE ws.website_id = $1
			GROUP BY ts.lang
		),
		path_stats AS (
			SELECT tp.lang,
				COUNT(*) as total,
				COUNT(*) FILTER (WHERE tp.reviewed_at IS NULL) as unreviewed
			FROM translated_path tp
			JOIN website_path wp ON wp.id = tp.website_path_id
			WHERE wp.website_id = $1 AND EXISTS (SELECT 1 FROM website_path_segment wps WHERE wps.website_path_id = wp.id)
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
		WHERE h.website_id = $1
		ORDER BY h.target_lang
	`,
		[websiteId]
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
 * Check if a language exists for a website (for route validation)
 */
export async function isValidLangForWebsite(websiteId: number, lang: string): Promise<boolean> {
	const result = await pool.query<{ exists: boolean }>(
		'SELECT EXISTS(SELECT 1 FROM host WHERE website_id = $1 AND target_lang = $2) as exists',
		[websiteId, lang]
	)
	return result.rows[0]?.exists ?? false
}

/**
 * Get all paths for a website (for path filter dropdown)
 * Only returns paths that have at least one segment linked
 */
export async function getPathsForWebsite(websiteId: number): Promise<PathOption[]> {
	const result = await pool.query<{ id: number; path: string }>(
		`SELECT wp.id, wp.path FROM website_path wp
		WHERE wp.website_id = $1
		  AND EXISTS (SELECT 1 FROM website_path_segment wps WHERE wps.website_path_id = wp.id)
		ORDER BY wp.path`,
		[websiteId]
	)
	return result.rows
}

/**
 * Get segments for a website/language with pagination and filtering
 * @param websiteId - Website ID
 * @param lang - Target language code
 * @param filter - 'unreviewed' (translated but not reviewed) or 'all'
 * @param page - Page number (1-indexed)
 * @param limit - Items per page
 * @param pathId - Optional path filter: undefined = all, 'none' = orphans, number = specific path
 */
export async function getSegmentsForLang(
	websiteId: number,
	lang: string,
	filter: 'unreviewed' | 'all',
	page: number,
	limit: number,
	pathId?: number | 'none'
): Promise<PaginatedResult<SegmentWithTranslation>> {
	const offset = (page - 1) * limit

	// Build query parts based on filters
	let fromClause = 'FROM website_segment ws'
	let whereClause = 'WHERE ws.website_id = $1'
	const params: (number | string)[] = [websiteId, lang]

	// Path filter
	if (typeof pathId === 'number') {
		// Filter to segments on a specific path
		fromClause += ' INNER JOIN website_path_segment wps ON wps.website_segment_id = ws.id'
		whereClause += ` AND wps.website_path_id = $${params.length + 1}`
		params.push(pathId)
	} else if (pathId === 'none') {
		// Filter to orphan segments (no path association)
		whereClause += ' AND NOT EXISTS (SELECT 1 FROM website_path_segment wps WHERE wps.website_segment_id = ws.id)'
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
		LEFT JOIN translated_segment ts ON ts.website_segment_id = ws.id AND ts.lang = $2
		${whereClause}
	`,
		params
	)
	const total = parseInt(countResult.rows[0].count, 10)

	// Get paginated items
	const itemsResult = await pool.query<{
		id: number
		website_segment_id: number
		text: string
		translated_text: string | null
		reviewed_at: Date | null
	}>(
		`
		SELECT
			COALESCE(ts.id, 0) as id,
			ws.id as website_segment_id,
			ws.text,
			ts.translated_text,
			ts.reviewed_at
		${fromClause}
		LEFT JOIN translated_segment ts ON ts.website_segment_id = ws.id AND ts.lang = $2
		${whereClause}
		ORDER BY ws.id
		LIMIT $${params.length + 1} OFFSET $${params.length + 2}
	`,
		[...params, limit, offset]
	)

	return {
		items: itemsResult.rows.map((row) => ({
			id: row.id,
			websiteSegmentId: row.website_segment_id,
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
 * Get paths for a website/language with pagination and filtering
 * @param websiteId - Website ID
 * @param lang - Target language code
 * @param filter - 'unreviewed' (translated but not reviewed) or 'all'
 * @param page - Page number (1-indexed)
 * @param limit - Items per page
 */
export async function getPathsForLang(
	websiteId: number,
	lang: string,
	filter: 'unreviewed' | 'all',
	page: number,
	limit: number
): Promise<PaginatedResult<PathWithTranslation>> {
	const offset = (page - 1) * limit

	// Build query based on filter
	let whereClause = 'WHERE wp.website_id = $1 AND EXISTS (SELECT 1 FROM website_path_segment wps WHERE wps.website_path_id = wp.id)'
	if (filter === 'unreviewed') {
		whereClause += ' AND tp.id IS NOT NULL AND tp.reviewed_at IS NULL'
	}

	// Get total count
	const countResult = await pool.query<{ count: string }>(
		`
		SELECT COUNT(*) as count
		FROM website_path wp
		LEFT JOIN translated_path tp ON tp.website_path_id = wp.id AND tp.lang = $2
		${whereClause}
	`,
		[websiteId, lang]
	)
	const total = parseInt(countResult.rows[0].count, 10)

	// Get paginated items
	const itemsResult = await pool.query<{
		id: number
		website_path_id: number
		path: string
		translated_path: string | null
		reviewed_at: Date | null
	}>(
		`
		SELECT
			COALESCE(tp.id, 0) as id,
			wp.id as website_path_id,
			wp.path,
			tp.translated_path,
			tp.reviewed_at
		FROM website_path wp
		LEFT JOIN translated_path tp ON tp.website_path_id = wp.id AND tp.lang = $2
		${whereClause}
		ORDER BY wp.id
		LIMIT $3 OFFSET $4
	`,
		[websiteId, lang, limit, offset]
	)

	return {
		items: itemsResult.rows.map((row) => ({
			id: row.id,
			websitePathId: row.website_path_id,
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
 * Note: Authorization should be checked separately with canAccessWebsite()
 * @param websiteId - Website ID (for website-segment binding validation)
 * @param websiteSegmentId - Website segment ID
 * @param lang - Target language code
 * @param translatedText - Translation text
 * @returns Success status - mutation only succeeds if segment belongs to claimed website
 */
export async function updateSegmentTranslation(
	websiteId: number,
	websiteSegmentId: number,
	lang: string,
	translatedText: string
): Promise<{ success: boolean; error?: string }> {
	try {
		await pool.query(
			`UPDATE translated_segment ts
			 SET translated_text = $4, updated_at = NOW()
			 FROM website_segment ws
			 WHERE ts.website_segment_id = $2
			   AND ts.lang = $3
			   AND ws.id = ts.website_segment_id
			   AND ws.website_id = $1`,
			[websiteId, websiteSegmentId, lang, translatedText]
		)
		return { success: true }
	} catch (error) {
		console.error('Failed to update segment translation:', error)
		return { success: false, error: 'Failed to update translation' }
	}
}

/**
 * Update a path translation
 * Note: Authorization should be checked separately with canAccessWebsite()
 * @param websiteId - Website ID (for website-path binding validation)
 * @param websitePathId - Website path ID
 * @param lang - Target language code
 * @param translatedPath - Translated path
 * @returns Success status - mutation only succeeds if path belongs to claimed website
 */
export async function updatePathTranslation(
	websiteId: number,
	websitePathId: number,
	lang: string,
	translatedPath: string
): Promise<{ success: boolean; error?: string }> {
	try {
		await pool.query(
			`UPDATE translated_path tp
			 SET translated_path = $4, updated_at = NOW()
			 FROM website_path wp
			 WHERE tp.website_path_id = $2
			   AND tp.lang = $3
			   AND wp.id = tp.website_path_id
			   AND wp.website_id = $1`,
			[websiteId, websitePathId, lang, translatedPath]
		)
		return { success: true }
	} catch (error) {
		console.error('Failed to update path translation:', error)
		return { success: false, error: 'Failed to update translation' }
	}
}

/**
 * Mark a segment translation as reviewed
 * Note: Authorization should be checked separately with canAccessWebsite()
 * @param websiteId - Website ID (for website-segment binding validation)
 * @param websiteSegmentId - Website segment ID
 * @param lang - Target language code
 * @returns Success status - mutation only succeeds if segment belongs to claimed website
 */
export async function markSegmentReviewed(
	websiteId: number,
	websiteSegmentId: number,
	lang: string
): Promise<{ success: boolean; error?: string }> {
	try {
		await pool.query(
			`UPDATE translated_segment ts
			 SET reviewed_at = NOW(), updated_at = NOW()
			 FROM website_segment ws
			 WHERE ts.website_segment_id = $2
			   AND ts.lang = $3
			   AND ws.id = ts.website_segment_id
			   AND ws.website_id = $1`,
			[websiteId, websiteSegmentId, lang]
		)
		return { success: true }
	} catch (error) {
		console.error('Failed to mark segment as reviewed:', error)
		return { success: false, error: 'Failed to mark as reviewed' }
	}
}

/**
 * Mark a path translation as reviewed
 * Note: Authorization should be checked separately with canAccessWebsite()
 * @param websiteId - Website ID (for website-path binding validation)
 * @param websitePathId - Website path ID
 * @param lang - Target language code
 * @returns Success status - mutation only succeeds if path belongs to claimed website
 */
export async function markPathReviewed(
	websiteId: number,
	websitePathId: number,
	lang: string
): Promise<{ success: boolean; error?: string }> {
	try {
		await pool.query(
			`UPDATE translated_path tp
			 SET reviewed_at = NOW(), updated_at = NOW()
			 FROM website_path wp
			 WHERE tp.website_path_id = $2
			   AND tp.lang = $3
			   AND wp.id = tp.website_path_id
			   AND wp.website_id = $1`,
			[websiteId, websitePathId, lang]
		)
		return { success: true }
	} catch (error) {
		console.error('Failed to mark path as reviewed:', error)
		return { success: false, error: 'Failed to mark as reviewed' }
	}
}
