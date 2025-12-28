/**
 * Database module re-exports
 */

export { pool, testConnection, closePool } from './pool'
export { hashText } from '../utils/hash'
export { getHostConfig, clearHostCache, type HostConfig } from './host'
export {
	batchGetTranslations,
	batchUpsertTranslations,
	batchGetTranslationIds,
	batchGetOriginSegmentIds,
	type TranslationItem,
} from './segments'
export { linkPathnameTranslations, linkPathSegments } from './junctions'
export {
	lookupPathname,
	batchLookupPathnames,
	batchUpsertPathnames,
	type PathnameResult,
	type PathnameMapping,
	type PathIds,
} from './paths'
