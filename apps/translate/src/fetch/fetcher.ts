/**
 * Fetch module for retrieving HTML from origin
 * Handles header forwarding and redirect handling
 */

import type { FetchResult } from './types.js'

/**
 * Headers to forward from incoming request to origin
 */
const HEADERS_TO_FORWARD = ['user-agent', 'accept-language', 'accept-encoding', 'referer', 'cookie']

/**
 * Fetch HTML from origin URL with proper header forwarding
 * @param url - Origin URL to fetch
 * @param incomingRequest - Original incoming request (for header forwarding)
 * @returns FetchResult with html, finalUrl, statusCode, and headers
 */
export async function fetchHTML(url: string, incomingRequest: Request): Promise<FetchResult> {
	// Build headers to send to origin
	const fetchHeaders = new Headers()

	// Forward relevant headers from incoming request
	for (const headerName of HEADERS_TO_FORWARD) {
		const headerValue = incomingRequest.headers.get(headerName)
		if (headerValue) {
			fetchHeaders.set(headerName, headerValue)
		}
	}

	// Default User-Agent if not provided
	if (!fetchHeaders.has('user-agent')) {
		fetchHeaders.set('user-agent', 'Mozilla/5.0 (Translation Proxy) AppleWebKit/537.36')
	}

	try {
		// Fetch with automatic redirect following and 10-second timeout
		const response = await fetch(url, {
			method: incomingRequest.method,
			headers: fetchHeaders,
			redirect: 'follow',
			signal: AbortSignal.timeout(10_000),
		})

		// Check for successful response
		if (!response.ok && response.status !== 403) {
			// 403 is often acceptable (anti-bot might still serve HTML)
			throw new Error(`HTTP ${response.status} from origin`)
		}

		// Get content
		const content = await response.text()

		// Only validate non-empty for HTML responses
		const contentType = response.headers.get('content-type') || ''
		if (contentType.toLowerCase().includes('text/html')) {
			if (!content || content.trim().length === 0) {
				throw new Error('Empty response from origin')
			}
		}

		return {
			html: content,
			finalUrl: response.url,
			statusCode: response.status,
			headers: response.headers,
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		throw new Error(`Failed to fetch from origin: ${errorMessage}`)
	}
}
