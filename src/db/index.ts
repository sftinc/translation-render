/**
 * Database module re-exports
 */

export { pool, testConnection, closePool } from './pool'
export { hashText } from './hash'
export { getHostConfig, clearHostCache, type HostConfig } from './host'
export {
	batchGetTranslations,
	batchUpsertTranslations,
	batchGetTranslationIds,
	batchGetOriginSegmentIds,
	type TranslationItem,
} from './translations'
export { linkPathnameTranslations } from './pathname-translations'
export { linkPathSegments } from './path-segments'
export {
	lookupPathname,
	batchLookupPathnames,
	batchUpsertPathnames,
	type PathnameResult,
	type PathnameMapping,
	type PathIds,
} from './pathnames'
