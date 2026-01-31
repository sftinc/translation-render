/**
 * Tests for DOM application with skip selectors
 * Verifies that translations are applied correctly and skipped elements remain unchanged
 */

import { describe, it, expect } from 'vitest'
import { parseHTML } from 'linkedom'
import { extractSegments } from './dom-extractor.js'
import { applyTranslations } from './dom-applicator.js'

// Helper to create a document with the given HTML
function createDocument(bodyHtml: string, headHtml = ''): Document {
	const { document } = parseHTML(`<!DOCTYPE html><html><head>${headHtml}</head><body>${bodyHtml}</body></html>`)
	return document
}

describe('applyTranslations with skipSelectors', () => {
	describe('basic application', () => {
		it('applies translations to non-skipped elements', () => {
			const doc = createDocument('<p>Hello</p><p>World</p>')
			const skipSelectors = ['.notranslate']
			const segments = extractSegments(doc, skipSelectors)
			const translations = ['Hola', 'Mundo']

			applyTranslations(doc, translations, segments, skipSelectors)

			const paragraphs = doc.querySelectorAll('p')
			expect(paragraphs[0].textContent).toBe('Hola')
			expect(paragraphs[1].textContent).toBe('Mundo')
		})

		it('does not apply translations to skipped elements', () => {
			const doc = createDocument('<p>Hello</p><p class="notranslate">Keep English</p><p>World</p>')
			const skipSelectors = ['.notranslate']
			const segments = extractSegments(doc, skipSelectors)
			// Only 2 segments: "Hello" and "World" (skipped element is excluded)
			const translations = ['Hola', 'Mundo']

			applyTranslations(doc, translations, segments, skipSelectors)

			const paragraphs = doc.querySelectorAll('p')
			expect(paragraphs[0].textContent).toBe('Hola')
			expect(paragraphs[1].textContent).toBe('Keep English') // Unchanged
			expect(paragraphs[2].textContent).toBe('Mundo')
		})
	})

	describe('index mapping consistency', () => {
		it('maintains correct index mapping with skipped elements', () => {
			const doc = createDocument(`
				<p>First</p>
				<p notranslate>Skip me</p>
				<p>Second</p>
				<p notranslate>Skip too</p>
				<p>Third</p>
			`)
			const skipSelectors = ['[notranslate]']
			const segments = extractSegments(doc, skipSelectors)
			// Should have 3 segments: "First", "Second", "Third"
			expect(segments.length).toBe(3)
			expect(segments[0].value).toBe('First')
			expect(segments[1].value).toBe('Second')
			expect(segments[2].value).toBe('Third')

			const translations = ['Primero', 'Segundo', 'Tercero']
			applyTranslations(doc, translations, segments, skipSelectors)

			const paragraphs = doc.querySelectorAll('p')
			expect(paragraphs[0].textContent).toBe('Primero')
			expect(paragraphs[1].textContent).toBe('Skip me') // Unchanged
			expect(paragraphs[2].textContent).toBe('Segundo')
			expect(paragraphs[3].textContent).toBe('Skip too') // Unchanged
			expect(paragraphs[4].textContent).toBe('Tercero')
		})

		it('handles nested skipped elements correctly', () => {
			const doc = createDocument(`
				<div>
					<p>Outer text</p>
					<div class="notranslate">
						<p>Inner skipped</p>
					</div>
					<p>More outer</p>
				</div>
			`)
			const skipSelectors = ['.notranslate']
			const segments = extractSegments(doc, skipSelectors)
			// Should have 2 segments: "Outer text", "More outer"
			expect(segments.length).toBe(2)

			const translations = ['Texto exterior', 'Más exterior']
			applyTranslations(doc, translations, segments, skipSelectors)

			const allP = doc.querySelectorAll('p')
			expect(allP[0].textContent).toBe('Texto exterior')
			expect(allP[1].textContent).toBe('Inner skipped') // Unchanged
			expect(allP[2].textContent).toBe('Más exterior')
		})
	})

	describe('attributes', () => {
		it('applies translations to attributes on non-skipped elements', () => {
			const doc = createDocument(`
				<img alt="Image description" />
				<img alt="Skipped description" class="notranslate" />
			`)
			const skipSelectors = ['.notranslate']
			const segments = extractSegments(doc, skipSelectors)
			// Only 1 segment: "Image description"
			expect(segments.length).toBe(1)

			const translations = ['Descripción de imagen']
			applyTranslations(doc, translations, segments, skipSelectors)

			const images = doc.querySelectorAll('img')
			expect(images[0].getAttribute('alt')).toBe('Descripción de imagen')
			expect(images[1].getAttribute('alt')).toBe('Skipped description') // Unchanged
		})
	})

	describe('head elements', () => {
		it('applies translation to title when not skipped', () => {
			const doc = createDocument('<p>Body</p>', '<title>Page Title</title>')
			const skipSelectors = ['.notranslate']
			const segments = extractSegments(doc, skipSelectors)
			// Should have "Page Title" and "Body"
			expect(segments.map((s) => s.value)).toContain('Page Title')
			expect(segments.map((s) => s.value)).toContain('Body')

			// Find index of title segment (it should be first)
			const titleIndex = segments.findIndex((s) => s.value === 'Page Title')
			const bodyIndex = segments.findIndex((s) => s.value === 'Body')

			const translations = segments.map((s, i) => {
				if (i === titleIndex) return 'Título de página'
				if (i === bodyIndex) return 'Cuerpo'
				return s.value
			})

			applyTranslations(doc, translations, segments, skipSelectors)

			expect(doc.querySelector('title')?.textContent).toBe('Título de página')
			expect(doc.querySelector('p')?.textContent).toBe('Cuerpo')
		})

		it('does not apply translation to skipped title', () => {
			const doc = createDocument('<p>Body</p>', '<title class="notranslate">Keep Title</title>')
			const skipSelectors = ['.notranslate']
			const segments = extractSegments(doc, skipSelectors)
			// Should only have "Body"
			expect(segments.map((s) => s.value)).not.toContain('Keep Title')
			expect(segments.map((s) => s.value)).toContain('Body')

			const translations = ['Cuerpo']
			applyTranslations(doc, translations, segments, skipSelectors)

			expect(doc.querySelector('title')?.textContent).toBe('Keep Title') // Unchanged
			expect(doc.querySelector('p')?.textContent).toBe('Cuerpo')
		})
	})

	describe('custom selectors', () => {
		it('respects custom skip selectors during application', () => {
			const doc = createDocument(`
				<p>Translate me</p>
				<p data-preserve>Keep original</p>
			`)
			const skipSelectors = ['[data-preserve]']
			const segments = extractSegments(doc, skipSelectors)
			expect(segments.length).toBe(1)

			const translations = ['Tradúceme']
			applyTranslations(doc, translations, segments, skipSelectors)

			const paragraphs = doc.querySelectorAll('p')
			expect(paragraphs[0].textContent).toBe('Tradúceme')
			expect(paragraphs[1].textContent).toBe('Keep original')
		})
	})

	describe('empty selectors', () => {
		it('applies all translations when no selectors provided', () => {
			const doc = createDocument('<p class="notranslate">First</p><p>Second</p>')
			const skipSelectors: string[] = []
			const segments = extractSegments(doc, skipSelectors)
			// Both segments should be extracted
			expect(segments.length).toBe(2)

			const translations = ['Primero', 'Segundo']
			applyTranslations(doc, translations, segments, skipSelectors)

			const paragraphs = doc.querySelectorAll('p')
			expect(paragraphs[0].textContent).toBe('Primero')
			expect(paragraphs[1].textContent).toBe('Segundo')
		})
	})

	describe('return value', () => {
		it('returns count of translations applied', () => {
			const doc = createDocument('<p>One</p><p>Two</p><p class="notranslate">Skip</p>')
			const skipSelectors = ['.notranslate']
			const segments = extractSegments(doc, skipSelectors)
			const translations = ['Uno', 'Dos']

			const count = applyTranslations(doc, translations, segments, skipSelectors)
			expect(count).toBe(2)
		})
	})
})
