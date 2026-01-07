/**
 * Utility functions for the www app
 */

/**
 * Concatenate class names, filtering out falsy values
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
	return classes.filter(Boolean).join(' ')
}

/**
 * Format a number with locale-appropriate separators
 */
export function formatNumber(num: number): string {
	return num.toLocaleString()
}

/**
 * Get language display name from code
 */
export function getLanguageName(code: string): string {
	const languages: Record<string, string> = {
		en: 'English',
		es: 'Spanish',
		fr: 'French',
		de: 'German',
		it: 'Italian',
		pt: 'Portuguese',
		nl: 'Dutch',
		pl: 'Polish',
		ru: 'Russian',
		ja: 'Japanese',
		ko: 'Korean',
		zh: 'Chinese',
		ar: 'Arabic',
		hi: 'Hindi',
	}
	return languages[code.toLowerCase()] || code.toUpperCase()
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text
	return text.slice(0, maxLength - 1) + '\u2026'
}
