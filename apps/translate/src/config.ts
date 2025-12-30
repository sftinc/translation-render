/**
 * Configuration constants for the translation proxy
 * All values from MVP.md specification
 */

import type { HostSettings } from './types.js'

// Host to settings mapping (hardcoded for MVP)
export const HOST_SETTINGS: Record<string, HostSettings> = {
	'es.esnipe.com': {
		origin: 'https://www.esnipe.com',
		sourceLang: 'en',
		targetLang: 'es',
		skipWords: ['eSnipe', 'eBay'],
		skipPatterns: ['pii', 'numeric'],
		translatePath: true,
		skipPath: [],
		proxiedCache: 5, // Cache for 5 minutes
	},
	'fr.esnipe.com': {
		origin: 'https://www.esnipe.com',
		sourceLang: 'en',
		targetLang: 'fr',
		skipWords: ['eSnipe', 'eBay'],
		skipPatterns: ['pii', 'numeric'],
		translatePath: true,
		skipPath: [],
		proxiedCache: 10, // Cache for 10 minutes
	},
	localhost: {
		origin: 'https://www.esnipe.com',
		sourceLang: 'en',
		targetLang: 'es',
		skipWords: ['eSnipe', 'eBay'],
		skipPatterns: ['pii', 'numeric'],
		translatePath: true,
		skipPath: ['/api/', /^\/admin/],
		proxiedCache: 0, // No caching for development (use origin headers)
	},
}

// DOM traversal skip rules
export const SKIP_SELECTORS = ['.translate-none', '.notranslate', '[notranslate]']
export const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'textarea', 'code'])

// Attributes to translate
export const TRANSLATE_ATTRS = ['title', 'placeholder', 'aria-label', 'alt']

// Google Translation API limits
export const MAX_TRANSLATE_ITEMS = 128 // Max strings per request
export const MAX_TRANSLATE_CHARS = 30000 // Max characters per request

// Development/debugging
export const DEBUG_MODE = true // Set to false in production
