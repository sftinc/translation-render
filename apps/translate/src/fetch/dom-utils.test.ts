/**
 * Tests for DOM utility functions
 * Verifies skip selector logic for translation exclusion
 */

import { describe, it, expect } from 'vitest'
import { parseHTML } from 'linkedom'
import { shouldSkipNode } from './dom-utils.js'

// Helper to create a document with the given HTML
function createDocument(html: string): Document {
	const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`)
	return document
}

describe('shouldSkipNode', () => {
	describe('standard selectors', () => {
		it('skips elements with .notranslate class', () => {
			const doc = createDocument('<p class="notranslate">Do not translate</p>')
			const p = doc.querySelector('p')!
			expect(shouldSkipNode(p, ['.notranslate'])).toBe(true)
		})

		it('skips elements with [notranslate] attribute', () => {
			const doc = createDocument('<span notranslate>Skip me</span>')
			const span = doc.querySelector('span')!
			expect(shouldSkipNode(span, ['[notranslate]'])).toBe(true)
		})

		it('skips elements with translate="no" attribute', () => {
			const doc = createDocument('<div translate="no">No translation</div>')
			const div = doc.querySelector('div')!
			expect(shouldSkipNode(div, ['[translate="no"]'])).toBe(true)
		})

		it('does not skip elements without matching selectors', () => {
			const doc = createDocument('<p class="normal">Translate me</p>')
			const p = doc.querySelector('p')!
			expect(shouldSkipNode(p, ['.notranslate', '[notranslate]', '[translate="no"]'])).toBe(false)
		})
	})

	describe('custom selectors', () => {
		it('skips elements matching custom selector [data-skip]', () => {
			const doc = createDocument('<span data-skip>Custom skip</span>')
			const span = doc.querySelector('span')!
			expect(shouldSkipNode(span, ['[data-skip]'])).toBe(true)
		})

		it('skips elements matching custom class selector .my-skip', () => {
			const doc = createDocument('<div class="my-skip">Custom class</div>')
			const div = doc.querySelector('div')!
			expect(shouldSkipNode(div, ['.my-skip'])).toBe(true)
		})

		it('skips elements matching custom ID selector #no-translate', () => {
			const doc = createDocument('<section id="no-translate">ID skip</section>')
			const section = doc.querySelector('section')!
			expect(shouldSkipNode(section, ['#no-translate'])).toBe(true)
		})

		it('handles complex selectors like [data-lang="en"]', () => {
			const doc = createDocument('<p data-lang="en">English only</p>')
			const p = doc.querySelector('p')!
			expect(shouldSkipNode(p, ['[data-lang="en"]'])).toBe(true)
		})
	})

	describe('ancestor matching', () => {
		it('skips text node inside skipped parent', () => {
			const doc = createDocument('<div class="notranslate">Nested <span>text</span> here</div>')
			const span = doc.querySelector('span')!
			expect(shouldSkipNode(span, ['.notranslate'])).toBe(true)
		})

		it('skips deeply nested elements inside skipped ancestor', () => {
			const doc = createDocument('<div notranslate><p><span><strong>Deep</strong></span></p></div>')
			const strong = doc.querySelector('strong')!
			expect(shouldSkipNode(strong, ['[notranslate]'])).toBe(true)
		})

		it('does not skip elements when ancestor has different class', () => {
			const doc = createDocument('<div class="translate"><span>Normal</span></div>')
			const span = doc.querySelector('span')!
			expect(shouldSkipNode(span, ['.notranslate'])).toBe(false)
		})
	})

	describe('invalid selector handling', () => {
		it('handles invalid selectors gracefully (no throw)', () => {
			const doc = createDocument('<p>Normal text</p>')
			const p = doc.querySelector('p')!
			// Invalid selectors should not throw - they just get skipped
			expect(() => shouldSkipNode(p, ['[[[invalid', '.notranslate'])).not.toThrow()
		})

		it('continues checking valid selectors after invalid one', () => {
			const doc = createDocument('<p class="notranslate">Should skip</p>')
			const p = doc.querySelector('p')!
			// Even with an invalid selector first, valid ones should still work
			expect(shouldSkipNode(p, ['[[[invalid', '.notranslate'])).toBe(true)
		})

		it('returns false when only invalid selectors provided', () => {
			const doc = createDocument('<p>Normal text</p>')
			const p = doc.querySelector('p')!
			expect(shouldSkipNode(p, ['[[[invalid', '!!!bad'])).toBe(false)
		})
	})

	describe('skip tags (script, style, etc.)', () => {
		it('skips script elements regardless of selectors', () => {
			const doc = createDocument('<script>var x = 1;</script>')
			const script = doc.querySelector('script')!
			expect(shouldSkipNode(script, [])).toBe(true)
		})

		it('skips style elements regardless of selectors', () => {
			const doc = createDocument('<style>.foo { color: red; }</style>')
			const style = doc.querySelector('style')!
			expect(shouldSkipNode(style, [])).toBe(true)
		})

		it('skips noscript elements', () => {
			const doc = createDocument('<noscript>Enable JS</noscript>')
			const noscript = doc.querySelector('noscript')!
			expect(shouldSkipNode(noscript, [])).toBe(true)
		})

		it('skips textarea elements', () => {
			const doc = createDocument('<textarea>User input</textarea>')
			const textarea = doc.querySelector('textarea')!
			expect(shouldSkipNode(textarea, [])).toBe(true)
		})

		it('skips code elements', () => {
			const doc = createDocument('<code>function()</code>')
			const code = doc.querySelector('code')!
			expect(shouldSkipNode(code, [])).toBe(true)
		})
	})

	describe('empty selectors array', () => {
		it('does not skip normal elements when no selectors provided', () => {
			const doc = createDocument('<p>Normal paragraph</p>')
			const p = doc.querySelector('p')!
			expect(shouldSkipNode(p, [])).toBe(false)
		})

		it('still skips SKIP_TAGS even with empty selectors', () => {
			const doc = createDocument('<script>code</script>')
			const script = doc.querySelector('script')!
			expect(shouldSkipNode(script, [])).toBe(true)
		})
	})
})
