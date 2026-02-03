/**
 * In-Memory Translation Tracking Store
 * Prevents duplicate LLM calls for translations that are already in progress.
 *
 * Key format: `${websiteId}:${lang}:${textHash}`
 * Uses lazy cleanup to remove stale entries (>5 minutes old)
 */

interface InFlightEntry {
	startedAt: number
}

// Key: `${websiteId}:${lang}:${textHash}`
const store = new Map<string, InFlightEntry>()

const CLEANUP_INTERVAL = 60_000 // 60 seconds between cleanups
const MAX_AGE = 5 * 60_000 // 5 minutes max age for entries
let lastCleanup = Date.now()

/**
 * Lazy cleanup: called internally on isInFlight/setInFlight
 * Runs cleanup if >60s since last cleanup
 */
function maybeCleanup(): void {
	const now = Date.now()
	if (now - lastCleanup < CLEANUP_INTERVAL) {
		return
	}

	lastCleanup = now
	const cutoff = now - MAX_AGE

	for (const [key, entry] of store.entries()) {
		if (entry.startedAt < cutoff) {
			store.delete(key)
		}
	}
}

/**
 * Check if a translation is currently in flight
 * @param key - The in-flight key: `${websiteId}:${lang}:${textHash}`
 * @returns true if translation is in progress
 */
export function isInFlight(key: string): boolean {
	maybeCleanup()
	return store.has(key)
}

/**
 * Mark a translation as in flight
 * @param key - The in-flight key: `${websiteId}:${lang}:${textHash}`
 */
export function setInFlight(key: string): void {
	maybeCleanup()
	store.set(key, { startedAt: Date.now() })
}

/**
 * Remove a translation from in-flight tracking
 * Call this when translation completes (success or failure)
 * @param key - The in-flight key: `${websiteId}:${lang}:${textHash}`
 */
export function deleteInFlight(key: string): void {
	store.delete(key)
}

/**
 * Build the in-flight key for a translation
 * @param websiteId - Website ID
 * @param lang - Target language code
 * @param text - Content identifier (segment hash or normalized path)
 * @returns The key string
 */
export function buildInFlightKey(websiteId: number, lang: string, text: string): string {
	return `${websiteId}:${lang}:${text}`
}

// Export for testing only
export const _internal = {
	getStore: () => store,
	setLastCleanup: (time: number) => {
		lastCleanup = time
	},
	CLEANUP_INTERVAL,
	MAX_AGE,
}
