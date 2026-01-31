/**
 * Shared DOM utility functions for extraction and application
 * These functions must remain identical between extractor and applicator
 */

import { SKIP_TAGS } from '../config.js'

/**
 * Check if a node should be skipped during traversal
 * @param node - DOM node to check
 * @param skipSelectors - CSS selectors for elements to skip (from database config)
 * @returns true if node or any ancestor should be skipped
 */
export function shouldSkipNode(node: Node, skipSelectors: string[]): boolean {
	let current: Node | null = node

	while (current) {
		if (current.nodeType === 1) {
			// Node.ELEMENT_NODE
			const elem = current as Element

			for (const selector of skipSelectors) {
				try {
					if (elem.matches(selector)) {
						return true
					}
				} catch (e) {
					// Invalid selector, continue gracefully
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
 * Check if a node or any of its ancestors is in the grouped elements set
 * @param node - Node to check
 * @param groupedElements - Set of elements that were grouped
 * @returns true if node is inside a grouped element
 */
export function isInsideGroupedElement(node: Node, groupedElements: Set<Element>): boolean {
	let current: Node | null = node

	while (current) {
		if (current.nodeType === 1 && groupedElements.has(current as Element)) {
			return true
		}
		current = current.parentNode
	}

	return false
}
