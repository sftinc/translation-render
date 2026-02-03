/**
 * Tests for Recovery Asset Injector
 */

import { describe, it, expect } from 'vitest'
import { parseHTMLDocument } from '../dom/parser.js'
import { injectRecoveryAssets, markSkippedElements, getRecoveryScript } from './injector.js'
import type { TranslationDictionary } from './dictionary-builder.js'

describe('markSkippedElements', () => {
	it('marks elements matching skip selectors', () => {
		const { document } = parseHTMLDocument(`
			<!DOCTYPE html>
			<html>
				<head><title>Test</title></head>
				<body>
					<div class="skip-me">Skip this</div>
					<div class="translate">Translate this</div>
					<nav id="nav-skip">Navigation</nav>
				</body>
			</html>
		`)

		markSkippedElements(document, ['.skip-me', '#nav-skip'])

		const skipMe = document.querySelector('.skip-me')
		const translate = document.querySelector('.translate')
		const navSkip = document.querySelector('#nav-skip')

		expect(skipMe?.hasAttribute('data-pantolingo-skip')).toBe(true)
		expect(translate?.hasAttribute('data-pantolingo-skip')).toBe(false)
		expect(navSkip?.hasAttribute('data-pantolingo-skip')).toBe(true)
	})

	it('handles empty skip selectors', () => {
		const { document } = parseHTMLDocument(`
			<!DOCTYPE html>
			<html>
				<head><title>Test</title></head>
				<body><div>Content</div></body>
			</html>
		`)

		// Should not throw
		markSkippedElements(document, [])

		const div = document.querySelector('div')
		expect(div?.hasAttribute('data-pantolingo-skip')).toBe(false)
	})

	it('handles invalid selectors gracefully', () => {
		const { document } = parseHTMLDocument(`
			<!DOCTYPE html>
			<html>
				<head><title>Test</title></head>
				<body><div class="valid">Content</div></body>
			</html>
		`)

		// Should not throw even with invalid selector
		expect(() => {
			markSkippedElements(document, ['.valid', '[invalid[['])
		}).not.toThrow()

		const valid = document.querySelector('.valid')
		expect(valid?.hasAttribute('data-pantolingo-skip')).toBe(true)
	})
})

describe('injectRecoveryAssets', () => {
	const mockDictionary: TranslationDictionary = {
		text: { Hello: 'Hola', World: 'Mundo' },
		html: { 'Hello world': '<em>Hola</em> mundo' },
		attrs: { Search: 'Buscar' },
		paths: { '/about': '/acerca-de' },
		targetLang: 'es',
	}

	it('injects flicker guard CSS in head', () => {
		const { document } = parseHTMLDocument(`
			<!DOCTYPE html>
			<html>
				<head><title>Test</title></head>
				<body><p>Content</p></body>
			</html>
		`)

		injectRecoveryAssets(document, mockDictionary)

		const style = document.querySelector('style[data-pantolingo="flicker-guard"]')
		expect(style).not.toBeNull()
		expect(style?.textContent).toContain('body:not(.pantolingo-ready)')
		expect(style?.textContent).toContain('opacity:0')
	})

	it('injects recovery script reference in body', () => {
		const { document } = parseHTMLDocument(`
			<!DOCTYPE html>
			<html>
				<head><title>Test</title></head>
				<body><p>Content</p></body>
			</html>
		`)

		injectRecoveryAssets(document, mockDictionary)

		const script = document.querySelector('body script[data-pantolingo="recovery"]')
		expect(script).not.toBeNull()
		expect(script?.getAttribute('src')).toBe('/__pantolingo/recovery.js')
		expect(script?.hasAttribute('defer')).toBe(true)
	})

	it('injects dictionary script before </body>', () => {
		const { document } = parseHTMLDocument(`
			<!DOCTYPE html>
			<html>
				<head><title>Test</title></head>
				<body><p>Content</p></body>
			</html>
		`)

		injectRecoveryAssets(document, mockDictionary)

		const dictScript = document.querySelector('script[data-pantolingo="dictionary"]')
		expect(dictScript).not.toBeNull()
		expect(dictScript?.textContent).toContain('window.__PANTOLINGO_RECOVERY__')
		expect(dictScript?.textContent).toContain('"Hello":"Hola"')
		expect(dictScript?.textContent).toContain('"lang":"es"')
	})

	it('places flicker guard CSS at the start of head', () => {
		const { document } = parseHTMLDocument(`
			<!DOCTYPE html>
			<html>
				<head>
					<meta charset="utf-8">
					<title>Test</title>
				</head>
				<body><p>Content</p></body>
			</html>
		`)

		injectRecoveryAssets(document, mockDictionary)

		const head = document.head
		const firstChild = head?.firstChild
		expect(firstChild?.nodeName.toLowerCase()).toBe('style')
	})

	it('handles empty dictionary', () => {
		const { document } = parseHTMLDocument(`
			<!DOCTYPE html>
			<html>
				<head><title>Test</title></head>
				<body><p>Content</p></body>
			</html>
		`)

		const emptyDict: TranslationDictionary = {
			text: {},
			html: {},
			attrs: {},
			paths: {},
			targetLang: 'es',
		}

		injectRecoveryAssets(document, emptyDict)

		const dictScript = document.querySelector('script[data-pantolingo="dictionary"]')
		expect(dictScript).not.toBeNull()
		expect(dictScript?.textContent).toContain('"text":{}')
	})
})

describe('getRecoveryScript', () => {
	it('returns non-empty script content', () => {
		const script = getRecoveryScript()
		expect(script.length).toBeGreaterThan(0)
	})

	it('contains IIFE wrapper', () => {
		const script = getRecoveryScript()
		expect(script).toMatch(/^\(function\(\)\{/)
		expect(script).toMatch(/\}\)\(\);$/)
	})

	it('contains expected recovery functions', () => {
		const script = getRecoveryScript()
		expect(script).toContain('__PANTOLINGO_RECOVERY__')
		expect(script).toContain('pantolingo-ready')
		expect(script).toContain('MutationObserver')
	})
})
