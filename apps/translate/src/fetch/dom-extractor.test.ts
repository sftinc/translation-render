/**
 * Tests for DOM extraction with skip selectors
 * Verifies that content inside elements matching skipSelectors is excluded
 */

import { describe, it, expect } from 'vitest'
import { parseHTML } from 'linkedom'
import { extractSegments } from './dom-extractor.js'

// Helper to create a document with the given HTML
function createDocument(bodyHtml: string, headHtml = ''): Document {
	const { document } = parseHTML(`<!DOCTYPE html><html><head>${headHtml}</head><body>${bodyHtml}</body></html>`)
	return document
}

describe('extractSegments with skipSelectors', () => {
	describe('standard selectors', () => {
		it('excludes content inside .notranslate elements', () => {
			const doc = createDocument(`
				<p>Translate this</p>
				<p class="notranslate">Do not translate</p>
				<p>Also translate</p>
			`)
			const segments = extractSegments(doc, ['.notranslate'])
			const values = segments.map((s) => s.value)
			expect(values).toContain('Translate this')
			expect(values).toContain('Also translate')
			expect(values).not.toContain('Do not translate')
		})

		it('excludes content inside [notranslate] elements', () => {
			const doc = createDocument(`
				<span>Yes</span>
				<span notranslate>No</span>
			`)
			const segments = extractSegments(doc, ['[notranslate]'])
			const values = segments.map((s) => s.value)
			expect(values).toContain('Yes')
			expect(values).not.toContain('No')
		})

		it('excludes content inside [translate="no"] elements', () => {
			const doc = createDocument(`
				<div>Include</div>
				<div translate="no">Exclude</div>
			`)
			const segments = extractSegments(doc, ['[translate="no"]'])
			const values = segments.map((s) => s.value)
			expect(values).toContain('Include')
			expect(values).not.toContain('Exclude')
		})
	})

	describe('custom selectors', () => {
		it('excludes content with custom selector [data-skip]', () => {
			const doc = createDocument(`
				<p>Regular content</p>
				<p data-skip>Skipped content</p>
			`)
			const segments = extractSegments(doc, ['[data-skip]'])
			const values = segments.map((s) => s.value)
			expect(values).toContain('Regular content')
			expect(values).not.toContain('Skipped content')
		})

		it('excludes content with custom class selector .my-skip-class', () => {
			const doc = createDocument(`
				<div class="my-skip-class">Hidden from translation</div>
				<div>Visible to translation</div>
			`)
			const segments = extractSegments(doc, ['.my-skip-class'])
			const values = segments.map((s) => s.value)
			expect(values).toContain('Visible to translation')
			expect(values).not.toContain('Hidden from translation')
		})

		it('supports multiple custom selectors', () => {
			const doc = createDocument(`
				<p>Normal</p>
				<p class="skip-a">Skip A</p>
				<p data-skip-b>Skip B</p>
				<p>Also normal</p>
			`)
			const segments = extractSegments(doc, ['.skip-a', '[data-skip-b]'])
			const values = segments.map((s) => s.value)
			expect(values).toContain('Normal')
			expect(values).toContain('Also normal')
			expect(values).not.toContain('Skip A')
			expect(values).not.toContain('Skip B')
		})
	})

	describe('nested content', () => {
		it('excludes nested text inside skipped parent', () => {
			const doc = createDocument(`
				<div class="notranslate">
					<p>Nested paragraph</p>
					<span>Nested span</span>
				</div>
				<p>Outside paragraph</p>
			`)
			const segments = extractSegments(doc, ['.notranslate'])
			const values = segments.map((s) => s.value)
			expect(values).toContain('Outside paragraph')
			expect(values).not.toContain('Nested paragraph')
			expect(values).not.toContain('Nested span')
		})

		it('excludes deeply nested content', () => {
			const doc = createDocument(`
				<div notranslate>
					<section>
						<article>
							<p>Deep text</p>
						</article>
					</section>
				</div>
			`)
			const segments = extractSegments(doc, ['[notranslate]'])
			const values = segments.map((s) => s.value)
			expect(values).not.toContain('Deep text')
		})
	})

	describe('attributes', () => {
		it('excludes attributes on skipped elements', () => {
			const doc = createDocument(`
				<img src="a.png" alt="Include this" />
				<img src="b.png" alt="Exclude this" class="notranslate" />
			`)
			const segments = extractSegments(doc, ['.notranslate'])
			const values = segments.map((s) => s.value)
			expect(values).toContain('Include this')
			expect(values).not.toContain('Exclude this')
		})

		it('excludes title attributes on skipped elements', () => {
			const doc = createDocument(`
				<span title="Visible title">Text</span>
				<span title="Hidden title" notranslate>Skipped</span>
			`)
			const segments = extractSegments(doc, ['[notranslate]'])
			const values = segments.map((s) => s.value)
			expect(values).toContain('Visible title')
			expect(values).not.toContain('Hidden title')
		})
	})

	describe('head elements', () => {
		it('excludes title when head has notranslate', () => {
			// Note: This tests the behavior when title element itself is marked
			const doc = createDocument('<p>Body</p>', '<title class="notranslate">Skip Title</title>')
			const segments = extractSegments(doc, ['.notranslate'])
			const values = segments.map((s) => s.value)
			expect(values).toContain('Body')
			expect(values).not.toContain('Skip Title')
		})

		it('excludes meta description when marked with notranslate', () => {
			const doc = createDocument('<p>Body</p>', '<meta name="description" content="Skip Desc" class="notranslate" />')
			const segments = extractSegments(doc, ['.notranslate'])
			const values = segments.map((s) => s.value)
			expect(values).toContain('Body')
			expect(values).not.toContain('Skip Desc')
		})
	})

	describe('empty selectors', () => {
		it('extracts all content when no selectors provided', () => {
			const doc = createDocument(`
				<p class="notranslate">Would be skipped</p>
				<p>Normal text</p>
			`)
			const segments = extractSegments(doc, [])
			const values = segments.map((s) => s.value)
			expect(values).toContain('Would be skipped')
			expect(values).toContain('Normal text')
		})
	})

	describe('grouped blocks (html kind)', () => {
		it('excludes grouped block content inside skipped element', () => {
			const doc = createDocument(`
				<p notranslate>Text with <strong>bold</strong> inside</p>
				<p>Text with <em>italic</em> outside</p>
			`)
			const segments = extractSegments(doc, ['[notranslate]'])
			// The outside paragraph should be extracted with HTML placeholders
			const htmlSegments = segments.filter((s) => s.kind === 'html')
			expect(htmlSegments.length).toBeGreaterThanOrEqual(1)
			// The skipped content should not appear
			const values = segments.map((s) => s.value)
			expect(values.some((v) => v.includes('italic'))).toBe(true)
			expect(values.some((v) => v.includes('bold'))).toBe(false)
		})
	})
})
