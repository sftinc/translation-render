import { describe, it, expect } from 'vitest'
import { hashText } from './hash.js'

describe('hashText', () => {
	it('returns consistent hash for same input', () => {
		const hash1 = hashText('hello world')
		const hash2 = hashText('hello world')
		expect(hash1).toBe(hash2)
	})

	it('returns different hash for different input', () => {
		const hash1 = hashText('hello')
		const hash2 = hashText('world')
		expect(hash1).not.toBe(hash2)
	})

	it('returns a 16-character hex string', () => {
		const hash = hashText('test')
		expect(hash).toMatch(/^[a-f0-9]{16}$/)
	})
})
