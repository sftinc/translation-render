import { describe, it, expect, beforeEach } from 'vitest'
import {
	isInFlight,
	setInFlight,
	deleteInFlight,
	buildInFlightKey,
	_internal,
} from './in-flight-store.js'

describe('in-flight-store', () => {
	beforeEach(() => {
		// Clear the store before each test
		_internal.getStore().clear()
		_internal.setLastCleanup(Date.now())
	})

	describe('buildInFlightKey', () => {
		it('builds key from websiteId, lang, and hash', () => {
			const key = buildInFlightKey(123, 'es', 'abc123hash')
			expect(key).toBe('123:es:abc123hash')
		})
	})

	describe('setInFlight / isInFlight', () => {
		it('marks a key as in flight', () => {
			const key = buildInFlightKey(1, 'fr', 'hash1')
			expect(isInFlight(key)).toBe(false)

			setInFlight(key)
			expect(isInFlight(key)).toBe(true)
		})

		it('handles multiple keys independently', () => {
			const key1 = buildInFlightKey(1, 'es', 'hash1')
			const key2 = buildInFlightKey(1, 'es', 'hash2')
			const key3 = buildInFlightKey(2, 'fr', 'hash1')

			setInFlight(key1)
			setInFlight(key2)

			expect(isInFlight(key1)).toBe(true)
			expect(isInFlight(key2)).toBe(true)
			expect(isInFlight(key3)).toBe(false)
		})
	})

	describe('deleteInFlight', () => {
		it('removes a key from in-flight tracking', () => {
			const key = buildInFlightKey(1, 'de', 'hash1')
			setInFlight(key)
			expect(isInFlight(key)).toBe(true)

			deleteInFlight(key)
			expect(isInFlight(key)).toBe(false)
		})

		it('does not throw for non-existent keys', () => {
			const key = buildInFlightKey(999, 'xx', 'nonexistent')
			expect(() => deleteInFlight(key)).not.toThrow()
		})
	})

	describe('lazy cleanup', () => {
		it('removes stale entries when cleanup interval has passed', () => {
			const key1 = buildInFlightKey(1, 'es', 'hash1')
			const key2 = buildInFlightKey(1, 'es', 'hash2')

			// Add entries
			setInFlight(key1)
			setInFlight(key2)

			// Manually make key1 old (6 minutes ago)
			const store = _internal.getStore()
			const entry1 = store.get(key1)!
			entry1.startedAt = Date.now() - (6 * 60_000)

			// Force last cleanup to be old enough to trigger new cleanup
			_internal.setLastCleanup(Date.now() - (_internal.CLEANUP_INTERVAL + 1000))

			// This should trigger cleanup and remove the old entry
			expect(isInFlight(key1)).toBe(false) // Stale, should be cleaned
			expect(isInFlight(key2)).toBe(true) // Fresh, should remain
		})

		it('does not clean up entries within MAX_AGE', () => {
			const key = buildInFlightKey(1, 'es', 'hash1')
			setInFlight(key)

			// Make entry 4 minutes old (under 5 minute MAX_AGE)
			const store = _internal.getStore()
			const entry = store.get(key)!
			entry.startedAt = Date.now() - (4 * 60_000)

			// Force cleanup to run
			_internal.setLastCleanup(Date.now() - (_internal.CLEANUP_INTERVAL + 1000))

			expect(isInFlight(key)).toBe(true) // Should still be present
		})

		it('does not run cleanup before interval has passed', () => {
			const key = buildInFlightKey(1, 'es', 'hash1')
			setInFlight(key)

			// Make entry old
			const store = _internal.getStore()
			const entry = store.get(key)!
			entry.startedAt = Date.now() - (6 * 60_000)

			// Last cleanup was recent, so cleanup shouldn't run
			_internal.setLastCleanup(Date.now())

			expect(isInFlight(key)).toBe(true) // Old but cleanup didn't run
		})
	})
})
