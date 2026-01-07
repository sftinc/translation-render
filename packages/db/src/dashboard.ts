/**
 * Dashboard queries for the www app
 * Provides aggregated stats and CRUD operations for origins, hosts, segments, and paths
 */

import { pool } from './pool.js'

// =============================================================================
// Types
// =============================================================================

export interface OriginWithStats {
	id: number
	domain: string
	originLang: string
	hostCount: number
	segmentCount: number
	pathCount: number
}

export interface HostWithStats {
	id: number
	hostname: string
	targetLang: string
	enabled: boolean
	translatedSegmentCount: number
	translatedPathCount: number
	unreviewedSegmentCount: number
	unreviewedPathCount: number
}

export interface HostWithOrigin {
	id: number
	hostname: string
	targetLang: string
	enabled: boolean
	originId: number
	originDomain: string
	originLang: string
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
		host_count: string
		segment_count: string
		path_count: string
	}>(`
		SELECT
			o.id,
			o.domain,
			o.origin_lang,
			(SELECT COUNT(*) FROM host h WHERE h.origin_id = o.id) as host_count,
			(SELECT COUNT(*) FROM origin_segment os WHERE os.origin_id = o.id) as segment_count,
			(SELECT COUNT(*) FROM origin_path op WHERE op.origin_id = o.id) as path_count
		FROM origin o
		ORDER BY o.domain
	`)

	return result.rows.map((row) => ({
		id: row.id,
		domain: row.domain,
		originLang: row.origin_lang,
		hostCount: parseInt(row.host_count, 10),
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
 * Get all hosts for an origin with translation stats
 */
export async function getHostsForOrigin(originId: number): Promise<HostWithStats[]> {
	const result = await pool.query<{
		id: number
		hostname: string
		target_lang: string
		enabled: boolean
		translated_segment_count: string
		translated_path_count: string
		unreviewed_segment_count: string
		unreviewed_path_count: string
	}>(
		`
		SELECT
			h.id,
			h.hostname,
			h.target_lang,
			h.enabled,
			(
				SELECT COUNT(*)
				FROM translated_segment ts
				JOIN origin_segment os ON os.id = ts.origin_segment_id
				WHERE os.origin_id = h.origin_id AND ts.lang = h.target_lang
			) as translated_segment_count,
			(
				SELECT COUNT(*)
				FROM translated_path tp
				JOIN origin_path op ON op.id = tp.origin_path_id
				WHERE op.origin_id = h.origin_id AND tp.lang = h.target_lang
			) as translated_path_count,
			(
				SELECT COUNT(*)
				FROM translated_segment ts
				JOIN origin_segment os ON os.id = ts.origin_segment_id
				WHERE os.origin_id = h.origin_id AND ts.lang = h.target_lang AND ts.reviewed_at IS NULL
			) as unreviewed_segment_count,
			(
				SELECT COUNT(*)
				FROM translated_path tp
				JOIN origin_path op ON op.id = tp.origin_path_id
				WHERE op.origin_id = h.origin_id AND tp.lang = h.target_lang AND tp.reviewed_at IS NULL
			) as unreviewed_path_count
		FROM host h
		WHERE h.origin_id = $1
		ORDER BY h.hostname
	`,
		[originId]
	)

	return result.rows.map((row) => ({
		id: row.id,
		hostname: row.hostname,
		targetLang: row.target_lang,
		enabled: row.enabled,
		translatedSegmentCount: parseInt(row.translated_segment_count, 10),
		translatedPathCount: parseInt(row.translated_path_count, 10),
		unreviewedSegmentCount: parseInt(row.unreviewed_segment_count, 10),
		unreviewedPathCount: parseInt(row.unreviewed_path_count, 10),
	}))
}

/**
 * Get a single host by ID with origin info
 */
export async function getHostById(hostId: number): Promise<HostWithOrigin | null> {
	const result = await pool.query<{
		id: number
		hostname: string
		target_lang: string
		enabled: boolean
		origin_id: number
		origin_domain: string
		origin_lang: string
	}>(
		`
		SELECT
			h.id,
			h.hostname,
			h.target_lang,
			h.enabled,
			h.origin_id,
			o.domain as origin_domain,
			o.origin_lang
		FROM host h
		JOIN origin o ON o.id = h.origin_id
		WHERE h.id = $1
	`,
		[hostId]
	)

	if (result.rows.length === 0) return null

	const row = result.rows[0]
	return {
		id: row.id,
		hostname: row.hostname,
		targetLang: row.target_lang,
		enabled: row.enabled,
		originId: row.origin_id,
		originDomain: row.origin_domain,
		originLang: row.origin_lang,
	}
}

/**
 * Get segments for a host with pagination and filtering
 * @param hostId - Host ID (used to get origin_id and target_lang)
 * @param filter - 'unreviewed' (translated but not reviewed) or 'all'
 * @param page - Page number (1-indexed)
 * @param limit - Items per page
 */
export async function getSegmentsForHost(
	hostId: number,
	filter: 'unreviewed' | 'all',
	page: number,
	limit: number
): Promise<PaginatedResult<SegmentWithTranslation>> {
	const offset = (page - 1) * limit

	// First get host info
	const hostResult = await pool.query<{ origin_id: number; target_lang: string }>(
		'SELECT origin_id, target_lang FROM host WHERE id = $1',
		[hostId]
	)

	if (hostResult.rows.length === 0) {
		return { items: [], total: 0, page, limit, totalPages: 0 }
	}

	const { origin_id, target_lang } = hostResult.rows[0]

	// Build query based on filter
	let whereClause = 'WHERE os.origin_id = $1'
	if (filter === 'unreviewed') {
		whereClause += ' AND ts.id IS NOT NULL AND ts.reviewed_at IS NULL'
	}

	// Get total count
	const countResult = await pool.query<{ count: string }>(
		`
		SELECT COUNT(*) as count
		FROM origin_segment os
		LEFT JOIN translated_segment ts ON ts.origin_segment_id = os.id AND ts.lang = $2
		${whereClause}
	`,
		[origin_id, target_lang]
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
		FROM origin_segment os
		LEFT JOIN translated_segment ts ON ts.origin_segment_id = os.id AND ts.lang = $2
		${whereClause}
		ORDER BY os.id
		LIMIT $3 OFFSET $4
	`,
		[origin_id, target_lang, limit, offset]
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
 * Get paths for a host with pagination and filtering
 * @param hostId - Host ID
 * @param filter - 'unreviewed' (translated but not reviewed) or 'all'
 * @param page - Page number (1-indexed)
 * @param limit - Items per page
 */
export async function getPathsForHost(
	hostId: number,
	filter: 'unreviewed' | 'all',
	page: number,
	limit: number
): Promise<PaginatedResult<PathWithTranslation>> {
	const offset = (page - 1) * limit

	// First get host info
	const hostResult = await pool.query<{ origin_id: number; target_lang: string }>(
		'SELECT origin_id, target_lang FROM host WHERE id = $1',
		[hostId]
	)

	if (hostResult.rows.length === 0) {
		return { items: [], total: 0, page, limit, totalPages: 0 }
	}

	const { origin_id, target_lang } = hostResult.rows[0]

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
		[origin_id, target_lang]
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
		[origin_id, target_lang, limit, offset]
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
