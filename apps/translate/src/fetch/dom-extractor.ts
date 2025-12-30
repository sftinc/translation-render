/**
 * DOM extraction module for linkedom
 * Extracts translatable segments using recursive DOM traversal (TreeWalker replacement)
 */

import { SKIP_SELECTORS, SKIP_TAGS, TRANSLATE_ATTRS } from '../config.js'
import type { Content } from '../types.js'

/**
 * Check if a node should be skipped during traversal
 * @param node - DOM node to check
 * @returns true if node or any ancestor should be skipped
 */
function shouldSkipNode(node: Node): boolean {
	let current: Node | null = node

	while (current) {
		// Check if Element
		if (current.nodeType === 1) {
			// Node.ELEMENT_NODE
			const elem = current as Element

			// Check skip selectors (.notranslate, [notranslate])
			for (const selector of SKIP_SELECTORS) {
				try {
					if (elem.matches(selector)) {
						return true
					}
				} catch (e) {
					// Invalid selector, continue
				}
			}

			// Check skip tags (script, style, pre, code, etc.)
			if (SKIP_TAGS.has(elem.tagName.toLowerCase())) {
				return true
			}
		}

		current = current.parentNode
	}

	return false
}

/**
 * Recursively extract text nodes from DOM
 * Depth-first traversal maintains document order (same as TreeWalker)
 * @param node - Current node in traversal
 * @param segments - Accumulator array for segments
 */
function extractTextNodes(node: Node, segments: Content[]): void {
	// Skip if node or ancestor should be skipped
	if (shouldSkipNode(node)) {
		return
	}

	// If this is a text node with non-whitespace content
	if (node.nodeType === 3) {
		// Node.TEXT_NODE
		const text = (node as Text).data
		const trimmed = text.trim()
		if (trimmed.length > 0) {
			const leading = text.match(/^(\s*)/)?.[1] || ''
			const trailing = text.match(/(\s*)$/)?.[1] || ''

			segments.push({
				kind: 'text',
				value: trimmed,
				ws: { leading, trailing },
			})
		}
		return // Text nodes don't have children
	}

	// Recursively process child nodes in order (depth-first)
	const children = node.childNodes
	for (let i = 0; i < children.length; i++) {
		extractTextNodes(children[i], segments)
	}
}

/**
 * Extract translatable attributes from all elements
 * Uses querySelectorAll which returns elements in document order
 * @param document - linkedom Document object
 * @param segments - Accumulator array for segments
 */
function extractAttributes(document: Document, segments: Content[]): void {
	const allElements = document.querySelectorAll('*')

	for (let i = 0; i < allElements.length; i++) {
		const elem = allElements[i] as Element

		// Skip if element should be skipped
		if (shouldSkipNode(elem)) {
			continue
		}

		// Check translatable attributes
		for (const attr of TRANSLATE_ATTRS) {
			const value = elem.getAttribute(attr)
			if (value && value.trim().length > 0) {
				const trimmed = value.trim()
				const leading = value.match(/^(\s*)/)?.[1] || ''
				const trailing = value.match(/(\s*)$/)?.[1] || ''

				segments.push({
					kind: 'attr',
					attr: attr,
					value: trimmed,
					ws: { leading, trailing },
				})
			}
		}
	}
}

/**
 * Extract title text from <title> element
 * @param document - linkedom Document object
 * @param segments - Accumulator array for segments
 */
function extractHeadTitle(document: Document, segments: Content[]): void {
	const titleElement = document.querySelector('title')
	// Skip if element should be skipped
	if (!titleElement || shouldSkipNode(titleElement)) {
		return
	}
	if (titleElement.textContent && titleElement.textContent.trim().length > 0) {
		const text = titleElement.textContent
		const trimmed = text.trim()
		const leading = text.match(/^(\s*)/)?.[1] || ''
		const trailing = text.match(/(\s*)$/)?.[1] || ''

		segments.push({
			kind: 'text',
			value: trimmed,
			ws: { leading, trailing },
		})
	}
}

/**
 * Extract description from <meta name="description"> element
 * @param document - linkedom Document object
 * @param segments - Accumulator array for segments
 */
function extractHeadDescription(document: Document, segments: Content[]): void {
	const descElement = document.querySelector('meta[name="description"]')
	// Skip if element should be skipped
	if (!descElement || shouldSkipNode(descElement)) {
		return
	}
	const content = descElement.getAttribute('content')
	if (content && content.trim().length > 0) {
		const trimmed = content.trim()
		const leading = content.match(/^(\s*)/)?.[1] || ''
		const trailing = content.match(/(\s*)$/)?.[1] || ''

		segments.push({
			kind: 'attr',
			attr: 'content',
			value: trimmed,
			ws: { leading, trailing },
		})
	}
}

/**
 * Extract all translatable segments from linkedom DOM
 * Uses recursive traversal to replicate TreeWalker behavior
 * @param document - linkedom Document object
 * @returns Array of Segment objects in stable traversal order
 */
export function extractSegments(document: Document): Content[] {
	const segments: Content[] = []

	// Guard against invalid HTML (no documentElement means parsing failed)
	if (!document.documentElement) {
		return segments
	}

	// Extract head metadata first (title and description)
	extractHeadTitle(document, segments)
	extractHeadDescription(document, segments)

	// Extract text nodes from body (same starting point as TreeWalker)
	if (document.body) {
		extractTextNodes(document.body, segments)
	}

	// Extract attributes from all elements
	extractAttributes(document, segments)

	return segments
}

/**
 * Extract all unique pathnames from navigation links on the page
 * Used to translate all link destinations, not just the current page
 * @param document - linkedom Document object
 * @param originHost - Origin hostname to filter for
 * @returns Set of unique pathnames found in links
 */
export function extractLinkPathnames(document: Document, originHost: string): Set<string> {
	const pathnames = new Set<string>()

	// Guard against invalid HTML
	if (!document.documentElement) {
		return pathnames
	}

	// Extract pathnames from <a href> links
	const links = document.querySelectorAll('a[href]')
	for (let i = 0; i < links.length; i++) {
		const href = links[i].getAttribute('href')
		if (!href) continue

		try {
			if (href.includes('://')) {
				// Absolute URL - check if from origin domain
				const url = new URL(href)
				if (url.hostname === originHost) {
					pathnames.add(url.pathname)
				}
			} else if (href.startsWith('/')) {
				// Relative URL - extract pathname (before query/hash)
				const queryIndex = href.indexOf('?')
				const hashIndex = href.indexOf('#')

				// Find end of pathname
				let pathnameEnd = href.length
				if (queryIndex !== -1) pathnameEnd = Math.min(pathnameEnd, queryIndex)
				if (hashIndex !== -1) pathnameEnd = Math.min(pathnameEnd, hashIndex)

				const pathname = href.substring(0, pathnameEnd)
				if (pathname && pathname !== '/') {
					pathnames.add(pathname)
				}
			}
		} catch (e) {
			// Invalid URL, skip
		}
	}

	// Extract pathnames from <form action> elements
	const forms = document.querySelectorAll('form[action]')
	for (let i = 0; i < forms.length; i++) {
		const action = forms[i].getAttribute('action')
		if (!action) continue

		try {
			if (action.includes('://')) {
				// Absolute URL - check if from origin domain
				const url = new URL(action)
				if (url.hostname === originHost) {
					pathnames.add(url.pathname)
				}
			} else if (action.startsWith('/')) {
				// Relative URL - extract pathname (before query/hash)
				const queryIndex = action.indexOf('?')
				const hashIndex = action.indexOf('#')

				// Find end of pathname
				let pathnameEnd = action.length
				if (queryIndex !== -1) pathnameEnd = Math.min(pathnameEnd, queryIndex)
				if (hashIndex !== -1) pathnameEnd = Math.min(pathnameEnd, hashIndex)

				const pathname = action.substring(0, pathnameEnd)
				if (pathname && pathname !== '/') {
					pathnames.add(pathname)
				}
			}
		} catch (e) {
			// Invalid URL, skip
		}
	}

	return pathnames
}
