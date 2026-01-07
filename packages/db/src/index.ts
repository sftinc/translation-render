/**
 * Database module re-exports
 */

export { pool, testConnection, closePool } from './pool.js'
export { hashText } from './utils/hash.js'
export { getHostConfig, clearHostCache, type HostConfig } from './host.js'
export {
	batchGetTranslations,
	batchUpsertTranslations,
	batchGetTranslationIds,
	batchGetOriginSegmentIds,
	type TranslationItem,
} from './segments.js'
export { linkPathnameTranslations, linkPathSegments } from './junctions.js'
export {
	getOriginPathId,
	lookupPathname,
	batchLookupPathnames,
	batchUpsertPathnames,
	type PathnameResult,
	type PathnameMapping,
	type PathIds,
} from './paths.js'
export { type PatternType } from './types.js'
export { recordPageView, updateSegmentLastUsed, updatePathLastUsed } from './views.js'
export {
	getOriginsWithStats,
	getOriginById,
	getHostsForOrigin,
	getHostById,
	getSegmentsForHost,
	getPathsForHost,
	updateSegmentTranslation,
	updatePathTranslation,
	markSegmentReviewed,
	markPathReviewed,
	type OriginWithStats,
	type HostWithStats,
	type HostWithOrigin,
	type SegmentWithTranslation,
	type PathWithTranslation,
	type PaginatedResult,
	type Origin,
} from './dashboard.js'
