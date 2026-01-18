/**
 * HTML placeholder conversion for inline element grouping
 * Converts inline tags to placeholders for single-segment translation
 */

import { HTML_TAG_MAP, INLINE_TAGS, SKIP_TAGS, VOID_TAGS } from '../config.js'
import type { HtmlTagReplacement } from '../types.js'

/**
 * Check if an element contains only text and inline elements (groupable)
 * Recursively checks all descendants
 * @param element - DOM element to check
 * @returns true if element can be grouped into a single segment
 */
export function isGroupableElement(element: Element): boolean {
	const children = element.childNodes

	for (let i = 0; i < children.length; i++) {
		const child = children[i]

		// Text nodes are always OK
		if (child.nodeType === 3) continue

		// Element nodes must be inline tags and not skip tags
		if (child.nodeType === 1) {
			const tagName = (child as Element).tagName.toLowerCase()
			if (!INLINE_TAGS.has(tagName) || SKIP_TAGS.has(tagName)) {
				return false // Contains block or skip element - not groupable
			}
			// Recursively check nested elements
			if (!isGroupableElement(child as Element)) {
				return false
			}
		}
	}

	return true
}

/**
 * Normalize whitespace in HTML content
 * - Replace newlines/returns with spaces
 * - Collapse multiple spaces to single space
 * @param text - Text to normalize
 * @returns Normalized text
 */
export function normalizeWhitespace(text: string): string {
	return text
		.replace(/[\r\n\t]+/g, ' ') // Replace newlines/tabs with space
		.replace(/\s+/g, ' ') // Collapse multiple spaces
}

/**
 * Convert innerHTML to placeholdered text
 * Replaces HTML tags with indexed placeholders
 * @param innerHTML - The original innerHTML string
 * @param preserveWhitespace - If true, skip whitespace normalization (for pre tags)
 * @returns Object with placeholdered text and replacement metadata
 */
export function htmlToPlaceholders(innerHTML: string, preserveWhitespace = false): {
	text: string
	replacements: HtmlTagReplacement[]
} {
	const replacements: HtmlTagReplacement[] = []
	const tagCounters: Record<string, number> = {}

	// Normalize whitespace (skip for pre tags to preserve line breaks)
	let result = preserveWhitespace ? innerHTML : normalizeWhitespace(innerHTML)

	// Decode numeric HTML entities to actual characters
	// Prevents applyPatterns from corrupting &#160; → &#[N1];
	result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))

	// Regex to match HTML tags (opening, closing, and self-closing)
	// Captures: full match, slash for closing, tag name, attributes
	const tagRegex = /<(\/?)(\w+)([^>]*)>/g

	// First pass: collect all tags with their positions
	interface TagMatch {
		fullMatch: string
		isClose: boolean
		tagName: string
		attrs: string
		index: number
		placeholder?: string // Assigned during processing
	}
	const tags: TagMatch[] = []
	let match: RegExpExecArray | null

	while ((match = tagRegex.exec(result)) !== null) {
		tags.push({
			fullMatch: match[0],
			isClose: match[1] === '/',
			tagName: match[2].toLowerCase(),
			attrs: match[3],
			index: match.index,
		})
	}

	// Process tags to build replacements
	// Use a stack to match opening/closing tags
	interface OpenTag {
		tagName: string
		placeholder: string
		openTag: string
		tagIndex: number // Index in tags array for later placeholder assignment
	}
	const openTagStack: OpenTag[] = []

	for (let tagIdx = 0; tagIdx < tags.length; tagIdx++) {
		const tag = tags[tagIdx]
		const placeholderType = HTML_TAG_MAP[tag.tagName]

		// Skip unknown tags (leave them as-is)
		if (!placeholderType) {
			continue
		}

		if (VOID_TAGS.has(tag.tagName)) {
			// Void tag - no closing tag needed
			tagCounters[placeholderType] = (tagCounters[placeholderType] || 0) + 1
			const idx = tagCounters[placeholderType]
			const placeholder = `[${placeholderType}${idx}]`

			replacements.push({
				placeholder,
				openTag: tag.fullMatch,
				tagName: tag.tagName,
				// No closePlaceholder or closeTag for void tags
			})

			tag.placeholder = placeholder
		} else if (!tag.isClose) {
			// Opening tag
			tagCounters[placeholderType] = (tagCounters[placeholderType] || 0) + 1
			const idx = tagCounters[placeholderType]
			const placeholder = `[${placeholderType}${idx}]`

			openTagStack.push({
				tagName: tag.tagName,
				placeholder,
				openTag: tag.fullMatch,
				tagIndex: tagIdx,
			})

			tag.placeholder = placeholder
		} else {
			// Closing tag - find matching open tag (from end of stack)
			for (let i = openTagStack.length - 1; i >= 0; i--) {
				if (openTagStack[i].tagName === tag.tagName) {
					const openTagInfo = openTagStack[i]
					const openTag = tags[openTagInfo.tagIndex]

					// Check if there's content between open and close tags
					const contentStart = openTag.index + openTag.fullMatch.length
					const contentBetween = result.substring(contentStart, tag.index)

					if (contentBetween === '') {
						// Truly empty tag (e.g., FA icon) - treat as void element
						// Decrement the original counter to avoid gaps (opening tag already incremented it)
						const originalType = HTML_TAG_MAP[openTagInfo.tagName]
						tagCounters[originalType]--

						tagCounters['HV'] = (tagCounters['HV'] || 0) + 1
						const idx = tagCounters['HV']
						const placeholder = `[HV${idx}]`

						replacements.push({
							placeholder,
							openTag: openTag.fullMatch + tag.fullMatch,
							tagName: openTag.tagName,
						})

						// Replace opening tag with void placeholder, mark closing for removal
						openTag.placeholder = placeholder
						tag.placeholder = '' // Empty string marks for removal
					} else {
						// Normal paired tag with content
						const closePlaceholder = openTagInfo.placeholder.replace('[', '[/')

						replacements.push({
							placeholder: openTagInfo.placeholder,
							closePlaceholder,
							openTag: openTagInfo.openTag,
							closeTag: tag.fullMatch,
							tagName: tag.tagName,
						})

						tag.placeholder = closePlaceholder
					}

					openTagStack.splice(i, 1)
					break
				}
			}
		}
	}

	// Replace all tags with placeholders (process in reverse order to maintain positions)
	// Sort by index descending
	const sortedTags = [...tags].sort((a, b) => b.index - a.index)
	for (const tag of sortedTags) {
		if (tag.placeholder !== undefined) {
			result = result.substring(0, tag.index) + tag.placeholder + result.substring(tag.index + tag.fullMatch.length)
		}
	}

	return { text: result.trim(), replacements }
}

/**
 * Restore HTML from placeholdered text
 * @param text - Text with placeholders
 * @param replacements - Replacement metadata from htmlToPlaceholders
 * @returns Restored HTML string
 */
export function placeholdersToHtml(text: string, replacements: HtmlTagReplacement[]): string {
	let result = text

	for (const replacement of replacements) {
		// Replace opening placeholder with original tag
		result = result.replace(replacement.placeholder, replacement.openTag)

		// Replace closing placeholder if present (not for void tags)
		if (replacement.closePlaceholder && replacement.closeTag) {
			result = result.replace(replacement.closePlaceholder, replacement.closeTag)
		}
	}

	return result
}

/**
 * Check if HTML contains actual text content (not just tags/whitespace)
 * @param html - HTML string to check
 * @returns true if there is text content to translate
 */
export function containsText(html: string): boolean {
	const textOnly = html.replace(/<[^>]+>/g, '').trim()
	return textOnly.length > 0
}
