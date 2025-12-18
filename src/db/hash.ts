/**
 * Text hashing utility for translation lookups
 * Uses SHA-256 truncated to 16 chars for the text_hash column
 */

import { createHash } from 'crypto'

/**
 * Generate a hash for translation text lookup
 * Uses SHA-256 truncated to 16 chars for space efficiency
 *
 * @param text - The text to hash
 * @returns 16-character hex hash
 */
export function hashText(text: string): string {
	return createHash('sha256').update(text).digest('hex').slice(0, 16)
}
