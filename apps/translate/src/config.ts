/**
 * Configuration constants for the translation proxy
 * All values from MVP.md specification
 */

import type { HtmlTagType } from './types.js'

// DOM traversal skip rules
export const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'textarea', 'code'])

// HTML placeholder configuration for inline element grouping
export const HTML_TAG_MAP: Record<string, HtmlTagType> = {
	// Paired tags
	b: 'HB',
	strong: 'HB',
	em: 'HE',
	i: 'HE',
	a: 'HA',
	span: 'HS',
	// Generic paired tags
	u: 'HG',
	sub: 'HG',
	sup: 'HG',
	mark: 'HG',
	small: 'HG',
	s: 'HG',
	del: 'HG',
	ins: 'HG',
	abbr: 'HG',
	q: 'HG',
	cite: 'HG',
	code: 'HG',
	kbd: 'HG',
	time: 'HG',
	// Void tags (HV = HTML Void, no closing placeholder)
	br: 'HV',
	hr: 'HV',
	img: 'HV',
	wbr: 'HV',
}

// Set of void tags (to know not to look for closing tag)
export const VOID_TAGS = new Set(['br', 'hr', 'img', 'wbr'])

// Tags considered inline for grouping purposes
export const INLINE_TAGS = new Set([
	'b',
	'strong',
	'em',
	'i',
	'a',
	'span',
	'br',
	'img',
	'wbr',
	'sub',
	'sup',
	'small',
	'mark',
	'u',
	's',
	'del',
	'ins',
	'abbr',
	'time',
	'code',
	'kbd',
	'q',
	'cite',
])

// Block-level tags that may contain groupable inline content
export const BLOCK_TAGS = new Set([
	'p',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'li',
	'td',
	'th',
	'dd',
	'dt',
	'figcaption',
	'caption',
	'label',
	'legend',
	'summary',
	'pre',
])

// Attributes to translate
export const TRANSLATE_ATTRS = ['title', 'placeholder', 'aria-label', 'alt']

// Google Translation API limits
export const MAX_TRANSLATE_ITEMS = 128 // Max strings per request
export const MAX_TRANSLATE_CHARS = 30000 // Max characters per request

// Timeout constants
export const TIMEOUT_FETCHER = 5_000 // 5s for HTML fetches (fast failure)
export const TIMEOUT_TRANSLATION = 10_000 // 10s for LLM calls (higher latency)

// Development/debugging
export const DEBUG_MODE = true // Set to false in production
