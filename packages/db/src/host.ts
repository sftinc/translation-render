/**
 * Host configuration queries
 * Replaces HOST_SETTINGS lookup with database query
 */

import { pool } from './pool.js'

/**
 * Host configuration from database
 * Matches structure needed by index.ts
 */
export interface HostConfig {
	hostId: number
	originId: number // origin.id - used for translation lookups
	origin: string // Constructed: 'https://' + domain
	originDomain: string // origin.domain
	sourceLang: string // origin.origin_lang
	targetLang: string // host.target_lang
	skipWords: string[]
	skipPath: (string | RegExp)[]
	translatePath: boolean
	proxiedCache: number
}

// In-memory cache for hot path (host config rarely changes)
const hostCache = new Map<string, { config: HostConfig | null; expiresAt: number }>()
const HOST_CACHE_TTL = 60_000 // 60 seconds

/**
 * Parse skip_path array from database format
 * Database stores: ['includes:/api/', 'regex:^/admin']
 * Returns: ['/api/', /^\/admin/]
 */
function parseSkipPath(dbArray: string[] | null): (string | RegExp)[] {
	if (!dbArray || dbArray.length === 0) return []

	return dbArray.map((pattern) => {
		if (pattern.startsWith('regex:')) {
			return new RegExp(pattern.slice(6))
		} else if (pattern.startsWith('includes:')) {
			return pattern.slice(9)
		}
		// Plain string (legacy format)
		return pattern
	})
}

/**
 * Get host configuration by hostname
 * Uses in-memory cache to avoid DB hit on every request
 *
 * @param hostname - Request hostname (e.g., 'es.esnipe.com')
 * @returns HostConfig or null if not found/disabled
 *
 * SQL: 1 query (host JOIN origin)
 */
export async function getHostConfig(hostname: string): Promise<HostConfig | null> {
	// Check in-memory cache first
	const now = Date.now()
	const cached = hostCache.get(hostname)
	if (cached && cached.expiresAt > now) {
		return cached.config
	}

	try {
		const result = await pool.query<{
			host_id: number
			origin_id: number
			target_lang: string
			skip_words: string[] | null
			skip_path: string[] | null
			translate_path: boolean | null
			proxied_cache: number
			origin_domain: string
			origin_lang: string
		}>(
			`SELECT
				h.id AS host_id,
				h.origin_id,
				h.target_lang,
				o.skip_words,
				o.skip_path,
				o.translate_path,
				h.proxied_cache,
				o.domain AS origin_domain,
				o.origin_lang
			FROM host h
			JOIN origin o ON o.id = h.origin_id
			WHERE h.hostname = $1 AND h.enabled = TRUE`,
			[hostname]
		)

		if (result.rows.length === 0) {
			// Cache the miss too (prevents repeated queries for invalid hosts)
			hostCache.set(hostname, { config: null, expiresAt: now + HOST_CACHE_TTL })
			return null
		}

		const row = result.rows[0]
		const config: HostConfig = {
			hostId: row.host_id,
			originId: row.origin_id,
			origin: `https://${row.origin_domain}`,
			originDomain: row.origin_domain,
			sourceLang: row.origin_lang,
			targetLang: row.target_lang,
			skipWords: row.skip_words || [],
			skipPath: parseSkipPath(row.skip_path),
			translatePath: row.translate_path ?? true,
			proxiedCache: row.proxied_cache,
		}

		// Cache the result
		hostCache.set(hostname, { config, expiresAt: now + HOST_CACHE_TTL })
		return config
	} catch (error) {
		console.error('DB host config lookup failed:', error)
		return null // Fail open
	}
}

/**
 * Clear host config cache
 * Useful for testing or after config changes
 */
export function clearHostCache(): void {
	hostCache.clear()
}
