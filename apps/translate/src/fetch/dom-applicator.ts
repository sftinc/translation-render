/**
 * DOM application module for linkedom
 * Applies translations back to DOM using identical traversal order as extraction
 * Supports grouped HTML segments with placeholder restoration
 */

import { TRANSLATE_ATTRS } from '../config.js'
import type { Content } from '../types.js'
import { placeholdersToHtml } from './dom-placeholders.js'
import { shouldSkipNode, isInsideGroupedElement } from './dom-utils.js'

/**
 * Apply translations to grouped HTML segments
 * Uses element references from htmlMeta to set innerHTML directly
 * @param translations - Translation strings array
 * @param segments - Original extracted segments with HTML metadata
 * @param indexRef - Object containing mutable index (passed by reference)
 * @param groupedElements - Set to populate with grouped elements
 */
function applyToGroupedBlocks(
	translations: string[],
	segments: Content[],
	indexRef: { index: number },
	groupedElements: Set<Element>
): void {
	// Process all 'html' kind segments in order
	while (indexRef.index < segments.length && segments[indexRef.index].kind === 'html') {
		const segment = segments[indexRef.index]
		const translation = translations[indexRef.index]

		if (segment.htmlMeta) {
			// Restore HTML tags from placeholders
			const restoredHtml = placeholdersToHtml(translation, segment.htmlMeta.replacements)

			// Apply with whitespace restoration
			const final = segment.ws ? segment.ws.leading + restoredHtml + segment.ws.trailing : restoredHtml

			// Set innerHTML on the element
			segment.htmlMeta.element.innerHTML = final

			// Track grouped element so text node application skips it
			groupedElements.add(segment.htmlMeta.element)
		}

		indexRef.index++
	}
}

/**
 * Apply translations to text nodes using recursive traversal
 * MUST use identical traversal order as extractTextNodes in dom-extractor
 * @param node - Current node in traversal
 * @param translations - Translation strings array
 * @param segments - Original extracted segments with whitespace metadata
 * @param indexRef - Object containing mutable index (passed by reference)
 * @param groupedElements - Set of elements that were grouped (to skip)
 */
function applyToTextNodes(
	node: Node,
	translations: string[],
	segments: Content[],
	indexRef: { index: number },
	groupedElements: Set<Element>
): void {
	if (shouldSkipNode(node)) {
		return
	}

	// Skip if inside a grouped element (already applied as HTML segment)
	if (isInsideGroupedElement(node, groupedElements)) {
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
		applyToTextNodes(children[i], translations, segments, indexRef, groupedElements)
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
 * Supports grouped HTML segments with placeholder restoration
 * @param document - linkedom Document object
 * @param translations - Array of translated strings (parallel to extracted segments)
 * @param segments - Original extracted segments with whitespace metadata
 * @returns Number of translations applied
 */
export function applyTranslations(document: Document, translations: string[], segments: Content[]): number {
	// Use object to maintain index reference across function calls
	const indexRef = { index: 0 }

	// Track grouped elements to skip during text node application
	const groupedElements = new Set<Element>()

	// Apply to head metadata first (must be identical order as extraction)
	applyHeadTitle(document, translations, segments, indexRef)
	applyHeadDescription(document, translations, segments, indexRef)

	// Apply to grouped HTML blocks (must be before text nodes, matching extraction order)
	applyToGroupedBlocks(translations, segments, indexRef, groupedElements)

	// Apply to remaining text nodes (skipping grouped elements)
	if (document.body) {
		applyToTextNodes(document.body, translations, segments, indexRef, groupedElements)
	}

	// Apply to attributes (must be identical order as extraction)
	applyToAttributes(document, translations, segments, indexRef)

	return indexRef.index
}
