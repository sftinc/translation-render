/**
 * DOM parser module for linkedom
 * Parses HTML string into linkedom Document object
 */

import { parseHTML } from 'linkedom'
import type { ParsedDocument } from './types.js'

/**
 * Parse HTML string into linkedom DOM Document
 * @param html - HTML string to parse
 * @returns ParsedDocument with document and window objects
 */
export function parseHTMLDocument(html: string): ParsedDocument {
	const { document, window } = parseHTML(html)

	return {
		document,
		window,
	}
}
