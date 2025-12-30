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
	lookupPathname,
	batchLookupPathnames,
	batchUpsertPathnames,
	type PathnameResult,
	type PathnameMapping,
	type PathIds,
} from './paths.js'
export { type PatternType } from './types.js'
