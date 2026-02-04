/**
 * Deferred Translation Script (TypeScript Source)
 *
 * This file documents the client-side deferred translation logic.
 * The actual script served to clients is in deferred-script-content.ts (minified).
 *
 * The deferred script:
 * 1. Waits 1s initial delay
 * 2. Collects pending segments from window.__PANTOLINGO_DEFERRED__
 * 3. Polls /__pantolingo/translate every 1s
 * 4. Applies completed translations to ALL matching elements (not just first)
 * 5. Falls back to show() if apply() fails (e.g., DOM changed during SPA hydration)
 * 6. On timeout (10 polls): removes skeletons, shows original English
 *
 * Duplicate handling:
 * - Server dedupes pending array by hash+kind+attr before injection (see injector.ts)
 * - Client updates ALL elements matching each hash (uses querySelectorAll, collects comments)
 * - This ensures duplicate text (e.g., "Help" appearing multiple times) all updates together
 *
 * Pending segment structure (content = original text for fallback display):
 * window.__PANTOLINGO_DEFERRED__ = [
 *   { hash: 'abc123', kind: 'html', content: 'Hello [HB1]world[/HB1]' },
 *   { hash: 'def456', kind: 'text', content: 'Hello' },
 *   { hash: 'ghi789', kind: 'attr', content: 'Search', attr: 'placeholder' },
 * ]
 */

// Type definitions for the deferred script
interface PendingSegment {
	hash: string
	kind: 'html' | 'text' | 'attr'
	content: string
	attr?: string
}

declare global {
	interface Window {
		__PANTOLINGO_DEFERRED__?: PendingSegment[]
	}
}

const INITIAL_DELAY = 1000 // 1s before first poll
const POLL_INTERVAL = 1000 // 1s between polls
const MAX_POLLS = 10 // 10 polls max before timeout

/**
 * Find ALL elements by hash and apply translation
 * Returns true if at least one element was updated
 */
function applyTranslation(hash: string, translation: string, kind: 'html' | 'text' | 'attr', attr?: string): boolean {
	let found = false

	if (kind === 'html') {
		// HTML segment: find ALL elements with data-pantolingo-pending attribute
		const elems = document.querySelectorAll(`[data-pantolingo-pending="${hash}"]`)
		for (let i = 0; i < elems.length; i++) {
			;(elems[i] as HTMLElement).innerHTML = translation
			elems[i].classList.remove('pantolingo-skeleton')
			elems[i].removeAttribute('data-pantolingo-pending')
			found = true
		}
	} else if (kind === 'text') {
		// Text segment: find ALL comment markers and replace following text nodes
		// Collect comments first to avoid DOM mutation during TreeWalker iteration
		const walker = document.createTreeWalker(
			document.body,
			NodeFilter.SHOW_COMMENT,
			{
				acceptNode: (node) => {
					if ((node as Comment).data === `pantolingo:${hash}`) {
						return NodeFilter.FILTER_ACCEPT
					}
					return NodeFilter.FILTER_SKIP
				}
			}
		)

		const comments: Comment[] = []
		let comment: Comment | null
		while ((comment = walker.nextNode() as Comment | null)) {
			comments.push(comment)
		}

		// Process collected comments
		for (const comment of comments) {
			const textNode = comment.nextSibling
			if (textNode && textNode.nodeType === Node.TEXT_NODE) {
				// Preserve whitespace from original
				const original = (textNode as Text).data
				const leading = original.match(/^(\s*)/)?.[1] || ''
				const trailing = original.match(/(\s*)$/)?.[1] || ''
				;(textNode as Text).data = leading + translation + trailing

				// Remove skeleton from parent if present
				const parent = textNode.parentElement
				if (parent?.classList.contains('pantolingo-skeleton')) {
					parent.classList.remove('pantolingo-skeleton')
					parent.removeAttribute('data-pantolingo-pending')
				}

				// Remove comment marker
				comment.remove()
				found = true
			}
		}

		// Fallback: if comment was destroyed by client JS, clean up by attribute
		const fallbackEls = document.querySelectorAll(`[data-pantolingo-pending="${hash}"]:not(title)`)
		for (let i = 0; i < fallbackEls.length; i++) {
			fallbackEls[i].classList.remove('pantolingo-skeleton')
			fallbackEls[i].removeAttribute('data-pantolingo-pending')
			found = true
		}

		// Title check runs unconditionally (body text and title may share hash)
		const title = document.querySelector(`title[data-pantolingo-pending="${hash}"]`)
		if (title) {
			title.textContent = translation
			title.removeAttribute('data-pantolingo-pending')
			found = true
		}
	} else if (kind === 'attr' && attr) {
		// Attribute segment: find ALL elements and update attribute
		const elems = document.querySelectorAll(`[data-pantolingo-pending="${hash}"][data-pantolingo-attr="${attr}"]`)
		for (let i = 0; i < elems.length; i++) {
			elems[i].setAttribute(attr, translation)
			elems[i].removeAttribute('data-pantolingo-pending')
			elems[i].removeAttribute('data-pantolingo-attr')
			found = true
		}
	}

	return found
}

/**
 * Remove skeleton styling and show original text for ALL matching pending elements
 */
function showOriginal(segment: PendingSegment): void {
	const { hash, kind, attr } = segment

	if (kind === 'html') {
		// Clear ALL matching html elements
		const elems = document.querySelectorAll(`[data-pantolingo-pending="${hash}"]`)
		for (let i = 0; i < elems.length; i++) {
			elems[i].classList.remove('pantolingo-skeleton')
			elems[i].removeAttribute('data-pantolingo-pending')
		}
	} else if (kind === 'text') {
		// Collect ALL matching comments first to avoid DOM mutation during TreeWalker
		const walker = document.createTreeWalker(
			document.body,
			NodeFilter.SHOW_COMMENT,
			{
				acceptNode: (node) => {
					if ((node as Comment).data === `pantolingo:${hash}`) {
						return NodeFilter.FILTER_ACCEPT
					}
					return NodeFilter.FILTER_SKIP
				}
			}
		)

		const comments: Comment[] = []
		let comment: Comment | null
		while ((comment = walker.nextNode() as Comment | null)) {
			comments.push(comment)
		}

		// Process collected comments
		for (const comment of comments) {
			const parent = comment.parentElement
			if (parent?.classList.contains('pantolingo-skeleton')) {
				parent.classList.remove('pantolingo-skeleton')
				parent.removeAttribute('data-pantolingo-pending')
			}
			comment.remove()
		}

		// Fallback: if comment was destroyed by client JS, clean up by attribute
		const fallbackEls = document.querySelectorAll(`[data-pantolingo-pending="${hash}"]:not(title)`)
		for (let i = 0; i < fallbackEls.length; i++) {
			fallbackEls[i].classList.remove('pantolingo-skeleton')
			fallbackEls[i].removeAttribute('data-pantolingo-pending')
		}

		// Title check runs unconditionally
		const title = document.querySelector(`title[data-pantolingo-pending="${hash}"]`)
		if (title) {
			title.removeAttribute('data-pantolingo-pending')
		}
	} else if (kind === 'attr' && attr) {
		// Clear ALL matching attr elements
		const elems = document.querySelectorAll(`[data-pantolingo-pending="${hash}"][data-pantolingo-attr="${attr}"]`)
		for (let i = 0; i < elems.length; i++) {
			elems[i].removeAttribute('data-pantolingo-pending')
			elems[i].removeAttribute('data-pantolingo-attr')
		}
	}
}

/**
 * Global cleanup: remove all remaining skeleton artifacts from the page.
 * Called after polling ends (timeout or all resolved) as a safety net.
 */
function cleanup(): void {
	const els = document.querySelectorAll('.pantolingo-skeleton')
	for (let i = 0; i < els.length; i++) {
		els[i].classList.remove('pantolingo-skeleton')
		els[i].removeAttribute('data-pantolingo-pending')
	}
}

/**
 * Poll for translations and apply them
 */
async function pollForTranslations(pending: PendingSegment[], pollCount: number): Promise<void> {
	if (pending.length === 0 || pollCount >= MAX_POLLS) {
		// Done or timeout - show original for any remaining
		for (const segment of pending) {
			showOriginal(segment)
		}
		cleanup()
		return
	}

	try {
		// Build request with segments
		const requestBody = {
			segments: pending.map(s => ({
				hash: s.hash,
				kind: s.kind,
				content: s.content,
				...(s.attr ? { attr: s.attr } : {}),
			})),
		}

		const response = await fetch('/__pantolingo/translate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(requestBody),
		})

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`)
		}

		// Response is flat object: { hash: translation, ... }
		const translations: Record<string, string> = await response.json()

		// Apply completed translations (fallback to show if apply fails)
		const stillPending: PendingSegment[] = []
		for (const segment of pending) {
			const translation = translations[segment.hash]
			if (translation !== undefined) {
				if (!applyTranslation(segment.hash, translation, segment.kind, segment.attr)) {
					showOriginal(segment)
				}
			} else {
				stillPending.push(segment)
			}
		}

		// Schedule next poll if still have pending, otherwise cleanup
		if (stillPending.length > 0) {
			setTimeout(() => {
				pollForTranslations(stillPending, pollCount + 1)
			}, POLL_INTERVAL)
		} else {
			cleanup()
		}
	} catch (error) {
		console.error('[Pantolingo] Polling error:', error)
		// Retry on next interval
		setTimeout(() => {
			pollForTranslations(pending, pollCount + 1)
		}, POLL_INTERVAL)
	}
}

/**
 * Initialize deferred translation polling
 */
function init(): void {
	const pending = window.__PANTOLINGO_DEFERRED__
	if (!pending || pending.length === 0) {
		return
	}

	// Wait initial delay before first poll
	setTimeout(() => {
		pollForTranslations([...pending], 0)
	}, INITIAL_DELAY)
}

// Start on DOMContentLoaded
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init)
} else {
	init()
}

export {}
