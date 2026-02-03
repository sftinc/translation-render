/**
 * Recovery Script Source (TypeScript)
 *
 * This file documents the client-side recovery script logic.
 * The actual script served to clients is in recovery-script-content.ts (minified).
 *
 * The recovery script:
 * 1. Waits for DOMContentLoaded
 * 2. Applies translations from window.__PANTOLINGO_RECOVERY__ dictionary
 * 3. Sets up MutationObserver for hydration changes
 * 4. Disconnects observer after 2 seconds
 * 5. Adds .pantolingo-ready to body (triggers CSS visibility)
 *
 * Dictionary structure:
 * window.__PANTOLINGO_RECOVERY__ = {
 *   text: { "Hello": "Hola", ... },      // text node translations
 *   html: { "Hello world": "<em>Hola</em> mundo", ... },  // innerHTML translations
 *   attrs: { "Search": "Buscar", ... },   // attribute translations
 *   paths: { "/about": "/acerca-de", ... },  // pathname translations
 *   lang: "es"
 * }
 */

// Type definitions for the recovery script
interface PantolingoDictionary {
	text: Record<string, string>
	html: Record<string, string>
	attrs: Record<string, string>
	paths: Record<string, string>
	lang: string
}

declare global {
	interface Window {
		__PANTOLINGO_RECOVERY__?: PantolingoDictionary
	}
}

// Translatable attributes to check
const TRANSLATABLE_ATTRS = ['alt', 'title', 'placeholder', 'aria-label']

// Block elements that may have HTML content translations
const BLOCK_ELEMENTS = new Set([
	'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
	'LI', 'TD', 'TH', 'DD', 'DT',
	'FIGCAPTION', 'CAPTION', 'LABEL', 'LEGEND', 'SUMMARY'
])

/**
 * Check if an element or its ancestors should be skipped
 * Also skips elements with data-pantolingo-pending (deferred translation in progress)
 */
function shouldSkip(element: Element | null): boolean {
	while (element) {
		if (element.hasAttribute('data-pantolingo-skip') || element.hasAttribute('data-pantolingo-pending')) {
			return true
		}
		element = element.parentElement
	}
	return false
}

/**
 * Apply HTML translations to block elements
 * Returns set of processed elements to avoid double-processing text nodes
 */
function applyHtmlTranslations(
	dictionary: PantolingoDictionary,
	root: Element,
	processed: Set<Element>
): void {
	const htmlDict = dictionary.html
	if (Object.keys(htmlDict).length === 0) return

	// Walk block elements
	const walker = document.createTreeWalker(
		root,
		NodeFilter.SHOW_ELEMENT,
		{
			acceptNode: (node) => {
				const elem = node as Element
				if (shouldSkip(elem)) return NodeFilter.FILTER_REJECT
				if (BLOCK_ELEMENTS.has(elem.tagName)) return NodeFilter.FILTER_ACCEPT
				return NodeFilter.FILTER_SKIP
			}
		}
	)

	let node: Element | null
	while ((node = walker.nextNode() as Element | null)) {
		const textContent = node.textContent?.trim()
		if (textContent && htmlDict[textContent]) {
			node.innerHTML = htmlDict[textContent]
			processed.add(node)
		}
	}
}

/**
 * Apply text translations to text nodes
 */
function applyTextTranslations(
	dictionary: PantolingoDictionary,
	root: Element,
	processed: Set<Element>
): void {
	const textDict = dictionary.text
	if (Object.keys(textDict).length === 0) return

	// Walk text nodes
	const walker = document.createTreeWalker(
		root,
		NodeFilter.SHOW_TEXT,
		{
			acceptNode: (node) => {
				// Skip if inside a processed block element
				let parent = node.parentElement
				while (parent) {
					if (processed.has(parent)) return NodeFilter.FILTER_REJECT
					if (shouldSkip(parent)) return NodeFilter.FILTER_REJECT
					parent = parent.parentElement
				}
				// Only accept non-empty text nodes
				const text = (node as Text).data.trim()
				if (text.length > 0) return NodeFilter.FILTER_ACCEPT
				return NodeFilter.FILTER_SKIP
			}
		}
	)

	let node: Text | null
	while ((node = walker.nextNode() as Text | null)) {
		const trimmed = node.data.trim()
		if (textDict[trimmed]) {
			// Preserve leading/trailing whitespace
			const leading = node.data.match(/^(\s*)/)?.[1] || ''
			const trailing = node.data.match(/(\s*)$/)?.[1] || ''
			node.data = leading + textDict[trimmed] + trailing
		}
	}
}

/**
 * Apply attribute translations
 */
function applyAttrTranslations(
	dictionary: PantolingoDictionary,
	root: Element
): void {
	const attrsDict = dictionary.attrs
	if (Object.keys(attrsDict).length === 0) return

	// Find all elements with translatable attributes
	const selector = TRANSLATABLE_ATTRS.map(attr => `[${attr}]`).join(',')
	const elements = root.querySelectorAll(selector)

	for (let i = 0; i < elements.length; i++) {
		const elem = elements[i]
		if (shouldSkip(elem)) continue

		for (const attr of TRANSLATABLE_ATTRS) {
			const value = elem.getAttribute(attr)
			if (value && attrsDict[value]) {
				elem.setAttribute(attr, attrsDict[value])
			}
		}
	}
}

/**
 * Apply pathname translations to links and forms
 * Restores translated hrefs/actions after SPA hydration reverts them
 */
function applyPathTranslations(dictionary: PantolingoDictionary): void {
	const pathsDict = dictionary.paths
	if (!pathsDict || Object.keys(pathsDict).length === 0) return

	// Query links and forms with href/action attributes
	const elements = document.querySelectorAll('a[href], form[action]')

	for (let i = 0; i < elements.length; i++) {
		const elem = elements[i]
		if (shouldSkip(elem)) continue

		const attrName = elem.tagName === 'FORM' ? 'action' : 'href'
		const url = elem.getAttribute(attrName)
		if (!url) continue

		// Parse URL to extract pathname
		try {
			const parsed = new URL(url, location.origin)
			// Only process same-origin URLs
			if (parsed.origin !== location.origin) continue

			const translated = pathsDict[parsed.pathname]
			if (translated) {
				parsed.pathname = translated
				elem.setAttribute(attrName, parsed.href)
			}
		} catch {
			// Handle relative paths without protocol
			const path = url.split('?')[0].split('#')[0]
			const translated = pathsDict[path]
			if (translated) {
				elem.setAttribute(attrName, url.replace(path, translated))
			}
		}
	}
}

/**
 * Main recovery function - applies all translations
 */
function recoverTranslations(): void {
	const dictionary = window.__PANTOLINGO_RECOVERY__
	if (!dictionary) return

	const processed = new Set<Element>()

	// Apply translations in order: HTML blocks first, then text, then attributes, then paths
	applyHtmlTranslations(dictionary, document.body, processed)
	applyTextTranslations(dictionary, document.body, processed)
	applyAttrTranslations(dictionary, document.body)
	applyPathTranslations(dictionary)

	// Mark page as ready (triggers CSS visibility)
	document.body.classList.add('pantolingo-ready')
}

/**
 * Handle mutations from React/Next.js hydration
 */
function handleMutations(mutations: MutationRecord[]): void {
	const dictionary = window.__PANTOLINGO_RECOVERY__
	if (!dictionary) return

	const processed = new Set<Element>()
	let hasAddedElements = false

	for (const mutation of mutations) {
		if (mutation.type === 'childList') {
			// New nodes added - check them
			for (let i = 0; i < mutation.addedNodes.length; i++) {
				const node = mutation.addedNodes[i]
				if (node.nodeType === Node.ELEMENT_NODE) {
					hasAddedElements = true
					const elem = node as Element
					applyHtmlTranslations(dictionary, elem, processed)
					applyTextTranslations(dictionary, elem, processed)
					applyAttrTranslations(dictionary, elem)
				} else if (node.nodeType === Node.TEXT_NODE) {
					const textNode = node as Text
					const trimmed = textNode.data.trim()
					if (trimmed && dictionary.text[trimmed]) {
						const leading = textNode.data.match(/^(\s*)/)?.[1] || ''
						const trailing = textNode.data.match(/(\s*)$/)?.[1] || ''
						textNode.data = leading + dictionary.text[trimmed] + trailing
					}
				}
			}
		} else if (mutation.type === 'characterData') {
			// Text content changed
			const textNode = mutation.target as Text
			const trimmed = textNode.data.trim()
			if (trimmed && dictionary.text[trimmed]) {
				const leading = textNode.data.match(/^(\s*)/)?.[1] || ''
				const trailing = textNode.data.match(/(\s*)$/)?.[1] || ''
				textNode.data = leading + dictionary.text[trimmed] + trailing
			}
		}
	}

	// Apply path translations if elements were added (links may have been reverted)
	if (hasAddedElements) {
		applyPathTranslations(dictionary)
	}
}

/**
 * Initialize recovery on DOMContentLoaded
 */
function init(): void {
	// Run initial recovery
	recoverTranslations()

	// Set up MutationObserver for hydration changes
	const observer = new MutationObserver(handleMutations)
	observer.observe(document.body, {
		childList: true,
		subtree: true,
		characterData: true
	})

	// Disconnect after 2 seconds (hydration should be complete)
	setTimeout(() => {
		observer.disconnect()
	}, 2000)
}

// Start on DOMContentLoaded
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init)
} else {
	init()
}

export {}
