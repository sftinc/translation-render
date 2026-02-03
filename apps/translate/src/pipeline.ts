/**
 * Translation Proxy Server
 * Main request handler
 * Orchestrates: cache → fetch → parse → extract → translate → apply → rewrite → return
 *
 * Steps:
 * 1. cache     - Config lookup from DB (in-memory cache, 60s TTL)
 * 2. fetch     - HTTP fetch from origin, handle redirects and non-HTML
 * 3. parse     - Parse HTML document with linkedom
 * 4. extract   - Extract translatable segments and link pathnames
 * 5. translate - Pattern normalization, cache lookup, LLM translation for misses
 * 6. apply     - Restore patterns, apply translations to DOM
 * 7. rewrite   - Rewrite links for translated domain, add lang metadata
 * 8. return    - Inject recovery assets for SPAs, serialize HTML, send response
 */

import type { Request, Response } from 'express'
import type { Content } from './types.js'
import { parseHTMLDocument } from './dom/parser.js'
import { extractSegments, extractLinkPathnames } from './dom/extractor.js'
import { applyTranslations } from './dom/applicator.js'
import { rewriteLinks } from './dom/rewriter.js'
import { addLangMetadata } from './dom/metadata.js'
import { translateSegments } from './translation/translate-segments.js'
import { applyPatterns, restorePatterns } from './translation/skip-patterns.js'
import {
	shouldSkipPath,
	normalizePathname,
	denormalizePathname,
	translatePathnamesBatch,
} from './translation/translate-pathnames.js'
import { prepareResponseHeaders } from './http/headers.js'
import { rewriteRedirectLocation } from './http/redirect.js'
import { proxyStaticAsset, proxyNonHtmlContent, isHtmlContent, isRedirect, type ProxyConfig } from './http/proxy.js'
import { renderMessagePage } from './utils/message-page.js'
import { getCacheControl } from './utils/cache-control.js'
import { detectSpaFramework, buildTranslationDictionary, injectRecoveryAssets, markSkippedElements } from './recovery/index.js'
import { isInFlight, setInFlight, buildInFlightKey, startBackgroundTranslation, startBackgroundPathTranslation, injectDeferredAssets } from './deferred/index.js'
import type { PendingSegment, ApplyTranslationsResult } from './dom/applicator.js'
import {
	getTranslationConfig,
	getWebsitePathId,
	lookupPathname,
	batchLookupPathnames,
	batchGetTranslations,
	batchUpsertTranslations,
	batchUpsertPathnames,
	batchGetWebsiteSegmentIds,
	linkPathSegments,
	hashText,
	recordPageView,
	updateSegmentLastUsed,
	updatePathLastUsed,
	recordLlmUsage,
	type TranslationItem,
	type PathnameMapping,
	type LlmUsageRecord,
} from '@pantolingo/db'

/**
 * Deferred database writes - executed after response is sent
 */
interface DeferredWrites {
	websiteId: number
	lang: string
	translationId: number
	translations: TranslationItem[]
	pathnames: PathnameMapping[]
	currentPath: string
	newSegmentHashes: string[]
	cachedSegmentHashes: string[]
	cachedPaths: string[]
	websitePathId?: number // ID from stage 1 lookup (for existing paths)
	statusCode: number // Website response status code
	llmUsage: LlmUsageRecord[]
}

/**
 * Execute deferred database writes after response is sent
 * All operations are non-blocking and errors are logged but don't affect the response
 */
async function executeDeferredWrites(writes: DeferredWrites): Promise<void> {
	const { websiteId, lang, translationId, translations, pathnames, currentPath, newSegmentHashes, cachedSegmentHashes, cachedPaths, websitePathId, statusCode, llmUsage } =
		writes

	const isErrorResponse = statusCode >= 400

	try {
		// 1. Upsert translations (cache for future requests - even for error pages)
		if (translations.length > 0) {
			await batchUpsertTranslations(websiteId, lang, translations)
		}

		// 2. Record LLM usage (fire-and-forget, non-blocking)
		if (llmUsage.length > 0) {
			recordLlmUsage(llmUsage)
		}

		// Skip path operations for error responses (4xx, 5xx)
		if (isErrorResponse) {
			// Still update last_used_on for cached segments (they were used to translate error page)
			if (cachedSegmentHashes.length > 0) {
				updateSegmentLastUsed(websiteId, lang, cachedSegmentHashes)
			}
			return
		}

		// 2. Upsert pathnames (always includes current path) and get IDs
		const pathnameIdMap = await batchUpsertPathnames(websiteId, lang, pathnames)

		// 3. Link new segments to current path
		let pathIds = pathnameIdMap.get(currentPath)

		// Use lookup ID for existing paths (upsert returns nothing for ON CONFLICT DO NOTHING)
		if (!pathIds?.websitePathId && websitePathId) {
			pathIds = { websitePathId, translatedPathId: 0 }
		}

		// Fallback for unexpected edge cases
		if (!pathIds?.websitePathId) {
			console.warn('getWebsitePathId fallback triggered - investigate:', currentPath)
			const fallbackId = await getWebsitePathId(websiteId, currentPath)
			if (fallbackId) {
				pathIds = { websitePathId: fallbackId, translatedPathId: 0 }
			}
		}

		const allSegmentHashes = [...newSegmentHashes, ...cachedSegmentHashes]
		if (pathIds?.websitePathId && allSegmentHashes.length > 0) {
			const websiteSegmentIds = await batchGetWebsiteSegmentIds(websiteId, allSegmentHashes)
			if (websiteSegmentIds.size > 0) {
				await linkPathSegments(pathIds.websitePathId, Array.from(websiteSegmentIds.values()))
			}
		}

		// 4. Record page view
		if (pathIds?.websitePathId) {
			recordPageView(pathIds.websitePathId, translationId)
		}

		// 5. Update last_used_on for cached items (fire-and-forget)
		if (cachedSegmentHashes.length > 0) {
			updateSegmentLastUsed(websiteId, lang, cachedSegmentHashes)
		}
		if (cachedPaths.length > 0) {
			updatePathLastUsed(websiteId, lang, cachedPaths)
		}
	} catch (error) {
		console.error('Deferred DB writes failed:', error)
	}
}

// Control console logging
const redirectLogging = false // redirects
const proxyLogging = false // non-HTML resources (proxied)

/**
 * Result from matching segments with cache
 */
export interface MatchResult {
	cached: Map<number, string> // Map of segment index → cached translation
	newSegments: Content[] // Segments that need translation
	newIndices: number[] // Original indices of new segments
}

/**
 * Match extracted segments against cached translations (from database)
 * @param segments - Extracted segments from page
 * @param cache - Translation cache Map (original → translated)
 * @returns Match result with cached translations and new segments
 */
export function matchSegmentsWithMap(segments: Content[], cache: Map<string, string>): MatchResult {
	const cached = new Map<number, string>()
	const newSegments: Content[] = []
	const newIndices: number[] = []

	if (cache.size === 0) {
		// Cold cache - all segments are new
		return {
			cached,
			newSegments: segments,
			newIndices: segments.map((_, i) => i),
		}
	}

	// Match each segment using O(1) hash lookup
	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i]
		const translation = cache.get(segment.value)

		if (translation) {
			// Cache hit
			cached.set(i, translation)
		} else {
			// Cache miss - need to translate
			newSegments.push(segment)
			newIndices.push(i)
		}
	}

	return { cached, newSegments, newIndices }
}

// Environment variables - read lazily to ensure dotenv has loaded
const OPENROUTER_API_KEY = () => process.env.OPENROUTER_API_KEY || ''
const GOOGLE_PROJECT_ID = () => process.env.GOOGLE_PROJECT_ID || ''

/**
 * Main request handler for Express
 */
export async function handleRequest(req: Request, res: Response): Promise<void> {
	const protocol = req.get('x-forwarded-proto') || req.protocol || 'http'
	const host = req.get('x-forwarded-host') || req.get('host') || ''
	const url = new URL(req.originalUrl, `${protocol}://${host}`)

	// Keep for debugging
	// console.log(`URL: ${url.href}`)

	try {
		// 1. Parse request and determine target language from database
		const translationConfig = await getTranslationConfig(host.startsWith('localhost') ? host.split(':')[0] : host)

		if (!translationConfig) {
			// console.log(`Unknown host: ${host}`)
			res.set('Content-Type', 'text/html').send(
				renderMessagePage({
					title: 'Host Not Configured',
					message: `The host "${host}" is not configured for translation through Pantolingo.`,
					subtitle: `Please check your domain settings or contact support.`,
				})
			)
			return
		}

		const targetLang = translationConfig.targetLang

		// Extract per-domain website configuration
		const originBase = `https://${translationConfig.websiteHostname}`
		const originHostname = translationConfig.websiteHostname
		const sourceLang = translationConfig.sourceLang

		// Resolve pathname (reverse lookup for translated URLs)
		// Always attempt reverse lookup to support bookmarked/indexed translated URLs
		// regardless of translatePath setting. If no mapping exists, incoming pathname
		// is assumed to be the original English pathname (safe fallback).
		//
		// Configuration behaviors:
		// - translatePath: false → Reverse lookup enabled, forward translation disabled
		// - translatePath: true  → Both reverse lookup and forward translation enabled

		const incomingPathname = url.pathname
		let originalPathname = incomingPathname

		// CRITICAL: Early exit for static assets - skip ALL cache operations
		const proxyConfig: ProxyConfig = {
			originBase,
			targetLang,
			cacheDisabledUntil: translationConfig.cacheDisabledUntil,
		}

		if (await proxyStaticAsset(req, res, url, host, proxyConfig)) {
			return
		}

		// STAGE 1: Early pathname lookup for reverse URL resolution
		// Normalize incoming pathname before lookup (DB stores normalized paths)
		const { normalized: normalizedIncoming, replacements: incomingReplacements } = normalizePathname(incomingPathname)
		const pathnameResult = await lookupPathname(translationConfig.websiteId, translationConfig.targetLang, normalizedIncoming)
		if (pathnameResult) {
			// If we found a match and the incoming path matches the translated path,
			// use the original path for fetching (denormalize to restore numeric values)
			if (pathnameResult.translatedPath === normalizedIncoming) {
				originalPathname = denormalizePathname(pathnameResult.originalPath, incomingReplacements)
			}
		}

		// Compute origin URL using resolved pathname
		const fetchUrl = originBase + originalPathname + url.search

		// 4. Fetch HTML from origin
		let html: string

		try {
			// Fetch with header forwarding
			const fetchStart = Date.now()
			const fetchHeaders: Record<string, string> = {}
			const headersToForward = [
				'user-agent',
				'accept-language',
				'accept-encoding',
				'referer',
				'cookie',
				'content-type',
			]
			for (const headerName of headersToForward) {
				const headerValue = req.get(headerName)
				if (headerValue) fetchHeaders[headerName] = headerValue
			}
			if (!fetchHeaders['user-agent']) {
				fetchHeaders['user-agent'] = 'Mozilla/5.0 (Translation Proxy) AppleWebKit/537.36'
			}
			fetchHeaders['weglot-language'] = targetLang
			fetchHeaders['pantolingo-language'] = targetLang

			// For POST/PUT/PATCH/DELETE, we need to buffer the body to handle redirects
			let fetchBody: ArrayBuffer | undefined
			if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
				const bodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body)
				fetchBody = bodyBuffer.buffer.slice(bodyBuffer.byteOffset, bodyBuffer.byteOffset + bodyBuffer.byteLength)
			}

			const originResponse = await fetch(fetchUrl, {
				method: req.method,
				headers: fetchHeaders,
				redirect: 'manual',
				...(fetchBody ? { body: fetchBody } : {}),
			})

			// Handle redirects: detect and rewrite Location header to translated domain
			if (isRedirect(originResponse.status)) {
				const location = originResponse.headers.get('location')

				if (location) {
					// Rewrite Location header to point to our translated domain
					const redirectUrl = rewriteRedirectLocation(location, host, originBase, url)

					if (redirectLogging)
						console.log(`▶ [${targetLang}] ${fetchUrl} - Redirect ${originResponse.status} → ${redirectUrl}`)

					// Build redirect response
					res.status(originResponse.status).set('Location', redirectUrl)

					// Forward Set-Cookie headers (can be multiple)
					const cookies: string[] = []
					originResponse.headers.forEach((value, key) => {
						if (key.toLowerCase() === 'set-cookie') {
							cookies.push(value)
						}
					})
					if (cookies.length > 0) {
						res.set('Set-Cookie', cookies)
					}

					res.send()
					return
				}
			}

			// Handle non-HTML content (proxy)
			if (!isHtmlContent(originResponse)) {
				await proxyNonHtmlContent(res, originResponse, proxyConfig, proxyLogging, fetchUrl)
				return
			}

			// Initialize deferred writes - will be executed after response is sent
			const { normalized: normalizedCurrentPath } = normalizePathname(originalPathname)
			const deferredWrites: DeferredWrites = {
				websiteId: translationConfig.websiteId,
				lang: translationConfig.targetLang,
				translationId: translationConfig.translationId,
				translations: [],
				pathnames: [], // Background handles new path writes; cached paths already in DB
				currentPath: normalizedCurrentPath,
				newSegmentHashes: [],
				cachedSegmentHashes: [],
				cachedPaths: [],
				websitePathId: pathnameResult?.websitePathId,
				statusCode: originResponse.status,
				llmUsage: [],
			}

			// Fetch HTML content for translation
			const fetchResult = {
				html: await originResponse.text(),
				finalUrl: originResponse.url,
				statusCode: originResponse.status,
				headers: originResponse.headers,
			}

			// Parse HTML with linkedom
			const parseStart = Date.now()
			const { document } = parseHTMLDocument(fetchResult.html)

			// 5. Extract segments
			const skipSelectors = translationConfig.skipSelectors
			const extractedSegments = extractSegments(document, skipSelectors)
			const fetchTime = parseStart - fetchStart

			// Store original values for dictionary building (before any modifications)
			const originalValues = extractedSegments.map((s) => s.value)

			let cachedHits = 0
			let cacheMisses = 0
			let newTranslations: string[] = []
			let batchCount = 0
			let translateTime = 0
			let totalPaths = 0
			let newPaths = 0

			if (extractedSegments.length > 0) {
				// 6. Apply patterns to normalize text for caching (PII redaction, numeric placeholders)
				const patternData = extractedSegments.map((seg) => applyPatterns(seg.value))
				const normalizedSegments = extractedSegments.map((seg, i) => ({
					...seg,
					value: patternData[i].normalized,
				}))

				// 7. Batch lookup translations from database
				const segmentTexts = normalizedSegments.map((s) => s.value)
				const cachedTranslations = await batchGetTranslations(
					translationConfig.websiteId,
					translationConfig.targetLang,
					segmentTexts
				)

				// Match segments with cache
				const { cached, newSegments, newIndices } = matchSegmentsWithMap(normalizedSegments, cachedTranslations)

				cachedHits = cached.size
				cacheMisses = newSegments.length

				// Collect cached segment hashes for deferred last_used_on update
				if (cachedTranslations.size > 0) {
					deferredWrites.cachedSegmentHashes = Array.from(cachedTranslations.keys()).map((text) => hashText(text))
				}

				// Compute hashes for all segments (needed for both deferred and sync modes)
				const segmentHashes = normalizedSegments.map((s) => hashText(s.value))

				// Feature toggle for deferred translation (always on for now, future: per-site setting)
				const useDeferredTranslation = true

				// 8. Extract link pathnames early (before translation) for parallel processing
				// Skip path translation for error responses (4xx, 5xx)
				const isErrorResponse = fetchResult.statusCode >= 400
				const linkPathnames = translationConfig.translatePath && !isErrorResponse
					? extractLinkPathnames(document, originHostname)
					: new Set<string>()

				// ===== DEFERRED TRANSLATION PATH =====
				// When enabled and there are cache misses, serve page immediately with skeletons
				// and translate in the background
				if (useDeferredTranslation && newSegments.length > 0) {
					// Deduplicate against in-flight store to avoid duplicate LLM calls
					const segmentsToTranslate: Content[] = []
					const hashesToTranslate: string[] = []

					for (let i = 0; i < newSegments.length; i++) {
						const originalIndex = newIndices[i]
						const hash = segmentHashes[originalIndex]
						const key = buildInFlightKey(translationConfig.websiteId, targetLang, hash)

						if (!isInFlight(key)) {
							setInFlight(key)
							segmentsToTranslate.push(newSegments[i])
							hashesToTranslate.push(hash)
						}
					}

					// Fire-and-forget background translation
					if (segmentsToTranslate.length > 0) {
						startBackgroundTranslation({
							websiteId: translationConfig.websiteId,
							lang: targetLang,
							sourceLang,
							segments: segmentsToTranslate,
							hashes: hashesToTranslate,
							skipWords: translationConfig.skipWords,
							apiKey: OPENROUTER_API_KEY(),
							projectId: GOOGLE_PROJECT_ID(),
							context: { host, pathname: originalPathname },
						}).catch((err) => console.error('[Background Translation] Error:', err))
					}

					// Build translations array: cached values + null for pending
					const translations: (string | null)[] = normalizedSegments.map((_, i) => {
						const cachedTranslation = cached.get(i)
						return cachedTranslation !== undefined ? cachedTranslation : null
					})

					// Restore patterns for cached translations before applying to DOM
					const restoredTranslations: (string | null)[] = translations.map((translation, i) => {
						if (translation === null) return null
						return restorePatterns(translation, patternData[i]?.replacements ?? [], patternData[i]?.isUpperCase)
					})

					// Apply translations with deferred mode (marks pending as skeletons)
					const applyResult = applyTranslations(
						document,
						restoredTranslations,
						extractedSegments,
						skipSelectors,
						segmentHashes
					) as ApplyTranslationsResult

					// Inject deferred assets if there are pending segments
					if (applyResult.pending.length > 0) {
						injectDeferredAssets(document, applyResult.pending)
					}

					// Log deferred mode info
					translateTime = 0 // No wait time in deferred mode
					batchCount = 0 // No batches sent synchronously
					const pendingCount = applyResult.pending.length
					const appliedCount = applyResult.applied

					// Handle pathnames - use cached translations, fire background for uncached
					let translatedPathname = originalPathname
					let pathnameMap: Map<string, string> | undefined

					// Skip pathname handling for error responses
					if (translationConfig.translatePath && !isErrorResponse) {
						try {
							const allPathnames = new Set(linkPathnames)
							if (!shouldSkipPath(originalPathname, translationConfig.skipPath)) {
								allPathnames.add(originalPathname)
							}
							totalPaths = allPathnames.size

							if (allPathnames.size > 0) {
								// Normalize paths before DB lookup
								const normalizedToOriginal = new Map<string, string>()
								for (const path of allPathnames) {
									const { normalized } = normalizePathname(path)
									normalizedToOriginal.set(normalized, path)
								}
								const normalizedPaths = Array.from(normalizedToOriginal.keys())
								const existingPathnames = await batchLookupPathnames(
									translationConfig.websiteId,
									translationConfig.targetLang,
									normalizedPaths
								)

								// Collect cached paths for deferred last_used_on update
								if (existingPathnames.size > 0) {
									deferredWrites.cachedPaths = Array.from(existingPathnames.keys())
								}

								// Build pathnameMap with cached translations only
								// Uncached paths pass through unchanged (server reverse lookup handles navigation)
								pathnameMap = new Map<string, string>()
								const uncachedPaths: Array<{ original: string; normalized: string }> = []

								for (const [normalized, original] of normalizedToOriginal.entries()) {
									// Check if path should be skipped
									if (shouldSkipPath(original, translationConfig.skipPath)) {
										pathnameMap.set(original, original)
										continue
									}

									const translatedNormalized = existingPathnames.get(normalized)
									if (translatedNormalized) {
										// Cache hit - denormalize and add to map
										const { replacements } = normalizePathname(original)
										const denormalized = denormalizePathname(translatedNormalized, replacements)
										pathnameMap.set(original, denormalized)
									} else {
										// Cache miss - will translate in background
										// Pass through original for now (rewriteLinks handles missing gracefully)
										pathnameMap.set(original, original)
										uncachedPaths.push({ original, normalized })
									}
								}

								// Get translated current pathname from cache (if available)
								translatedPathname = pathnameMap.get(originalPathname) || originalPathname
								newPaths = uncachedPaths.length

								// Fire background translation for uncached paths (don't await)
								if (uncachedPaths.length > 0) {
									// Deduplicate against in-flight store to avoid duplicate LLM calls
									const pathsToTranslate: Array<{ original: string; normalized: string }> = []
									for (const path of uncachedPaths) {
										const key = buildInFlightKey(translationConfig.websiteId, targetLang, path.normalized)
										if (!isInFlight(key)) {
											setInFlight(key)
											pathsToTranslate.push(path)
										}
									}

									if (pathsToTranslate.length > 0) {
										startBackgroundPathTranslation({
											websiteId: translationConfig.websiteId,
											lang: targetLang,
											sourceLang,
											uncachedPaths: pathsToTranslate,
											skipWords: translationConfig.skipWords,
											apiKey: OPENROUTER_API_KEY(),
											context: { host, pathname: originalPathname },
										}).catch((err) => console.error('[Background Path] Error:', err))
									}
								}
							}
						} catch (pathnameError) {
							console.error('[Deferred Pathname] Failed:', pathnameError)
						}
					}

					// Rewrite links
					rewriteLinks(
						document,
						originHostname,
						host,
						originalPathname,
						translatedPathname,
						translationConfig.translatePath || false,
						pathnameMap
					)

					// Add lang metadata
					try {
						addLangMetadata(document, targetLang, sourceLang, host, originHostname, originalPathname, url)
					} catch (langError) {
						console.error('[Lang Metadata] Failed:', langError)
					}

					// Inject SPA recovery assets if needed (with cached translations only)
					if (detectSpaFramework(document) && appliedCount > 0) {
						const dictionary = buildTranslationDictionary(
							document,
							extractedSegments,
							originalValues,
							skipSelectors,
							targetLang
						)

						const hasEntries =
							Object.keys(dictionary.text).length > 0 ||
							Object.keys(dictionary.html).length > 0 ||
							Object.keys(dictionary.attrs).length > 0

						if (hasEntries) {
							markSkippedElements(document, skipSelectors)
							injectRecoveryAssets(document, dictionary)
						}
					}

					// Serialize and send response immediately
					html = document.toString()

					const totalTime = Date.now() - fetchStart
					const urlObj = new URL(fetchUrl)
					console.log(
						`▶ [${targetLang}] ${urlObj.host}${urlObj.pathname} (${totalTime}ms) [DEFERRED] | fetch: ${fetchTime}ms | trans: 0 | seg: ${appliedCount + pendingCount} (+${pendingCount}) | paths: ${totalPaths} (+${newPaths})`
					)

					// Execute deferred DB writes after response is sent
					res.on('finish', () => {
						executeDeferredWrites(deferredWrites)
					})

					// Send response
					const htmlHeaders = prepareResponseHeaders(fetchResult.headers)
					htmlHeaders['Content-Type'] = 'text/html; charset=utf-8'
					htmlHeaders['Cache-Control'] = getCacheControl({
						originHeaders: fetchResult.headers,
						cacheDisabledUntil: translationConfig.cacheDisabledUntil,
						applyMinimumCache: false,
					})
					res.status(fetchResult.statusCode).set(htmlHeaders).send(html)
					return
				}

				// ===== SYNCHRONOUS TRANSLATION PATH (existing behavior) =====
				// Used when deferred mode is disabled OR when all segments are cached

				// 9. Translate segments and pathnames in parallel for maximum performance
				const translateStart = Date.now()

				// Context for logging translation failures
				const translationContext = { host, pathname: originalPathname }

				// Create promises for parallel execution
				const segmentPromise =
					newSegments.length > 0
						? translateSegments(
								newSegments,
								sourceLang,
								targetLang,
								GOOGLE_PROJECT_ID(),
								OPENROUTER_API_KEY(),
								translationConfig.skipWords,
								'balanced', // TODO: Use translationConfig.style after DB migration
								translationContext
						  )
						: Promise.resolve({
								translations: [],
								uniqueCount: 0,
								batchCount: 0,
								usage: { promptTokens: 0, completionTokens: 0, cost: 0 },
								apiCallCount: 0,
						  })

				// Pathname translation: batch current + links together for efficiency
				const pathnamePromise = async () => {
					let translatedPathname = originalPathname
					let pathnameSegment = null
					let pathnameMap: Map<string, string> | undefined
					let pathnameSegments: Content[] = []
					let pathnameTranslations: string[] = []
					let totalPaths = 0
					let pathnameUsage = { promptTokens: 0, completionTokens: 0, cost: 0 }
					let pathnameApiCallCount = 0

					// Skip path translation for error responses or if disabled
					if (!translationConfig.translatePath || isErrorResponse) {
						return {
							translatedPathname,
							pathnameSegment,
							pathnameMap,
							pathnameSegments,
							pathnameTranslations,
							totalPaths,
							usage: pathnameUsage,
							apiCallCount: pathnameApiCallCount,
						}
					}

					try {
						// Add current pathname to link pathnames for batching
						const allPathnames = new Set(linkPathnames)
						if (!shouldSkipPath(originalPathname, translationConfig.skipPath)) {
							allPathnames.add(originalPathname)
						}
						totalPaths = allPathnames.size

						if (allPathnames.size === 0) {
							return {
								translatedPathname,
								pathnameSegment,
								pathnameMap,
								pathnameSegments,
								pathnameTranslations,
								totalPaths,
								usage: pathnameUsage,
								apiCallCount: pathnameApiCallCount,
							}
						}

						// Normalize paths before DB lookup (DB stores normalized paths)
						const normalizedToOriginal = new Map<string, string>()
						for (const path of allPathnames) {
							const { normalized } = normalizePathname(path)
							normalizedToOriginal.set(normalized, path)
						}
						const normalizedPaths = Array.from(normalizedToOriginal.keys())
						const existingPathnames = await batchLookupPathnames(
							translationConfig.websiteId,
							translationConfig.targetLang,
							normalizedPaths
						)

						// Collect cached paths for deferred last_used_on update
						if (existingPathnames.size > 0) {
							deferredWrites.cachedPaths = Array.from(existingPathnames.keys())
						}

						// Build a PathnameMapping-like structure for translatePathnamesBatch
						// Keys are normalized paths (matching what translatePathnamesBatch looks up)
						const pathnameMapping =
							existingPathnames.size > 0
								? {
										source: Object.fromEntries(existingPathnames),
										translated: Object.fromEntries(
											Array.from(existingPathnames.entries()).map(([k, v]) => [v, k])
										),
								  }
								: null

						// Translate all pathnames in one batch
						const batchResult = await translatePathnamesBatch(
							allPathnames,
							pathnameMapping,
							async (segments: Content[]) => {
								// Style is ignored for pathnames (only applies to segments)
								const result = await translateSegments(
									segments,
									sourceLang,
									targetLang,
									GOOGLE_PROJECT_ID(),
									OPENROUTER_API_KEY(),
									translationConfig.skipWords,
									'balanced',
									translationContext
								)
								return {
									translations: result.translations,
									usage: result.usage,
									apiCallCount: result.apiCallCount,
								}
							},
							translationConfig.skipPath
						)

						// Extract current pathname translation from batch results
						translatedPathname = batchResult.pathnameMap.get(originalPathname) || originalPathname

						// Create pathname segment for caching
						if (translatedPathname !== originalPathname) {
							const { normalized } = normalizePathname(originalPathname)
							pathnameSegment = { kind: 'path' as const, value: normalized }
						}

						pathnameMap = batchResult.pathnameMap
						pathnameSegments = batchResult.newSegments
						pathnameTranslations = batchResult.newTranslations
						pathnameUsage = batchResult.usage
						pathnameApiCallCount = batchResult.apiCallCount
					} catch (error) {
						console.error('[Pathname Translation] Failed:', error)
						// Continue with original pathname
					}

					return {
						translatedPathname,
						pathnameSegment,
						pathnameMap,
						pathnameSegments,
						pathnameTranslations,
						totalPaths,
						usage: pathnameUsage,
						apiCallCount: pathnameApiCallCount,
					}
				}

				// Execute translations in parallel
				try {
					const [segmentResult, pathnameResult] = await Promise.all([segmentPromise, pathnamePromise()])

					// Extract segment translation results
					newTranslations = segmentResult.translations
					batchCount = segmentResult.batchCount
					translateTime = Date.now() - translateStart

					// Extract pathname translation results
					const translatedPathname = pathnameResult.translatedPathname
					const pathnameSegment = pathnameResult.pathnameSegment
					const pathnameMap = pathnameResult.pathnameMap
					const pathnameSegments = pathnameResult.pathnameSegments
					const pathnameTranslations = pathnameResult.pathnameTranslations
					totalPaths = pathnameResult.totalPaths
					newPaths = pathnameTranslations.length

					// Collect LLM usage for deferred write
					if (segmentResult.apiCallCount > 0) {
						deferredWrites.llmUsage.push({
							websiteId: translationConfig.websiteId,
							feature: 'segment_translation',
							promptTokens: segmentResult.usage.promptTokens,
							completionTokens: segmentResult.usage.completionTokens,
							cost: segmentResult.usage.cost,
							apiCalls: segmentResult.apiCallCount,
						})
					}
					if (pathnameResult.apiCallCount > 0) {
						deferredWrites.llmUsage.push({
							websiteId: translationConfig.websiteId,
							feature: 'path_translation',
							promptTokens: pathnameResult.usage.promptTokens,
							completionTokens: pathnameResult.usage.completionTokens,
							cost: pathnameResult.usage.cost,
							apiCalls: pathnameResult.apiCallCount,
						})
					}

					// 8. Merge cached + new translations in original order
					const allTranslations = new Array(extractedSegments.length).fill('')
					for (const [idx, translation] of cached.entries()) {
						allTranslations[idx] = translation
					}
					for (let i = 0; i < newIndices.length; i++) {
						allTranslations[newIndices[i]] = newTranslations[i]
					}

					// 10. Restore patterns before applying to DOM
					const restoredTranslations = allTranslations.map((translation, i) => {
						// Always call restorePatterns to ensure case formatting is applied even if no patterns
						return restorePatterns(translation, patternData[i]?.replacements ?? [], patternData[i]?.isUpperCase)
					})

					// 11. Apply translations to DOM
					applyTranslations(document, restoredTranslations, extractedSegments, skipSelectors)

					// 12. Collect translations for deferred write
					if (newSegments.length > 0 && newTranslations.length > 0) {
						deferredWrites.translations = newSegments.map((seg, i) => ({
							original: seg.value,
							translated: newTranslations[i],
						}))

						// Collect new segment hashes for path-segment linking
						deferredWrites.newSegmentHashes = newSegments.map((s) => hashText(s.value))
					}

					// 13. Update current page pathname if it was translated
					if (translationConfig.translatePath && pathnameSegment && translatedPathname !== originalPathname) {
						const { normalized: normalizedTranslated } = normalizePathname(translatedPathname)
						// Update the current path entry with the translated version
						deferredWrites.pathnames[0] = {
							original: deferredWrites.currentPath,
							translated: normalizedTranslated,
						}
					}

					// 14. Rewrite links
					rewriteLinks(
						document,
						originHostname,
						host,
						originalPathname,
						translatedPathname,
						translationConfig.translatePath || false,
						pathnameMap
					)

					// 15a. Add lang attribute and hreflang links for SEO
					try {
						addLangMetadata(document, targetLang, sourceLang, host, originHostname, originalPathname, url)
					} catch (langError) {
						console.error('[Lang Metadata] Failed:', langError)
						// Non-blocking - continue serving response
					}

					// 15b. Collect link pathnames for deferred write
					if (translationConfig.translatePath && pathnameSegments.length > 0) {
						const linkUpdates = pathnameSegments.map((seg, i) => ({
							original: seg.value,
							translated: pathnameTranslations[i],
						}))
						deferredWrites.pathnames.push(...linkUpdates)
					}

					// 16. Inject recovery assets for SPA frameworks (Next.js, Nuxt, etc.)
					// These frameworks may revert server-translated content during hydration
					if (detectSpaFramework(document)) {
						const dictionary = buildTranslationDictionary(
							document,
							extractedSegments,
							originalValues,
							skipSelectors,
							targetLang
						)

						// Only inject if dictionary has entries (avoid empty overhead)
						const hasEntries =
							Object.keys(dictionary.text).length > 0 ||
							Object.keys(dictionary.html).length > 0 ||
							Object.keys(dictionary.attrs).length > 0

						if (hasEntries) {
							markSkippedElements(document, skipSelectors)
							injectRecoveryAssets(document, dictionary)
						}
					}
				} catch (translationError) {
					// Translation failed - return original HTML with debug header
					console.error('Translation error, returning original HTML:', translationError)

					res.status(fetchResult.statusCode)
						.set('Content-Type', 'text/html; charset=utf-8')
						.set('X-Error', 'Translation failed')
						.send(fetchResult.html)
					return
				}
			}

			// Serialize final HTML
			html = document.toString()

			// Calculate total pipeline time and log compact summary
			const totalTime = Date.now() - fetchStart
			const urlObj = new URL(fetchUrl)
			const transInfo = batchCount > 0 ? `trans: ${batchCount} (${translateTime}ms)` : 'trans: 0'
			console.log(
				`▶ [${targetLang}] ${urlObj.host}${urlObj.pathname} (${totalTime}ms) | fetch: ${fetchTime}ms | ${transInfo} | seg: ${extractedSegments.length} (+${newTranslations.length}) | paths: ${totalPaths} (+${newPaths})`
			)

			// Execute deferred DB writes after response is sent
			res.on('finish', () => {
				executeDeferredWrites(deferredWrites)
			})

			// Send response with cache control and security headers
			const htmlHeaders = prepareResponseHeaders(fetchResult.headers)
			htmlHeaders['Content-Type'] = 'text/html; charset=utf-8'
			htmlHeaders['Cache-Control'] = getCacheControl({
				originHeaders: fetchResult.headers,
				cacheDisabledUntil: translationConfig.cacheDisabledUntil,
				applyMinimumCache: false,
			})
			res.status(fetchResult.statusCode).set(htmlHeaders).send(html)
		} catch (fetchError) {
			console.error('Fetch/parse error:', fetchError)
			res.status(502)
				.set('Content-Type', 'text/plain')
				// .set('X-Error', 'Failed to fetch or parse page')
				.send('Fetch/parse failed')
		}
	} catch (error) {
		console.error('Unexpected error:', error)
		res.status(500).set('Content-Type', 'text/plain').send('Internal Server Error')
	}
}
