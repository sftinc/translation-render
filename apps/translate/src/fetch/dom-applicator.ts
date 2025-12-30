/**
 * DOM application module for linkedom
 * Applies translations back to DOM using identical traversal order as extraction
 */

import { SKIP_SELECTORS, SKIP_TAGS, TRANSLATE_ATTRS } from '../config.js'
import type { Content } from '../types.js'

/**
 * Check if a node should be skipped during traversal
 * MUST BE IDENTICAL to dom-extractor's shouldSkipNode
 * @param node - DOM node to check
 * @returns true if node or any ancestor should be skipped
 */
function shouldSkipNode(node: Node): boolean {
	let current: Node | null = node

	while (current) {
		if (current.nodeType === 1) {
			// Node.ELEMENT_NODE
			const elem = current as Element

			for (const selector of SKIP_SELECTORS) {
				try {
					if (elem.matches(selector)) {
						return true
					}
				} catch (e) {
					// Invalid selector, continue
				}
			}

			if (SKIP_TAGS.has(elem.tagName.toLowerCase())) {
				return true
			}
		}

		current = current.parentNode
	}

	return false
}

/**
 * Apply translations to text nodes using recursive traversal
 * MUST use identical traversal order as extractTextNodes in dom-extractor
 * @param node - Current node in traversal
 * @param translations - Translation strings array
 * @param segments - Original extracted segments with whitespace metadata
 * @param indexRef - Object containing mutable index (passed by reference)
 */
function applyToTextNodes(
	node: Node,
	translations: string[],
	segments: Content[],
	indexRef: { index: number }
): void {
	if (shouldSkipNode(node)) {
		return
	}

	if (node.nodeType === 3) {
		// Text node
		const text = (node as Text).data
		if (text && text.trim().length > 0) {
			if (indexRef.index < translations.length) {
				const translation = translations[indexRef.index]
				const segment = segments[indexRef.index]

				// Restore whitespace if metadata exists
				const final = segment?.ws ? segment.ws.leading + translation + segment.ws.trailing : translation

				;(node as Text).data = final
				indexRef.index++
			}
		}
		return
	}

	// Recurse through children in order
	const children = node.childNodes
	for (let i = 0; i < children.length; i++) {
		applyToTextNodes(children[i], translations, segments, indexRef)
	}
}

/**
 * Apply translations to attributes using querySelectorAll
 * MUST use identical order as extractAttributes in dom-extractor
 * @param document - linkedom Document object
 * @param translations - Translation strings array
 * @param segments - Original extracted segments with whitespace metadata
 * @param indexRef - Object containing mutable index (passed by reference)
 */
function applyToAttributes(
	document: Document,
	translations: string[],
	segments: Content[],
	indexRef: { index: number }
): void {
	const allElements = document.querySelectorAll('*')

	for (let i = 0; i < allElements.length; i++) {
		const elem = allElements[i] as Element

		if (shouldSkipNode(elem)) {
			continue
		}

		for (const attr of TRANSLATE_ATTRS) {
			const value = elem.getAttribute(attr)
			if (value && value.trim().length > 0) {
				if (indexRef.index < translations.length) {
					const translation = translations[indexRef.index]
					const segment = segments[indexRef.index]

					// Restore whitespace if metadata exists
					const final = segment?.ws ? segment.ws.leading + translation + segment.ws.trailing : translation

					elem.setAttribute(attr, final)
					indexRef.index++
				}
			}
		}
	}
}

/**
 * Apply translation to <title> element
 * MUST be first in application order, matching extraction order
 * @param document - linkedom Document object
 * @param translations - Translation strings array
 * @param segments - Original extracted segments with whitespace metadata
 * @param indexRef - Object containing mutable index (passed by reference)
 */
function applyHeadTitle(
	document: Document,
	translations: string[],
	segments: Content[],
	indexRef: { index: number }
): void {
	const titleElement = document.querySelector('title')
	// Skip if element should be skipped
	if (!titleElement || shouldSkipNode(titleElement)) {
		return
	}
	if (titleElement.textContent && titleElement.textContent.trim().length > 0) {
		if (indexRef.index < translations.length) {
			const translation = translations[indexRef.index]
			const segment = segments[indexRef.index]

			// Restore whitespace if metadata exists
			const final = segment?.ws ? segment.ws.leading + translation + segment.ws.trailing : translation

			titleElement.textContent = final
			indexRef.index++
		}
	}
}

/**
 * Apply translation to <meta name="description"> content attribute
 * MUST be second in application order, matching extraction order
 * @param document - linkedom Document object
 * @param translations - Translation strings array
 * @param segments - Original extracted segments with whitespace metadata
 * @param indexRef - Object containing mutable index (passed by reference)
 */
function applyHeadDescription(
	document: Document,
	translations: string[],
	segments: Content[],
	indexRef: { index: number }
): void {
	const descElement = document.querySelector('meta[name="description"]')
	// Skip if element should be skipped
	if (!descElement || shouldSkipNode(descElement)) {
		return
	}
	const content = descElement.getAttribute('content')
	if (content && content.trim().length > 0) {
		if (indexRef.index < translations.length) {
			const translation = translations[indexRef.index]
			const segment = segments[indexRef.index]

			// Restore whitespace if metadata exists
			const final = segment?.ws ? segment.ws.leading + translation + segment.ws.trailing : translation

			descElement.setAttribute('content', final)
			indexRef.index++
		}
	}
}

/**
 * Apply translations to linkedom DOM
 * Uses identical traversal order as extraction to ensure correct mapping
 * @param document - linkedom Document object
 * @param translations - Array of translated strings (parallel to extracted segments)
 * @param segments - Original extracted segments with whitespace metadata
 * @returns Number of translations applied
 */
export function applyTranslations(document: Document, translations: string[], segments: Content[]): number {
	// Use object to maintain index reference across function calls
	const indexRef = { index: 0 }

	// Apply to head metadata first (must be identical order as extraction)
	applyHeadTitle(document, translations, segments, indexRef)
	applyHeadDescription(document, translations, segments, indexRef)

	// Apply to text nodes (must be identical order as extraction)
	if (document.body) {
		applyToTextNodes(document.body, translations, segments, indexRef)
	}

	// Apply to attributes (must be identical order as extraction)
	applyToAttributes(document, translations, segments, indexRef)

	return indexRef.index
}
