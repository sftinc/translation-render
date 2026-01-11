/**
 * Lang metadata module for linkedom
 * Adds HTML lang attribute and hreflang link tags for SEO
 */

interface HreflangEntry {
	hreflang: string
	href: string
}

/**
 * Extract language code from BCP 47 regional code (e.g., "es-mx" → "es")
 * Preserves script subtag for Chinese (zh-hans, zh-hant)
 */
function getLangCode(bcp47: string): string {
	if (bcp47.startsWith('zh-')) {
		return bcp47
	}
	return bcp47.split('-')[0]
}

/**
 * Update HTML lang attribute to target language
 */
function updateHtmlLang(document: any, targetLang: string): boolean {
	const htmlElement = document.documentElement || document.querySelector('html')

	if (!htmlElement) {
		console.warn('[Lang Metadata] No <html> element found')
		return false
	}

	const currentLang = htmlElement.getAttribute('lang')

	// Only update if missing or incorrect
	const langCode = getLangCode(targetLang)
	if (!currentLang || currentLang !== langCode) {
		htmlElement.setAttribute('lang', langCode)
		return true
	}

	return false
}

/**
 * Get set of existing hreflang values to avoid duplicates
 */
function getExistingHreflangLanguages(document: any): Set<string> {
	const existingLangs = new Set<string>()
	const hreflangLinks = document.querySelectorAll('link[rel="alternate"][hreflang]')

	for (let i = 0; i < hreflangLinks.length; i++) {
		const hreflang = hreflangLinks[i].getAttribute('hreflang')
		if (hreflang) {
			existingLangs.add(hreflang)
		}
	}

	return existingLangs
}

/**
 * Build array of hreflang entries (translated, origin, x-default)
 * Note: All entries use originalPathname for consistency since we don't have
 * translated paths for other language variants
 */
function buildHreflangEntries(
	targetLang: string,
	sourceLang: string,
	currentHost: string,
	originHostname: string,
	originalPathname: string,
	currentUrl: URL
): HreflangEntry[] {
	const entries: HreflangEntry[] = []

	// Determine protocol (http for localhost, https otherwise)
	const currentProtocol = currentHost.startsWith('localhost') ? 'http:' : 'https:'
	const originProtocol = 'https:' // Origin is always HTTPS

	// Build query string (preserve from current request)
	const queryString = currentUrl.search

	// Entry 1: Default fallback (always origin) - MUST BE FIRST
	entries.push({
		hreflang: 'x-default',
		href: `${originProtocol}//${originHostname}${originalPathname}${queryString}`,
	})

	// Entry 2: Origin language
	entries.push({
		hreflang: getLangCode(sourceLang),
		href: `${originProtocol}//${originHostname}${originalPathname}${queryString}`,
	})

	// Entry 3: Current translated language (use original pathname for consistency)
	entries.push({
		hreflang: getLangCode(targetLang),
		href: `${currentProtocol}//${currentHost}${originalPathname}${queryString}`,
	})

	return entries
}

/**
 * Get map of existing hreflang links that should be replaced (their hreflang matches our new entries)
 */
function getHreflangLinksToReplace(
	document: any,
	newHreflangValues: Set<string>
): Map<string, any> {
	const toReplace = new Map<string, any>()
	const hreflangLinks = document.querySelectorAll('link[rel="alternate"][hreflang]')

	for (let i = 0; i < hreflangLinks.length; i++) {
		const link = hreflangLinks[i]
		const hreflang = link.getAttribute('hreflang')

		if (hreflang && newHreflangValues.has(hreflang)) {
			toReplace.set(hreflang, link)
		}
	}

	return toReplace
}

/**
 * Reformat existing hreflang links (that aren't being replaced) to ensure correct attribute order
 * and add type="text/html" if missing
 */
function reformatExistingHreflangLinks(
	document: any,
	toReplace: Map<string, any>
): number {
	const hreflangLinks = document.querySelectorAll('link[rel="alternate"][hreflang]')
	let reformatted = 0

	for (let i = 0; i < hreflangLinks.length; i++) {
		const oldLink = hreflangLinks[i]
		const hreflang = oldLink.getAttribute('hreflang')

		// Skip links that will be replaced
		if (!hreflang || toReplace.has(hreflang)) {
			continue
		}

		// Extract all attributes
		const attributes = oldLink.attributes
		const standardAttrs = {
			rel: oldLink.getAttribute('rel') || 'alternate',
			hreflang: hreflang,
			href: oldLink.getAttribute('href') || '',
			type: oldLink.getAttribute('type') || 'text/html',
		}

		// Collect any extra attributes (beyond the standard four)
		const extraAttrs: { name: string; value: string }[] = []
		for (let j = 0; j < attributes.length; j++) {
			const attr = attributes[j]
			if (!['rel', 'hreflang', 'href', 'type'].includes(attr.name)) {
				extraAttrs.push({ name: attr.name, value: attr.value })
			}
		}

		// Create new link element
		const newLink = document.createElement('link')
		newLink.setAttribute('rel', standardAttrs.rel)
		newLink.setAttribute('hreflang', standardAttrs.hreflang)
		newLink.setAttribute('href', standardAttrs.href)
		newLink.setAttribute('type', standardAttrs.type)

		// Add extra attributes at the end
		for (const attr of extraAttrs) {
			newLink.setAttribute(attr.name, attr.value)
		}

		// Replace old link with new one
		oldLink.parentNode?.replaceChild(newLink, oldLink)
		reformatted++
	}

	return reformatted
}

/**
 * Add hreflang link tags to head element, replacing any that match and grouping with existing ones
 */
function addHreflangLinks(
	document: any,
	entries: HreflangEntry[],
	toReplace: Map<string, any>
): number {
	const headElement = document.querySelector('head')

	if (!headElement) {
		console.warn('[Lang Metadata] No <head> element found')
		return 0
	}

	// Remove all links that will be replaced
	for (const [hreflang, link] of toReplace) {
		link.parentNode?.removeChild(link)
	}

	// Find remaining hreflang links to determine insertion point
	const remainingHreflangLinks = document.querySelectorAll('link[rel="alternate"][hreflang]')
	let insertionPoint: any = null

	if (remainingHreflangLinks.length > 0) {
		// Insert BEFORE the first existing hreflang link (so x-default comes first)
		const firstHreflangLink = remainingHreflangLinks[0]
		insertionPoint = firstHreflangLink
	}

	// Insert new links
	let added = 0

	for (const entry of entries) {
		// Create new link element
		const linkElement = document.createElement('link')
		linkElement.setAttribute('rel', 'alternate')
		linkElement.setAttribute('hreflang', entry.hreflang)
		linkElement.setAttribute('href', entry.href)
		linkElement.setAttribute('type', 'text/html')

		// Insert at the determined position
		if (insertionPoint) {
			// Insert before the insertion point (after last hreflang link)
			headElement.insertBefore(linkElement, insertionPoint)
		} else {
			// No existing hreflang links, append to end of HEAD
			headElement.appendChild(linkElement)
		}

		added++
	}

	return added
}

/**
 * Main exported function - Add or update HTML lang and hreflang links
 */
export function addLangMetadata(
	document: any,
	targetLang: string,
	sourceLang: string,
	currentHost: string,
	originHostname: string,
	originalPathname: string,
	currentUrl: URL
): {
	langUpdated: boolean
	hreflangAdded: number
	hreflangReplaced: number
	hreflangReformatted: number
} {
	// 1. Update HTML lang attribute
	const langUpdated = updateHtmlLang(document, targetLang)

	// 2. Build hreflang entries (x-default first, source lang, target lang)
	const entries = buildHreflangEntries(
		targetLang,
		sourceLang,
		currentHost,
		originHostname,
		originalPathname,
		currentUrl
	)

	// 3. Get new hreflang values we'll be adding
	const newHreflangValues = new Set(entries.map((e) => e.hreflang))

	// 4. Identify existing links that match our hreflang values (will be replaced)
	const toReplace = getHreflangLinksToReplace(document, newHreflangValues)

	// 5. Reformat remaining existing links (add type if missing, fix order)
	const hreflangReformatted = reformatExistingHreflangLinks(document, toReplace)

	// 6. Add new hreflang links (removes duplicates and inserts at correct position)
	const hreflangAdded = addHreflangLinks(document, entries, toReplace)

	// 7. Return detailed results
	return {
		langUpdated,
		hreflangAdded,
		hreflangReplaced: toReplace.size,
		hreflangReformatted,
	}
}
