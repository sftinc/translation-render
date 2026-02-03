/**
 * Deferred Asset Injector
 * Injects the deferred translation script, pending segments, and skeleton CSS into HTML
 */

import type { PendingSegment } from '../dom/applicator.js'
import { DEFERRED_SCRIPT } from './deferred-script-content.js'

/**
 * CSS for skeleton loading animation on pending translations
 * Hides original text and shows animated shimmer placeholder
 */
const SKELETON_CSS = `.pantolingo-skeleton{position:relative;color:transparent!important}.pantolingo-skeleton *{color:transparent!important}.pantolingo-skeleton::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(128,128,128,0.2) 25%,rgba(128,128,128,0.1) 50%,rgba(128,128,128,0.2) 75%);background-size:200% 100%;animation:pantolingo-shimmer 1.5s infinite;border-radius:4px;pointer-events:none}@keyframes pantolingo-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`

/**
 * Inject deferred translation assets into the HTML document
 *
 * Injects:
 * 1. Skeleton CSS in <head> - shimmer animation for pending segments
 * 2. Deferred script reference before </body> - defer loaded
 * 3. Pending segments data before </body> - inline JSON data (after script)
 *
 * @param document - The parsed HTML document
 * @param pending - Array of pending segments (cache misses)
 */
export function injectDeferredAssets(document: Document, pending: PendingSegment[]): void {
	const head = document.head
	const body = document.body

	if (!head || !body) {
		console.warn('[Deferred Injector] Missing <head> or <body> element')
		return
	}

	// 1. Inject skeleton CSS at the start of <head>
	const styleElement = document.createElement('style')
	styleElement.setAttribute('data-pantolingo', 'skeleton')
	styleElement.textContent = SKELETON_CSS
	// Insert at the beginning of head for earliest possible application
	if (head.firstChild) {
		head.insertBefore(styleElement, head.firstChild)
	} else {
		head.appendChild(styleElement)
	}

	// 2. Inject deferred script reference before </body>
	const scriptElement = document.createElement('script')
	scriptElement.setAttribute('defer', '')
	scriptElement.setAttribute('src', '/__pantolingo/deferred.js')
	scriptElement.setAttribute('data-pantolingo', 'deferred')
	body.appendChild(scriptElement)

	// 3. Inject pending segments as inline script before </body> (after script reference)
	const pendingScript = document.createElement('script')
	pendingScript.setAttribute('data-pantolingo', 'pending')
	// Use a compact JSON format - only include necessary fields
	const pendingJson = JSON.stringify(
		pending.map((p) => ({
			hash: p.hash,
			kind: p.kind,
			content: p.content,
			...(p.attr ? { attr: p.attr } : {}),
		}))
	)
	pendingScript.textContent = `window.__PANTOLINGO_DEFERRED__=${pendingJson}`
	body.appendChild(pendingScript)
}

/**
 * Get the deferred script content for serving via the /__pantolingo/deferred.js endpoint
 * @returns The minified deferred script
 */
export function getDeferredScript(): string {
	return DEFERRED_SCRIPT
}
