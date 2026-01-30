import { describe, it, expect } from 'vitest'
import { toAsciiPathname } from './ascii-pathname.js'

describe('toAsciiPathname', () => {
	describe('placeholder preservation', () => {
		// Paths currently use: E (email), I (identifier), N (number)
		// Regex is [A-Z]+\d+ to be defensive against future placeholder types
		it('preserves path placeholders [N1], [E1], [I1]', () => {
			expect(toAsciiPathname('/article/[N1]-title')).toBe('/article/[N1]-title')
			expect(toAsciiPathname('/contact/[E1]')).toBe('/contact/[E1]')
			expect(toAsciiPathname('/user/[I1]/profile')).toBe('/user/[I1]/profile')
		})

		it('preserves any uppercase letter placeholder for future-proofing', () => {
			expect(toAsciiPathname('/page/[X1]')).toBe('/page/[X1]')
			expect(toAsciiPathname('/page/[ABC1]')).toBe('/page/[ABC1]')
		})

		it('preserves multiple placeholders in same path', () => {
			expect(toAsciiPathname('/[N1]/[N2]/[N3]')).toBe('/[N1]/[N2]/[N3]')
			expect(toAsciiPathname('/article/[N1]-[E1]-details')).toBe('/article/[N1]-[E1]-details')
		})

		it('preserves placeholders with multi-digit numbers', () => {
			expect(toAsciiPathname('/page/[N12]')).toBe('/page/[N12]')
			expect(toAsciiPathname('/user/[I99]')).toBe('/user/[I99]')
		})
	})

	describe('ASCII conversion', () => {
		it('converts accented characters to ASCII', () => {
			expect(toAsciiPathname('/producto/diseño')).toBe('/producto/diseno')
			expect(toAsciiPathname('/café/menú')).toBe('/cafe/menu')
			expect(toAsciiPathname('/artículo/información')).toBe('/articulo/informacion')
		})

		it('converts umlauts and other diacritics', () => {
			expect(toAsciiPathname('/über/größe')).toBe('/uber/grosse')
			expect(toAsciiPathname('/naïve/café')).toBe('/naive/cafe')
		})

		it('preserves already-ASCII paths', () => {
			expect(toAsciiPathname('/products/item-123')).toBe('/products/item-123')
			expect(toAsciiPathname('/user/profile.html')).toBe('/user/profile.html')
		})

		it('removes non-URL-safe characters', () => {
			expect(toAsciiPathname('/path with spaces')).toBe('/pathwithspaces')
			expect(toAsciiPathname('/path<script>')).toBe('/pathscript')
		})
	})

	describe('combined placeholder and ASCII conversion', () => {
		it('converts accents while preserving placeholders', () => {
			expect(toAsciiPathname('/ayuda/artículo/[N1]-información')).toBe('/ayuda/articulo/[N1]-informacion')
			expect(toAsciiPathname('/[N1]-diseño-[E1]')).toBe('/[N1]-diseno-[E1]')
		})
	})
})
