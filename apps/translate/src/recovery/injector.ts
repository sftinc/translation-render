/**
 * Recovery Asset Injector
 * Injects the translation recovery script, dictionary, and CSS into HTML
 */

import type { TranslationDictionary } from './dictionary-builder.js'
import { RECOVERY_SCRIPT } from './recovery-script-content.js'

/**
 * CSS to prevent flash of untranslated content during hydration
 * Body starts hidden, becomes visible when .pantolingo-ready is added
 */
const FLICKER_GUARD_CSS = `body:not(.pantolingo-ready){opacity:0}`

/**
 * Mark elements matching skip selectors with data-pantolingo-skip attribute
 * The recovery script will skip these elements during translation recovery
 *
 * @param document - The parsed HTML document
 * @param skipSelectors - CSS selectors for elements to skip
 */
export function markSkippedElements(document: Document, skipSelectors: string[]): void {
	if (!skipSelectors || skipSelectors.length === 0) {
		return
	}

	for (const selector of skipSelectors) {
		try {
			const elements = document.querySelectorAll(selector)
			for (let i = 0; i < elements.length; i++) {
				elements[i].setAttribute('data-pantolingo-skip', '')
			}
		} catch (error) {
			// Invalid selector - skip silently
			console.warn(`[Injector] Invalid skip selector: ${selector}`)
		}
	}
}

/**
 * Inject recovery assets into the HTML document
 *
 * Injects:
 * 1. Flicker guard CSS in <head> - hides body until recovery completes
 * 2. Recovery script reference before </body> - defer loaded
 * 3. Translation dictionary before </body> - inline JSON data (after script)
 *
 * @param document - The parsed HTML document
 * @param dictionary - The translation dictionary to inject
 */
export function injectRecoveryAssets(document: Document, dictionary: TranslationDictionary): void {
	const head = document.head
	const body = document.body

	if (!head || !body) {
		console.warn('[Injector] Missing <head> or <body> element')
		return
	}

	// 1. Inject flicker guard CSS at the start of <head>
	const styleElement = document.createElement('style')
	styleElement.setAttribute('data-pantolingo', 'flicker-guard')
	styleElement.textContent = FLICKER_GUARD_CSS
	// Insert at the beginning of head for earliest possible application
	if (head.firstChild) {
		head.insertBefore(styleElement, head.firstChild)
	} else {
		head.appendChild(styleElement)
	}

	// 2. Inject recovery script reference before </body>
	const scriptElement = document.createElement('script')
	scriptElement.setAttribute('defer', '')
	scriptElement.setAttribute('src', '/__pantolingo/recovery.js')
	scriptElement.setAttribute('data-pantolingo', 'recovery')
	body.appendChild(scriptElement)

	// 3. Inject dictionary as inline script before </body> (after script reference)
	const dictionaryScript = document.createElement('script')
	dictionaryScript.setAttribute('data-pantolingo', 'dictionary')
	// Use a compact JSON format
	const dictionaryJson = JSON.stringify({
		text: dictionary.text,
		html: dictionary.html,
		attrs: dictionary.attrs,
		paths: dictionary.paths,
		lang: dictionary.targetLang,
	})
	dictionaryScript.textContent = `window.__PANTOLINGO_RECOVERY__=${dictionaryJson}`
	body.appendChild(dictionaryScript)
}

/**
 * Get the recovery script content for serving via the /__pantolingo/recovery.js endpoint
 * @returns The minified recovery script
 */
export function getRecoveryScript(): string {
	return RECOVERY_SCRIPT
}
