/**
 * Translation Proxy Server
 * Main request handler
 * Orchestrates: cache → fetch → parse → extract → translate → apply → rewrite → return
 */

import type { Request, Response } from 'express'
import type { PatternizedText, Content } from './types'
import { parseHTMLDocument } from './fetch/dom-parser'
import { extractSegments, extractLinkPathnames } from './fetch/dom-extractor'
import { applyTranslations } from './fetch/dom-applicator'
import { rewriteLinks } from './fetch/dom-rewriter'
import { addLangMetadata } from './fetch/dom-metadata'
import { translateSegments } from './translation/translate-segments'
import { applyPatterns, restorePatterns } from './translation/skip-patterns'
import {
	shouldSkipPath,
	normalizePathname,
	translatePathnamesBatch,
} from './translation/translate-pathnames'
import { isStaticAsset } from './utils'
import {
	getHostConfig,
	lookupPathname,
	batchLookupPathnames,
	batchGetTranslations,
	batchUpsertTranslations,
	batchUpsertPathnames,
	type TranslationItem,
	type PathnameMapping,
} from './db'

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

// Environment variables
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ''
const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID || ''

/**
 * Main request handler for Express
 */
export async function handleRequest(req: Request, res: Response): Promise<void> {
	const protocol = req.protocol || 'http'
	const host = req.get('host') || ''
	const url = new URL(req.originalUrl, `${protocol}://${host}`)

	try {
		// 1. Parse request and determine target language from database
		const hostConfig = await getHostConfig(host.startsWith('localhost') ? host.split(':')[0] : host)

		if (!hostConfig) {
			res.status(404).set('Content-Type', 'text/plain').send('Not Found')
			return
		}

		const targetLang = hostConfig.targetLang

		// Extract per-domain origin configuration
		const originBase = hostConfig.origin
		const originHostname = hostConfig.originDomain
		const sourceLang = hostConfig.sourceLang

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

			// Proxy static asset with cache headers if configured
			const responseHeaders: Record<string, string> = {}
			// Headers to skip - encoding headers must be excluded because Node's fetch
			// automatically decompresses content, but includes original encoding headers
			const skipHeaders = ['content-encoding', 'transfer-encoding', 'content-length']
			originResponse.headers.forEach((value, key) => {
				if (!skipHeaders.includes(key.toLowerCase())) {
					responseHeaders[key] = value
				}
			})
			if (hostConfig.proxiedCache && hostConfig.proxiedCache > 0) {
				const maxAgeSeconds = hostConfig.proxiedCache * 60
				responseHeaders['Cache-Control'] = `public, max-age=${maxAgeSeconds}`
			}

			const body = Buffer.from(await originResponse.arrayBuffer())
			res.status(originResponse.status).set(responseHeaders).send(body)
			return
		}

		// STAGE 1: Early pathname lookup for reverse URL resolution
		const pathnameResult = await lookupPathname(hostConfig.hostId, incomingPathname)
		if (pathnameResult) {
			// If we found a match and the incoming path matches the translated path,
			// use the original path for fetching
			if (pathnameResult.translatedPath === incomingPathname) {
				originalPathname = pathnameResult.originalPath
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
				// Proxy non-HTML resources with optional edge caching

				// Clone origin headers, excluding encoding headers (Node's fetch auto-decompresses)
				const proxyHeaders: Record<string, string> = {}
				const skipProxyHeaders = ['content-encoding', 'transfer-encoding', 'content-length']
				originResponse.headers.forEach((value, key) => {
					if (!skipProxyHeaders.includes(key.toLowerCase())) {
						proxyHeaders[key] = value
					}
				})

				// Add Cache-Control header if proxiedCache is configured
				const truncatedUrl = fetchUrl.length > 50 ? fetchUrl.substring(0, 50) + '...' : fetchUrl
				if (hostConfig.proxiedCache && hostConfig.proxiedCache > 0) {
					const maxAgeSeconds = hostConfig.proxiedCache * 60
					proxyHeaders['Cache-Control'] = `public, max-age=${maxAgeSeconds}`

					if (proxyLogging) {
						console.log(
							`▶ [${targetLang}] ${truncatedUrl} - Proxying with cache: ${contentType} (${hostConfig.proxiedCache}m)`
						)
					}
				} else {
					if (proxyLogging) console.log(`▶ [${targetLang}] ${truncatedUrl} - Proxying: ${contentType}`)
				}

				const body = Buffer.from(await originResponse.arrayBuffer())
				res.status(originResponse.status).set(proxyHeaders).send(body)
				return
			}

			// Initialize pathname updates accumulator for batch write at end
			const pathnameUpdates: PathnameMapping[] = []

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
			const extractStart = Date.now()
			const extractedSegments = extractSegments(document)
			const extractTime = Date.now() - extractStart
			const parseTime = Date.now() - parseStart - extractTime
			const fetchTime = parseStart - fetchStart

			let cachedHits = 0
			let cacheMisses = 0
			let newTranslations: string[] = []
			let uniqueCount = 0
			let batchCount = 0
			let translateTime = 0
			let appliedCount = 0
			let applyTime = 0
			let rewrittenCount = 0
			let rewriteTime = 0
			let storedCount = 0

			if (extractedSegments.length > 0) {
				// 6. Apply patterns to normalize text for caching
				let patternData: PatternizedText[] = []
				let normalizedSegments = extractedSegments

				if (hostConfig.skipPatterns && hostConfig.skipPatterns.length > 0) {
					patternData = extractedSegments.map((seg) => applyPatterns(seg.value, hostConfig.skipPatterns!))
					// Replace segment values with normalized versions
					normalizedSegments = extractedSegments.map((seg, i) => ({
						...seg,
						value: patternData[i].normalized,
					}))
				} else {
					// No patterns - create pass-through pattern data
					patternData = extractedSegments.map((seg) => ({
						original: seg.value,
						normalized: seg.value,
						replacements: [],
					}))
				}

				// 7. Batch lookup translations from database
				const segmentTexts = normalizedSegments.map((s) => s.value)
				const cachedTranslations = await batchGetTranslations(hostConfig.hostId, segmentTexts)

				// Match segments with cache
				const { cached, newSegments, newIndices } = matchSegmentsWithMap(normalizedSegments, cachedTranslations)

				cachedHits = cached.size
				cacheMisses = newSegments.length

				// 8. Extract link pathnames early (before translation) for parallel processing
				const linkPathnames = hostConfig.translatePath ? extractLinkPathnames(document, originHostname) : new Set<string>()

				// 9. Translate segments and pathnames in parallel for maximum performance
				const translateStart = Date.now()

				// Create promises for parallel execution
				const segmentPromise =
					newSegments.length > 0
						? translateSegments(newSegments, sourceLang, targetLang, GOOGLE_PROJECT_ID, OPENROUTER_API_KEY, hostConfig.skipWords)
						: Promise.resolve({ translations: [], uniqueCount: 0, batchCount: 0 })

				// Pathname translation: batch current + links together for efficiency
				const pathnamePromise = async () => {
					let translatedPathname = originalPathname
					let pathnameSegment = null
					let pathnameMap: Map<string, string> | undefined
					let pathnameSegments: Content[] = []
					let pathnameTranslations: string[] = []

					if (!hostConfig.translatePath) {
						return {
							translatedPathname,
							pathnameSegment,
							pathnameMap,
							pathnameSegments,
							pathnameTranslations,
						}
					}

					try {
						// Add current pathname to link pathnames for batching
						const allPathnames = new Set(linkPathnames)
						if (!shouldSkipPath(originalPathname, hostConfig.skipPath)) {
							allPathnames.add(originalPathname)
						}

						if (allPathnames.size === 0) {
							return {
								translatedPathname,
								pathnameSegment,
								pathnameMap,
								pathnameSegments,
								pathnameTranslations,
							}
						}

						// Lookup existing pathname translations from database
						const existingPathnames = await batchLookupPathnames(hostConfig.hostId, Array.from(allPathnames))

						// Build a PathnameMapping-like structure for translatePathnamesBatch
						const pathnameMapping = existingPathnames.size > 0 ? {
							origin: Object.fromEntries(existingPathnames),
							translated: Object.fromEntries(Array.from(existingPathnames.entries()).map(([k, v]) => [v, k])),
						} : null

						// Translate all pathnames in one batch
						const batchResult = await translatePathnamesBatch(
							allPathnames,
							originalPathname,
							originalPathname, // Dummy value, will be replaced
							targetLang,
							pathnameMapping,
							async (segments: Content[]) => {
								const result = await translateSegments(
									segments,
									sourceLang,
									targetLang,
									GOOGLE_PROJECT_ID,
									OPENROUTER_API_KEY,
									hostConfig.skipWords
								)
								return result.translations
							},
							hostConfig.skipPath
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
					}
				}

				// Execute translations in parallel
				try {
					const [segmentResult, pathnameResult] = await Promise.all([segmentPromise, pathnamePromise()])

					// Extract segment translation results
					newTranslations = segmentResult.translations
					uniqueCount = segmentResult.uniqueCount
					batchCount = segmentResult.batchCount
					translateTime = Date.now() - translateStart

					// Extract pathname translation results
					const translatedPathname = pathnameResult.translatedPathname
					const pathnameSegment = pathnameResult.pathnameSegment
					const pathnameMap = pathnameResult.pathnameMap
					const pathnameSegments = pathnameResult.pathnameSegments
					const pathnameTranslations = pathnameResult.pathnameTranslations

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
						return restorePatterns(
							translation,
							patternData[i]?.replacements ?? [],
							patternData[i]?.isUpperCase
						)
					})

					// 11. Apply translations to DOM
					const applyStart = Date.now()
					appliedCount = applyTranslations(document, restoredTranslations, extractedSegments)
					applyTime = Date.now() - applyStart

					// 12. Update database with new translations
					storedCount = 0
					if (newSegments.length > 0 && newTranslations.length > 0) {
						const translationItems: TranslationItem[] = newSegments.map((seg, i) => ({
							original: seg.value,
							translated: newTranslations[i],
							kind: seg.kind as 'text' | 'attr' | 'path',
						}))

						// Add pathname translation if we have one
						if (pathnameSegment && translatedPathname !== originalPathname) {
							translationItems.push({
								original: pathnameSegment.value,
								translated: translatedPathname,
								kind: 'path',
							})
						}

						storedCount = await batchUpsertTranslations(hostConfig.hostId, translationItems)
					}

					// 13. Add current page pathname to batch (accumulate instead of immediate write)
					if (hostConfig.translatePath && pathnameSegment && translatedPathname !== originalPathname) {
						const { normalized: normalizedOriginal } = normalizePathname(originalPathname)
						const { normalized: normalizedTranslated } = normalizePathname(translatedPathname)

						pathnameUpdates.push({
							original: normalizedOriginal,
							translated: normalizedTranslated,
						})
					}

					// 14. Rewrite links
					const rewriteStart = Date.now()
					rewrittenCount = rewriteLinks(
						document,
						originHostname,
						host,
						originalPathname,
						translatedPathname,
						hostConfig.translatePath || false,
						pathnameMap
					)
					rewriteTime = Date.now() - rewriteStart

					// 15a. Add lang attribute and hreflang links for SEO
					try {
						const langResult = addLangMetadata(
							document,
							targetLang,
							sourceLang,
							host,
							originHostname,
							originalPathname,
							url
						)

						if (
							langResult.langUpdated ||
							langResult.hreflangAdded > 0 ||
							langResult.hreflangReplaced > 0 ||
							langResult.hreflangReformatted > 0
						) {
							console.log(
								`  Lang Metadata: lang=${langResult.langUpdated ? 'updated' : 'ok'}, hreflang +${langResult.hreflangAdded} ~${langResult.hreflangReplaced} fmt=${langResult.hreflangReformatted}`
							)
						}
					} catch (langError) {
						console.error('[Lang Metadata] Failed:', langError)
						// Non-blocking - continue serving response
					}

					// 15b. Add link pathnames to batch (accumulate instead of loop writes)
					if (hostConfig.translatePath && pathnameSegments.length > 0) {
						const linkUpdates = pathnameSegments.map((seg, i) => ({
							original: seg.value,
							translated: pathnameTranslations[i],
						}))
						pathnameUpdates.push(...linkUpdates)
					}

					// 15c. Batch write all pathname updates (current page + links) in single operation
					if (pathnameUpdates.length > 0) {
						try {
							await batchUpsertPathnames(hostConfig.hostId, pathnameUpdates)
						} catch (error) {
							console.error('Pathname cache batch update failed:', error)
							// Non-blocking - continue serving response
						}
					}
				} catch (translationError) {
					// Translation failed - return original HTML with debug header
					console.error('Translation error, returning original HTML:', translationError)

					res.status(200)
						.set('Content-Type', 'text/html; charset=utf-8')
						.set('X-Error', 'Translation failed')
						.send(fetchResult.html)
					return
				}
			}

			// 14. Serialize final HTML
			const serializeStart = Date.now()
			html = document.toString()
			const serializeTime = Date.now() - serializeStart

			// Calculate total pipeline time
			const totalTime = Date.now() - fetchStart

			// Log consolidated pipeline summary
			const formatTime = (ms: number) => ms.toLocaleString('en-US')
			console.log(`▶ [${targetLang}] ${fetchUrl} (${formatTime(totalTime)}ms)`)

			// Log consolidated 5-line pipeline summary
			const cacheStatus =
				cachedHits === extractedSegments.length
					? `HIT (${cachedHits}/${extractedSegments.length})`
					: cachedHits > 0
					? `PARTIAL (${cachedHits}/${extractedSegments.length})`
					: 'MISS'
			const translateLine =
				newTranslations.length > 0
					? `Translate: ${extractedSegments.length}→${uniqueCount} unique, ${batchCount} batch, ${translateTime}ms | Cache: ${cacheStatus}`
					: `Translate: SKIPPED (all cached) | Cache: ${cacheStatus}`
			console.log(
				`  Fetch & Parse: ${fetchTime + parseTime}ms | Extract: ${
					extractedSegments.length
				} segments (${extractTime}ms)`
			)
			console.log(`  ${translateLine}`)
			console.log(
				`  Apply: ${appliedCount} translations (${applyTime}ms) | Rewrite: ${rewrittenCount} links (${rewriteTime}ms) | Serialize: ${serializeTime}ms`
			)
			if (storedCount > 0) {
				console.log(`  Cache Updated: ${originHostname}:${originalPathname} → ${storedCount} items stored`)
			}

			// Send response with cache statistics
			res.status(200)
				.set('Content-Type', 'text/html; charset=utf-8')
				.set('X-Segment-Cache-Hits', String(cachedHits))
				.set('X-Segment-Cache-Misses', String(cacheMisses))
				.send(html)
		} catch (fetchError) {
			console.error('Fetch/parse error:', fetchError)
			res.status(502)
				.set('Content-Type', 'text/plain')
				.set('X-Error', 'Failed to fetch or parse page')
				.send('Fetch/parse failed')
		}
	} catch (error) {
		console.error('Unexpected error:', error)
		res.status(500).set('Content-Type', 'text/plain').send('Internal Server Error')
	}
}
