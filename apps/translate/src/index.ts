/**
 * Translation Proxy Server
 * Main request handler
 * Orchestrates: cache → fetch → parse → extract → translate → apply → rewrite → return
 */

import type { Request, Response } from 'express'
import type { PatternizedText, Content } from './types.js'
import { parseHTMLDocument } from './fetch/dom-parser.js'
import { extractSegments, extractLinkPathnames } from './fetch/dom-extractor.js'
import { applyTranslations } from './fetch/dom-applicator.js'
import { rewriteLinks } from './fetch/dom-rewriter.js'
import { addLangMetadata } from './fetch/dom-metadata.js'
import { translateSegments } from './translation/translate-segments.js'
import { applyPatterns, restorePatterns } from './translation/skip-patterns.js'
import {
	shouldSkipPath,
	normalizePathname,
	denormalizePathname,
	translatePathnamesBatch,
} from './translation/translate-pathnames.js'
import { isStaticAsset } from './utils.js'
import { prepareResponseHeaders } from './fetch/filter-headers.js'
import { renderMessagePage } from './utils/message-page.js'
import { getCacheControl, isDataFileExtension, isDataContentType } from './utils/cache-control.js'
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
	const { websiteId, lang, translations, pathnames, currentPath, newSegmentHashes, cachedSegmentHashes, cachedPaths, websitePathId, statusCode, llmUsage } =
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
			recordPageView(pathIds.websitePathId, lang)
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
interface MatchResult {
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
function matchSegmentsWithMap(segments: Content[], cache: Map<string, string>): MatchResult {
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

/**
 * Rewrite redirect Location header from origin domain to translated domain
 * @param location - Original Location header value
 * @param translatedHost - The translated domain host (e.g., 'de.example' or 'localhost:8787')
 * @param originBase - The origin domain base URL (e.g., 'https://www.example.com')
 * @param currentUrl - Current request URL object
 * @returns Rewritten Location URL pointing to translated domain
 */
function rewriteRedirectLocation(location: string, translatedHost: string, originBase: string, currentUrl: URL): string {
	try {
		// Parse the Location header
		const locationUrl = new URL(location, originBase)

		// Build the rewritten URL using the translated host
		const protocol = currentUrl.protocol // http: or https:
		const rewritten = `${protocol}//${translatedHost}${locationUrl.pathname}${locationUrl.search}${locationUrl.hash}`

		return rewritten
	} catch (error) {
		// If parsing fails, return the original location
		console.error('Failed to rewrite redirect location:', error)
		return location
	}
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
		if (isStaticAsset(incomingPathname)) {
			const fetchUrl = originBase + incomingPathname + url.search

			// Forward headers
			const fetchHeaders: Record<string, string> = {}
			const headersToForward = ['user-agent', 'accept-encoding', 'cookie', 'accept-language', 'referer']
			for (const headerName of headersToForward) {
				const headerValue = req.get(headerName)
				if (headerValue) fetchHeaders[headerName] = headerValue
			}
			if (!fetchHeaders['user-agent']) {
				fetchHeaders['user-agent'] = 'Mozilla/5.0 (Translation Proxy) AppleWebKit/537.36'
			}
			fetchHeaders['weglot-language'] = targetLang
			fetchHeaders['pantolingo-language'] = targetLang

			const originResponse = await fetch(fetchUrl, {
				method: req.method,
				headers: fetchHeaders,
				redirect: 'manual',
			})

			// Handle redirects for static assets
			if (originResponse.status >= 300 && originResponse.status < 400) {
				const location = originResponse.headers.get('location')
				if (location) {
					const redirectUrl = rewriteRedirectLocation(location, host, originBase, url)
					res.status(originResponse.status).set('Location', redirectUrl).send()
					return
				}
			}

			// Proxy static asset with filtered headers and security headers
			// Data files (.json, .xml) respect origin cache; other static assets get 5-min minimum
			const responseHeaders = prepareResponseHeaders(originResponse.headers)
			responseHeaders['Cache-Control'] = getCacheControl({
				originHeaders: originResponse.headers,
				cacheDisabledUntil: translationConfig.cacheDisabledUntil,
				applyMinimumCache: !isDataFileExtension(incomingPathname),
			})

			const body = Buffer.from(await originResponse.arrayBuffer())
			res.status(originResponse.status).set(responseHeaders).send(body)
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
			const isRedirect = originResponse.status >= 300 && originResponse.status < 400

			if (isRedirect) {
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

			// Check Content-Type - only translate HTML
			const contentType = originResponse.headers.get('content-type') || ''

			// Handle non-HTML content (proxy)
			if (!contentType.toLowerCase().includes('text/html')) {
				// Proxy non-HTML resources with filtered headers and security headers
				// Data content types (JSON, XML) respect origin cache; other types get 5-min minimum
				const proxyHeaders = prepareResponseHeaders(originResponse.headers)
				proxyHeaders['Cache-Control'] = getCacheControl({
					originHeaders: originResponse.headers,
					cacheDisabledUntil: translationConfig.cacheDisabledUntil,
					applyMinimumCache: !isDataContentType(contentType),
				})

				if (proxyLogging) {
					const truncatedUrl = fetchUrl.length > 50 ? fetchUrl.substring(0, 50) + '...' : fetchUrl
					console.log(`▶ [${targetLang}] ${truncatedUrl} - Proxying: ${contentType} (${proxyHeaders['Cache-Control']})`)
				}

				const body = Buffer.from(await originResponse.arrayBuffer())
				res.status(originResponse.status).set(proxyHeaders).send(body)
				return
			}

			// Initialize deferred writes - will be executed after response is sent
			const { normalized: normalizedCurrentPath } = normalizePathname(originalPathname)
			const deferredWrites: DeferredWrites = {
				websiteId: translationConfig.websiteId,
				lang: translationConfig.targetLang,
				translations: [],
				pathnames: [{ original: normalizedCurrentPath, translated: normalizedCurrentPath }], // Always include current path
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
			const extractedSegments = extractSegments(document)
			const fetchTime = parseStart - fetchStart

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

				// 8. Extract link pathnames early (before translation) for parallel processing
				// Skip path translation for error responses (4xx, 5xx)
				const isErrorResponse = fetchResult.statusCode >= 400
				const linkPathnames = translationConfig.translatePath && !isErrorResponse
					? extractLinkPathnames(document, originHostname)
					: new Set<string>()

				// 9. Translate segments and pathnames in parallel for maximum performance
				const translateStart = Date.now()

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
								'balanced' // TODO: Use translationConfig.style after DB migration
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
									'balanced'
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
					applyTranslations(document, restoredTranslations, extractedSegments)

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
