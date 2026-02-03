/**
 * DOM application module for linkedom
 * Applies translations back to DOM using identical traversal order as extraction
 * Supports grouped HTML segments with placeholder restoration
 * Supports deferred mode: marks cache misses (null translations) as pending
 */

import { TRANSLATE_ATTRS } from '../config.js'
import type { Content } from '../types.js'
import { placeholdersToHtml } from './placeholders.js'
import { shouldSkipNode, isInsideGroupedElement } from './utils.js'

/**
 * Information about a pending segment (cache miss) for client-side polling
 */
export interface PendingSegment {
	hash: string
	kind: 'html' | 'text' | 'attr'
	content: string // Raw content (innerHTML for html, text for text, value for attr)
	attr?: string
	showSkeleton: boolean
}

/**
 * Result from applyTranslations in deferred mode
 */
export interface ApplyTranslationsResult {
	applied: number
	pending: PendingSegment[]
}

/**
 * Check if a text node is the sole child of its parent (for skeleton application)
 */
function isSoleChild(node: Node): boolean {
	const parent = node.parentNode
	if (!parent) return false

	// Check if there are any other text nodes or element children with content
	const children = parent.childNodes
	let contentChildCount = 0

	for (let i = 0; i < children.length; i++) {
		const child = children[i]
		if (child === node) {
			contentChildCount++
		} else if (child.nodeType === 1) {
			// Element node
			contentChildCount++
		} else if (child.nodeType === 3) {
			// Text node - check if it has content
			const text = (child as Text).data
			if (text.trim().length > 0) {
				contentChildCount++
			}
		}
	}

	return contentChildCount === 1
}

/**
 * Apply translations to grouped HTML segments
 * Uses element references from htmlMeta to set innerHTML directly
 * In deferred mode, marks pending segments with skeleton class
 * @param translations - Translation strings array (null for cache miss)
 * @param segments - Original extracted segments with HTML metadata
 * @param indexRef - Object containing mutable index (passed by reference)
 * @param groupedElements - Set to populate with grouped elements
 * @param hashes - Hash array (only provided in deferred mode)
 * @param pending - Pending segments array to populate
 */
function applyToGroupedBlocks(
	translations: (string | null)[],
	segments: Content[],
	indexRef: { index: number },
	groupedElements: Set<Element>,
	hashes?: string[],
	pending?: PendingSegment[]
): void {
	// Process all 'html' kind segments in order
	while (indexRef.index < segments.length && segments[indexRef.index].kind === 'html') {
		const segment = segments[indexRef.index]
		const translation = translations[indexRef.index]
		const hash = hashes?.[indexRef.index]

		if (segment.htmlMeta) {
			if (translation === null && hash && pending) {
				// Deferred mode: cache miss - mark as pending with skeleton
				const elem = segment.htmlMeta.element

				elem.classList.add('pantolingo-skeleton')
				elem.setAttribute('data-pantolingo-pending', hash)

				pending.push({
					hash,
					kind: 'html',
					content: segment.htmlMeta.originalInnerHTML,
					showSkeleton: true,
				})

				// Track grouped element so text node application skips it
				groupedElements.add(elem)
			} else if (translation !== null) {
				// Normal mode or cache hit: apply translation
				const restoredHtml = placeholdersToHtml(translation, segment.htmlMeta.replacements)

				// Apply with whitespace restoration
				const final = segment.ws ? segment.ws.leading + restoredHtml + segment.ws.trailing : restoredHtml

				// Set innerHTML on the element
				segment.htmlMeta.element.innerHTML = final

				// Track grouped element so text node application skips it
				groupedElements.add(segment.htmlMeta.element)
			}
		}

		indexRef.index++
	}
}

/**
 * Apply translations to text nodes using recursive traversal
 * MUST use identical traversal order as extractTextNodes in dom-extractor
 * In deferred mode, marks pending segments with comment markers or skeleton
 * @param node - Current node in traversal
 * @param translations - Translation strings array (null for cache miss)
 * @param segments - Original extracted segments with whitespace metadata
 * @param indexRef - Object containing mutable index (passed by reference)
 * @param groupedElements - Set of elements that were grouped (to skip)
 * @param skipSelectors - CSS selectors for elements to skip
 * @param hashes - Hash array (only provided in deferred mode)
 * @param pending - Pending segments array to populate
 * @param document - Document for creating comment nodes
 */
function applyToTextNodes(
	node: Node,
	translations: (string | null)[],
	segments: Content[],
	indexRef: { index: number },
	groupedElements: Set<Element>,
	skipSelectors: string[],
	hashes?: string[],
	pending?: PendingSegment[],
	document?: Document
): void {
	if (shouldSkipNode(node, skipSelectors)) {
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
				const hash = hashes?.[indexRef.index]

				if (translation === null && hash && pending && document) {
					// Deferred mode: cache miss - mark as pending
					const isSole = isSoleChild(node)

					if (isSole && node.parentElement) {
						// Sole child: add skeleton to parent
						node.parentElement.classList.add('pantolingo-skeleton')
						node.parentElement.setAttribute('data-pantolingo-pending', hash)
					}

					// Always insert comment marker for text node replacement
					const comment = document.createComment(`pantolingo:${hash}`)
					node.parentNode?.insertBefore(comment, node)

					pending.push({
						hash,
						kind: 'text',
						content: (node as Text).data.trim(),
						showSkeleton: isSole,
					})
				} else if (translation !== null) {
					// Normal mode or cache hit: apply translation
					const final = segment?.ws ? segment.ws.leading + translation + segment.ws.trailing : translation
					;(node as Text).data = final
				}

				indexRef.index++
			}
		}
		return
	}

	// Recurse through children in order
	const children = node.childNodes
	for (let i = 0; i < children.length; i++) {
		applyToTextNodes(children[i], translations, segments, indexRef, groupedElements, skipSelectors, hashes, pending, document)
	}
}

/**
 * Apply translations to attributes using querySelectorAll
 * MUST use identical order as extractAttributes in dom-extractor
 * In deferred mode, marks pending attributes (no skeleton possible for attrs)
 * @param document - linkedom Document object
 * @param translations - Translation strings array (null for cache miss)
 * @param segments - Original extracted segments with whitespace metadata
 * @param indexRef - Object containing mutable index (passed by reference)
 * @param skipSelectors - CSS selectors for elements to skip
 * @param hashes - Hash array (only provided in deferred mode)
 * @param pending - Pending segments array to populate
 */
function applyToAttributes(
	document: Document,
	translations: (string | null)[],
	segments: Content[],
	indexRef: { index: number },
	skipSelectors: string[],
	hashes?: string[],
	pending?: PendingSegment[]
): void {
	const allElements = document.querySelectorAll('*')

	for (let i = 0; i < allElements.length; i++) {
		const elem = allElements[i] as Element

		if (shouldSkipNode(elem, skipSelectors)) {
			continue
		}

		for (const attr of TRANSLATE_ATTRS) {
			const value = elem.getAttribute(attr)
			if (value && value.trim().length > 0) {
				if (indexRef.index < translations.length) {
					const translation = translations[indexRef.index]
					const segment = segments[indexRef.index]
					const hash = hashes?.[indexRef.index]

					if (translation === null && hash && pending) {
						// Deferred mode: cache miss - mark as pending
						// Attributes can't show skeleton, so just mark with data attribute
						elem.setAttribute('data-pantolingo-pending', hash)
						elem.setAttribute('data-pantolingo-attr', attr)

						pending.push({
							hash,
							kind: 'attr',
							content: value,
							attr,
							showSkeleton: false,
						})
					} else if (translation !== null) {
						// Normal mode or cache hit: apply translation
						const final = segment?.ws ? segment.ws.leading + translation + segment.ws.trailing : translation
						elem.setAttribute(attr, final)
					}

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
 * @param translations - Translation strings array (null for cache miss)
 * @param segments - Original extracted segments with whitespace metadata
 * @param indexRef - Object containing mutable index (passed by reference)
 * @param skipSelectors - CSS selectors for elements to skip
 * @param hashes - Hash array (only provided in deferred mode)
 * @param pending - Pending segments array to populate
 */
function applyHeadTitle(
	document: Document,
	translations: (string | null)[],
	segments: Content[],
	indexRef: { index: number },
	skipSelectors: string[],
	hashes?: string[],
	pending?: PendingSegment[]
): void {
	const titleElement = document.querySelector('title')
	// Skip if element should be skipped
	if (!titleElement || shouldSkipNode(titleElement, skipSelectors)) {
		return
	}
	if (titleElement.textContent && titleElement.textContent.trim().length > 0) {
		if (indexRef.index < translations.length) {
			const translation = translations[indexRef.index]
			const segment = segments[indexRef.index]
			const hash = hashes?.[indexRef.index]

			if (translation === null && hash && pending) {
				// Deferred mode: cache miss - mark as pending
				// Title can't show skeleton visually, treat like attr
				titleElement.setAttribute('data-pantolingo-pending', hash)

				pending.push({
					hash,
					kind: 'text',
					content: titleElement.textContent!.trim(),
					showSkeleton: false,
				})
			} else if (translation !== null) {
				// Normal mode or cache hit: apply translation
				const final = segment?.ws ? segment.ws.leading + translation + segment.ws.trailing : translation
				titleElement.textContent = final
			}

			indexRef.index++
		}
	}
}

/**
 * Apply translation to <meta name="description"> content attribute
 * MUST be second in application order, matching extraction order
 * @param document - linkedom Document object
 * @param translations - Translation strings array (null for cache miss)
 * @param segments - Original extracted segments with whitespace metadata
 * @param indexRef - Object containing mutable index (passed by reference)
 * @param skipSelectors - CSS selectors for elements to skip
 * @param hashes - Hash array (only provided in deferred mode)
 * @param pending - Pending segments array to populate
 */
function applyHeadDescription(
	document: Document,
	translations: (string | null)[],
	segments: Content[],
	indexRef: { index: number },
	skipSelectors: string[],
	hashes?: string[],
	pending?: PendingSegment[]
): void {
	const descElement = document.querySelector('meta[name="description"]')
	// Skip if element should be skipped
	if (!descElement || shouldSkipNode(descElement, skipSelectors)) {
		return
	}
	const content = descElement.getAttribute('content')
	if (content && content.trim().length > 0) {
		if (indexRef.index < translations.length) {
			const translation = translations[indexRef.index]
			const segment = segments[indexRef.index]
			const hash = hashes?.[indexRef.index]

			if (translation === null && hash && pending) {
				// Deferred mode: cache miss - mark as pending
				descElement.setAttribute('data-pantolingo-pending', hash)
				descElement.setAttribute('data-pantolingo-attr', 'content')

				pending.push({
					hash,
					kind: 'attr',
					content,
					attr: 'content',
					showSkeleton: false,
				})
			} else if (translation !== null) {
				// Normal mode or cache hit: apply translation
				const final = segment?.ws ? segment.ws.leading + translation + segment.ws.trailing : translation
				descElement.setAttribute('content', final)
			}

			indexRef.index++
		}
	}
}

/**
 * Apply translations to linkedom DOM
 * Uses identical traversal order as extraction to ensure correct mapping
 * Supports grouped HTML segments with placeholder restoration
 *
 * In deferred mode (when hashes is provided):
 * - null translations are marked as pending in the DOM
 * - Pending segments get skeleton classes for visual feedback
 * - Returns list of pending segments for client polling
 *
 * @param document - linkedom Document object
 * @param translations - Array of translated strings (null for cache miss in deferred mode)
 * @param segments - Original extracted segments with whitespace metadata
 * @param skipSelectors - CSS selectors for elements to skip
 * @param hashes - Optional array of hashes for deferred mode
 * @returns Number of translations applied (legacy), or ApplyTranslationsResult in deferred mode
 */
export function applyTranslations(
	document: Document,
	translations: (string | null)[],
	segments: Content[],
	skipSelectors: string[],
	hashes?: string[]
): number | ApplyTranslationsResult {
	// Use object to maintain index reference across function calls
	const indexRef = { index: 0 }

	// Track grouped elements to skip during text node application
	const groupedElements = new Set<Element>()

	// Track pending segments in deferred mode
	const pending: PendingSegment[] = hashes ? [] : undefined as unknown as PendingSegment[]

	// Apply to head metadata first (must be identical order as extraction)
	applyHeadTitle(document, translations, segments, indexRef, skipSelectors, hashes, pending)
	applyHeadDescription(document, translations, segments, indexRef, skipSelectors, hashes, pending)

	// Apply to grouped HTML blocks (must be before text nodes, matching extraction order)
	applyToGroupedBlocks(translations, segments, indexRef, groupedElements, hashes, pending)

	// Apply to remaining text nodes (skipping grouped elements)
	if (document.body) {
		applyToTextNodes(document.body, translations, segments, indexRef, groupedElements, skipSelectors, hashes, pending, document)
	}

	// Apply to attributes (must be identical order as extraction)
	applyToAttributes(document, translations, segments, indexRef, skipSelectors, hashes, pending)

	// Return full result in deferred mode, just count for legacy mode
	if (hashes) {
		return {
			applied: indexRef.index - pending.length,
			pending,
		}
	}

	return indexRef.index
}
