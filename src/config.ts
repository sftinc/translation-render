/**
 * Configuration constants for the translation proxy
 * All values from MVP.md specification
 */

import type { HostSettings } from './types'

// Host to settings mapping (hardcoded for MVP)
export const HOST_SETTINGS: Record<string, HostSettings> = {
	'sp.find-your-item.com': {
		origin: 'https://www.esnipe.com',
		sourceLang: 'en',
		targetLang: 'sp',
		skipWords: ['eSnipe'],
		skipPatterns: ['pii', 'numeric'],
		translatePath: true,
		skipPath: ['/api/', /^\/admin/],
		proxiedCache: 1, // Cache for 1 minute
	},
	'fr.find-your-item.com': {
		origin: 'https://www.esnipe.com',
		sourceLang: 'en',
		targetLang: 'fr',
		skipWords: ['eSnipe'],
		skipPatterns: ['pii', 'numeric'],
		translatePath: true,
		skipPath: ['/api/', /^\/admin/],
		proxiedCache: 1, // Cache for 1 minute
	},
	localhost: {
		origin: 'https://www.esnipe.com',
		sourceLang: 'en',
		targetLang: 'sp',
		skipWords: ['eSnipe', 'eBay'],
		skipPatterns: ['pii', 'numeric'],
		translatePath: true,
		skipPath: [],
		proxiedCache: 2, // No caching for development (use origin headers)
	},
}

// DOM traversal skip rules
export const SKIP_SELECTORS = ['.notranslate', '[notranslate]']
export const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'textarea', 'code'])

// Attributes to translate
export const TRANSLATE_ATTRS = ['title', 'placeholder', 'aria-label', 'alt']

// Google Translation API limits
export const MAX_TRANSLATE_ITEMS = 128 // Max strings per request
export const MAX_TRANSLATE_CHARS = 30000 // Max characters per request

// Development/debugging
export const DEBUG_MODE = true // Set to false in production
