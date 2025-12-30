/**
 * Fetch module type definitions
 */

/**
 * Result from fetching HTML
 */
export interface FetchResult {
	html: string
	finalUrl: string
	statusCode: number
	headers: Headers
}

/**
 * Parsed HTML document from linkedom
 */
export interface ParsedDocument {
	document: Document
	window: any // linkedom's window-like object
}
