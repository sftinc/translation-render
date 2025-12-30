/**
 * Link rewriting module for linkedom
 * Rewrites all internal links and resource URLs to point to translated subdomain
 */

/**
 * Check if URL has a resource file extension (not an HTML page)
 * @param url - URL string to check
 * @returns true if URL appears to be a resource file
 */
function hasResourceExtension(url: string): boolean {
	const resourceExtensions = [
		'.css',
		'.js',
		'.json',
		'.png',
		'.jpg',
		'.jpeg',
		'.gif',
		'.svg',
		'.webp',
		'.ico',
		'.mp4',
		'.webm',
		'.ogg',
		'.mp3',
		'.wav',
		'.woff',
		'.woff2',
		'.ttf',
		'.eot',
		'.pdf',
		'.zip',
		'.xml',
	]
	const lowerUrl = url.toLowerCase()
	return resourceExtensions.some((ext) => lowerUrl.includes(ext))
}

/**
 * Rewrite a single URL attribute to use translated host
 * @param pathnameMap - Map of original pathname → translated pathname (for link translation)
 * @returns true if URL was rewritten
 */
function rewriteUrlAttribute(
	element: any,
	attr: string,
	originHost: string,
	currentHost: string,
	originalPathname: string,
	translatedPathname: string,
	translatePath: boolean,
	isNavigationUrl: boolean,
	pathnameMap?: Map<string, string>
): boolean {
	const value = element.getAttribute(attr)
	if (!value) return false

	try {
		// Handle relative URLs (no "://")
		if (!value.includes('://')) {
			// Only translate relative links for navigation URLs
			if (isNavigationUrl && translatePath && !hasResourceExtension(value)) {
				// Extract pathname from relative URL (everything before '?' or '#')
				const queryIndex = value.indexOf('?')
				const hashIndex = value.indexOf('#')

				// Find end of pathname
				let pathnameEnd = value.length
				if (queryIndex !== -1) pathnameEnd = Math.min(pathnameEnd, queryIndex)
				if (hashIndex !== -1) pathnameEnd = Math.min(pathnameEnd, hashIndex)

				const pathname = value.substring(0, pathnameEnd)
				const rest = value.substring(pathnameEnd)

				// Check pathname map for translation
				let newPathname = pathname
				if (pathnameMap && pathnameMap.has(pathname)) {
					newPathname = pathnameMap.get(pathname)!
				}

				// Rewrite if pathname changed
				if (newPathname !== pathname) {
					const newUrl = `${newPathname}${rest}`
					element.setAttribute(attr, newUrl)
					return true
				}
			}
			return false
		}

		const url = new URL(value)

		// Rewrite if hostname matches origin host
		if (url.hostname === originHost) {
			// Reconstruct URL with new hostname and optionally new pathname
			let newPathname = url.pathname
			if (isNavigationUrl && translatePath && !hasResourceExtension(value)) {
				// Check pathname map first (has translations for any pathname)
				if (pathnameMap && pathnameMap.has(url.pathname)) {
					newPathname = pathnameMap.get(url.pathname)!
				} else if (url.pathname === originalPathname) {
					// Fallback to current page's translation
					newPathname = translatedPathname
				}
			}

			// Force http:// for localhost to avoid HTTPS/HTTP mismatch in local development
			const protocol = currentHost.startsWith('localhost') ? 'http:' : url.protocol

			// Build new URL string with replaced hostname and pathname
			const newUrl = `${protocol}//${currentHost}${newPathname}${url.search}${url.hash}`
			element.setAttribute(attr, newUrl)
			return true
		}
	} catch (e) {
		// Not a valid URL (e.g., data URI, fragment-only link), skip
	}

	return false
}

/**
 * Rewrite srcset attribute which contains multiple URLs
 * Format: "url1 1x, url2 2x" or "url1 100w, url2 200w"
 * @returns true if any URLs were rewritten
 */
function rewriteSrcset(element: any, originHost: string, currentHost: string): boolean {
	const srcset = element.getAttribute('srcset')
	if (!srcset) return false

	let rewritten = false
	const entries = srcset.split(',')

	const newEntries = entries.map((entry: string) => {
		const trimmed = entry.trim()
		// Split URL from descriptor (e.g., "image.png 1x" -> ["image.png", "1x"])
		const parts = trimmed.split(/\s+/)
		const url = parts[0]
		const descriptor = parts.slice(1).join(' ')

		try {
			// Only process absolute URLs, not relative URLs
			if (!url.includes('://')) {
				return trimmed
			}

			const parsedUrl = new URL(url)
			if (parsedUrl.hostname === originHost) {
				// Force http:// for localhost to avoid HTTPS/HTTP mismatch in local development
				if (currentHost.startsWith('localhost')) {
					parsedUrl.protocol = 'http:'
				}
				parsedUrl.hostname = currentHost
				rewritten = true
				return descriptor ? `${parsedUrl.toString()} ${descriptor}` : parsedUrl.toString()
			}
		} catch (e) {
			// Not a valid URL, skip
		}

		return trimmed
	})

	if (rewritten) {
		element.setAttribute('srcset', newEntries.join(', '))
	}

	return rewritten
}

/**
 * Rewrite internal links and all resource URLs to translated subdomain
 * @param document - linkedom Document object
 * @param originHost - Origin host to replace (e.g., 'www.example.com')
 * @param currentHost - Current translated host (e.g., 'sp.example.com')
 * @param originalPathname - Original English pathname
 * @param translatedPathname - Translated pathname
 * @param translatePath - Whether path name translation is enabled
 * @param pathnameMap - Map of original pathname → translated pathname for link translation
 * @returns Number of attributes rewritten
 */
export function rewriteLinks(
	document: any,
	originHost: string,
	currentHost: string,
	originalPathname: string,
	translatedPathname: string,
	translatePath: boolean = false,
	pathnameMap?: Map<string, string>
): number {
	let rewritten = 0

	// Rewrite navigation links (navigation URLs - eligible for pathname translation)
	const links = document.querySelectorAll('a[href]')
	for (let i = 0; i < links.length; i++) {
		if (
			rewriteUrlAttribute(
				links[i],
				'href',
				originHost,
				currentHost,
				originalPathname,
				translatedPathname,
				translatePath,
				true, // isNavigationUrl
				pathnameMap
			)
		) {
			rewritten++
		}
	}

	// Rewrite form actions
	const forms = document.querySelectorAll('form[action]')
	for (let i = 0; i < forms.length; i++) {
		if (
			rewriteUrlAttribute(
				forms[i],
				'action',
				originHost,
				currentHost,
				originalPathname,
				translatedPathname,
				translatePath,
				true, // isNavigationUrl
				pathnameMap
			)
		) {
			rewritten++
		}
	}

	// Rewrite stylesheets
	const links_css = document.querySelectorAll('link[href]')
	for (let i = 0; i < links_css.length; i++) {
		if (
			rewriteUrlAttribute(
				links_css[i],
				'href',
				originHost,
				currentHost,
				originalPathname,
				translatedPathname,
				translatePath,
				false // isNavigationUrl (resource)
			)
		) {
			rewritten++
		}
	}

	// Rewrite scripts
	const scripts = document.querySelectorAll('script[src]')
	for (let i = 0; i < scripts.length; i++) {
		if (
			rewriteUrlAttribute(
				scripts[i],
				'src',
				originHost,
				currentHost,
				originalPathname,
				translatedPathname,
				translatePath,
				false // isNavigationUrl (resource)
			)
		) {
			rewritten++
		}
	}

	// Rewrite images
	const images = document.querySelectorAll('img[src]')
	for (let i = 0; i < images.length; i++) {
		if (
			rewriteUrlAttribute(
				images[i],
				'src',
				originHost,
				currentHost,
				originalPathname,
				translatedPathname,
				translatePath,
				false // isNavigationUrl (resource)
			)
		) {
			rewritten++
		}
		// Also rewrite srcset for responsive images
		if (rewriteSrcset(images[i], originHost, currentHost)) {
			rewritten++
		}
	}

	// Rewrite video sources and posters
	const videos = document.querySelectorAll('video')
	for (let i = 0; i < videos.length; i++) {
		if (
			rewriteUrlAttribute(
				videos[i],
				'src',
				originHost,
				currentHost,
				originalPathname,
				translatedPathname,
				translatePath,
				false // isNavigationUrl (resource)
			)
		) {
			rewritten++
		}
		if (
			rewriteUrlAttribute(
				videos[i],
				'poster',
				originHost,
				currentHost,
				originalPathname,
				translatedPathname,
				translatePath,
				false // isNavigationUrl (resource)
			)
		) {
			rewritten++
		}
	}

	// Rewrite video/audio source elements
	const sources = document.querySelectorAll('source[src]')
	for (let i = 0; i < sources.length; i++) {
		if (
			rewriteUrlAttribute(
				sources[i],
				'src',
				originHost,
				currentHost,
				originalPathname,
				translatedPathname,
				translatePath,
				false // isNavigationUrl (resource)
			)
		) {
			rewritten++
		}
	}

	// Rewrite audio sources
	const audios = document.querySelectorAll('audio[src]')
	for (let i = 0; i < audios.length; i++) {
		if (
			rewriteUrlAttribute(
				audios[i],
				'src',
				originHost,
				currentHost,
				originalPathname,
				translatedPathname,
				translatePath,
				false // isNavigationUrl (resource)
			)
		) {
			rewritten++
		}
	}

	// Rewrite iframe sources
	const iframes = document.querySelectorAll('iframe[src]')
	for (let i = 0; i < iframes.length; i++) {
		if (
			rewriteUrlAttribute(
				iframes[i],
				'src',
				originHost,
				currentHost,
				originalPathname,
				translatedPathname,
				translatePath,
				false // isNavigationUrl (iframes are resources, not navigation)
			)
		) {
			rewritten++
		}
	}

	// Rewrite embed sources
	const embeds = document.querySelectorAll('embed[src]')
	for (let i = 0; i < embeds.length; i++) {
		if (
			rewriteUrlAttribute(
				embeds[i],
				'src',
				originHost,
				currentHost,
				originalPathname,
				translatedPathname,
				translatePath,
				false // isNavigationUrl (resource)
			)
		) {
			rewritten++
		}
	}

	// Rewrite object data attributes
	const objects = document.querySelectorAll('object[data]')
	for (let i = 0; i < objects.length; i++) {
		if (
			rewriteUrlAttribute(
				objects[i],
				'data',
				originHost,
				currentHost,
				originalPathname,
				translatedPathname,
				translatePath,
				false // isNavigationUrl (resource)
			)
		) {
			rewritten++
		}
	}

	return rewritten
}
