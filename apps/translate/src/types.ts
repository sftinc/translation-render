/**
 * TypeScript type definitions for the translation proxy
 */

/**
 * Per-host configuration settings
 */
export interface HostSettings {
	origin: string // Origin server URL (e.g., 'https://www.esnipe.com')
	sourceLang: string // Source language code (e.g., 'en')
	targetLang: string // Target language code (e.g., 'es', 'fr', 'de')
	skipWords?: string[] // Words that should never be translated (e.g., product names)
	skipPatterns?: PatternType[] // Pattern types to normalize (e.g., ['numeric'] for numbers)
	translatePath?: boolean // Whether to translate path names (e.g., /products → /productos)
	skipPath?: (string | RegExp)[] // Path patterns to skip translation (e.g., ['/api/', /^\/admin/])
	proxiedCache?: number // Cache duration in minutes for proxied resources (0 = no caching, default: 0)
}

/**
 * Pattern type for text normalization during translation
 */
export type PatternType = 'numeric' | 'pii' // Future: 'date' | 'time' | 'currency'

/**
 * Represents a pattern replacement (original values → placeholders)
 */
export interface PatternReplacement {
	pattern: PatternType
	placeholder: string // e.g., '[N]', '[D]', '[T]'
	values: string[] // Ordered list of replaced values
}

/**
 * Text with patterns normalized for caching
 */
export interface PatternizedText {
	original: string // Original: "Price 123.00 USD"
	normalized: string // Normalized: "Price [N1] USD"
	replacements: PatternReplacement[]
	isUpperCase?: boolean // Tracks if original text was all uppercase
}

/**
 * Represents a skip word replacement (original word → placeholder)
 */
export interface SkipWordReplacement {
	original: string // The original skip word
	placeholder: string // The placeholder (e.g., '[S1]')
}

/**
 * HTML tag types for placeholder conversion
 * Used to normalize different tags to consistent placeholders
 */
export type HtmlTagType = 'HB' | 'HE' | 'HA' | 'HS' | 'HG' | 'HV'

/**
 * Represents an HTML tag replacement (tag → placeholder)
 * Unified interface for both paired tags and void tags
 */
export interface HtmlTagReplacement {
	placeholder: string // '[HB1]' or '[HG1]'
	closePlaceholder?: string // '[/HB1]' - undefined for void tags
	openTag: string // '<strong class="red">' or '<br>'
	closeTag?: string // '</strong>' - undefined for void tags
	tagName: string // 'strong' or 'br'
}

/**
 * Metadata for HTML placeholder segments
 * Stores original HTML and replacement data for restoration
 */
export interface HtmlPlaceholderMeta {
	originalInnerHTML: string
	replacements: HtmlTagReplacement[]
	element: Element // DOM reference for application
}

/**
 * A content item to be translated
 * Can be a text node, an attribute value, a path name, or grouped HTML
 */
export interface Content {
	kind: 'text' | 'attr' | 'path' | 'html'
	attr?: string // Attribute name (e.g., 'title', 'alt'), only present if kind === 'attr'
	value: string // The text content or pathname to translate
	ws?: { leading: string; trailing: string } // Whitespace metadata (optional, for backward compatibility)
	htmlMeta?: HtmlPlaceholderMeta // Only present if kind === 'html'
}

/**
 * Translation item with type discrimination for prompt selection
 * Used by translate.ts to route to segment vs pathname translation prompts
 */
export interface TranslationItem {
	text: string // The text to translate
	type: 'segment' | 'pathname' // Type determines which prompt to use
}

/**
 * Environment variables available to the server
 */
export interface Env {
	OPENROUTER_API_KEY: string // OpenRouter API key for translation
	GOOGLE_PROJECT_ID: string // Google Cloud project ID (legacy, may be removed)
}

/**
 * Result from translating a batch of content items
 */
export interface TranslationResult {
	originalContent: Content[]
	translatedTexts: string[] // Parallel array to originalContent
	targetLanguage: string
}

/**
 * Cache configuration
 */
export interface CacheConfig {
	ttlSeconds: number
	bypassCookies: string[]
}

/**
 * Statistics about a translation operation
 */
export interface TranslationStats {
	extractedSegments: number
	uniqueStrings: number
	translationBatches: number
	renderTimeMs: number
	translationTimeMs: number
}

/**
 * Segment cache stored per origin+language (domain-wide scope)
 * Single cache accumulates ALL segment translations across entire site
 *
 * Key format: segments::{lang}::{originDomain}
 * Example key: segments::es::www.esnipe.com
 *
 * Value format: Hash map for O(1) lookups
 * Example value: { "Add to Cart": "Agregar al carrito", "Price [N1]": "Precio [N1]" }
 *
 * Note: Keys are normalized text with patterns applied (e.g., "Price [N1]")
 * Pattern restoration happens at DOM application time, not at cache storage time.
 */
export type SegmentCache = Record<string, string>

/**
 * Pathname mapping cache stored per origin+language
 * Enables bidirectional lookup: English ↔ Translated pathnames
 *
 * Key format: pathnames::{lang}::{originDomain}
 * Example key: pathnames::es::www.esnipe.com
 *
 * Value format: Dual-object structure with forward and reverse mappings
 * Example value:
 * {
 *   "origin": {
 *     "/pricing": "/preise",
 *     "/about": "/uber"
 *   },
 *   "translated": {
 *     "/preise": "/pricing",
 *     "/uber": "/about"
 *   }
 * }
 *
 * Note: All pathnames are normalized (with pattern placeholders like [N1])
 * This enables cache hits across different numeric values
 */
export type PathnameMapping = {
	origin: Record<string, string> // original pathname → translated pathname
	translated: Record<string, string> // translated pathname → original pathname
}

/**
 * Result from translateSegments() including translations and deduplication stats
 */
export interface TranslateStats {
	translations: string[] // Translated segments in original order
	uniqueCount: number // Count of unique strings after deduplication
	batchCount: number // Number of batches sent to translation API
}
