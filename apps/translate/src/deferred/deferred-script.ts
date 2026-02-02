/**
 * Deferred Translation Script (TypeScript Source)
 *
 * This file documents the client-side deferred translation logic.
 * The actual script served to clients is in deferred-script-content.ts (minified).
 *
 * The deferred script:
 * 1. Waits 1s initial delay
 * 2. Collects pending segments from window.__PANTOLINGO_PENDING__
 * 3. Polls /__pantolingo/translate every 1s
 * 4. Applies completed translations and removes from pending list
 * 5. On timeout (10 polls): removes skeletons, shows original English
 *
 * Pending segment structure:
 * window.__PANTOLINGO_PENDING__ = [
 *   { hash: 'abc123', kind: 'html', original: 'Hello [HB1]world[/HB1]' },
 *   { hash: 'def456', kind: 'text', original: 'Hello' },
 *   { hash: 'ghi789', kind: 'attr', original: 'Search', attr: 'placeholder' },
 * ]
 */

// Type definitions for the deferred script
interface PendingSegment {
	hash: string
	kind: 'html' | 'text' | 'attr'
	original: string
	originalHtml?: string // Raw innerHTML for HTML segments
	attr?: string
}

declare global {
	interface Window {
		__PANTOLINGO_PENDING__?: PendingSegment[]
	}
}

const INITIAL_DELAY = 1000 // 1s before first poll
const POLL_INTERVAL = 1000 // 1s between polls
const MAX_POLLS = 10 // 10 polls max before timeout

/**
 * Find element by hash and apply translation
 */
function applyTranslation(hash: string, translation: string, kind: 'html' | 'text' | 'attr', attr?: string): boolean {
	if (kind === 'html') {
		// HTML segment: find element with data-pantolingo-pending attribute
		const elem = document.querySelector(`[data-pantolingo-pending="${hash}"]`) as HTMLElement
		if (elem) {
			elem.innerHTML = translation
			elem.classList.remove('pantolingo-skeleton')
			elem.removeAttribute('data-pantolingo-pending')
			return true
		}
	} else if (kind === 'text') {
		// Text segment: find comment marker and replace following text node
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

		const comment = walker.nextNode() as Comment | null
		if (comment) {
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
				return true
			}
		}

		// Also check for title element (marked with data-pantolingo-pending)
		const title = document.querySelector(`title[data-pantolingo-pending="${hash}"]`)
		if (title) {
			title.textContent = translation
			title.removeAttribute('data-pantolingo-pending')
			return true
		}
	} else if (kind === 'attr' && attr) {
		// Attribute segment: find element and update attribute
		const elem = document.querySelector(`[data-pantolingo-pending="${hash}"][data-pantolingo-attr="${attr}"]`)
		if (elem) {
			elem.setAttribute(attr, translation)
			elem.removeAttribute('data-pantolingo-pending')
			elem.removeAttribute('data-pantolingo-attr')
			return true
		}
	}

	return false
}

/**
 * Remove skeleton styling and show original text for a pending segment
 */
function showOriginal(segment: PendingSegment): void {
	const { hash, kind, original, attr } = segment

	if (kind === 'html') {
		const elem = document.querySelector(`[data-pantolingo-pending="${hash}"]`) as HTMLElement
		if (elem) {
			// Original is already in the DOM; just remove skeleton styling
			elem.classList.remove('pantolingo-skeleton')
			elem.removeAttribute('data-pantolingo-pending')
		}
	} else if (kind === 'text') {
		// Find and remove comment marker, skeleton stays on parent
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

		const comment = walker.nextNode() as Comment | null
		if (comment) {
			const parent = comment.parentElement
			if (parent?.classList.contains('pantolingo-skeleton')) {
				parent.classList.remove('pantolingo-skeleton')
				parent.removeAttribute('data-pantolingo-pending')
			}
			comment.remove()
		}

		// Also check title
		const title = document.querySelector(`title[data-pantolingo-pending="${hash}"]`)
		if (title) {
			title.removeAttribute('data-pantolingo-pending')
		}
	} else if (kind === 'attr' && attr) {
		const elem = document.querySelector(`[data-pantolingo-pending="${hash}"][data-pantolingo-attr="${attr}"]`)
		if (elem) {
			elem.removeAttribute('data-pantolingo-pending')
			elem.removeAttribute('data-pantolingo-attr')
		}
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
		return
	}

	try {
		// Build request with segments
		const requestBody = {
			segments: pending.map(s => ({
				hash: s.hash,
				original: s.original,
				kind: s.kind,
				...(s.originalHtml ? { originalHtml: s.originalHtml } : {}),
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

		// Apply completed translations
		const stillPending: PendingSegment[] = []
		for (const segment of pending) {
			const translation = translations[segment.hash]
			if (translation !== undefined) {
				applyTranslation(segment.hash, translation, segment.kind, segment.attr)
			} else {
				stillPending.push(segment)
			}
		}

		// Schedule next poll if still have pending
		if (stillPending.length > 0) {
			setTimeout(() => {
				pollForTranslations(stillPending, pollCount + 1)
			}, POLL_INTERVAL)
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
	const pending = window.__PANTOLINGO_PENDING__
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
