/**
 * Utility functions for path detection
 */

/**
 * Check if a pathname is for a static asset that doesn't need translation
 * Static assets bypass pathname translation lookups and are proxied directly
 *
 * @param pathname - URL pathname to check (e.g., "/images/logo.png" or "/api/data")
 * @returns true if pathname is for a static asset file
 */
export function isStaticAsset(pathname: string): boolean {
	const staticExtensions = [
		// Images
		'.apng',
		'.avif',
		'.bmp',
		'.cur',
		'.eps',
		'.gif',
		'.heic',
		'.heif',
		'.ico',
		'.jpeg',
		'.jpg',
		'.jxl',
		'.pict',
		'.png',
		'.svg',
		'.svgz',
		'.tif',
		'.tiff',
		'.webp',
		// Video
		'.3gp',
		'.avi',
		'.flv',
		'.m4v',
		'.mkv',
		'.mov',
		'.mp4',
		'.swf',
		'.webm',
		'.wmv',
		// Audio
		'.aac',
		'.flac',
		'.m4a',
		'.mid',
		'.midi',
		'.mp3',
		'.ogg',
		'.opus',
		'.pls',
		'.wav',
		// Fonts
		'.eot',
		'.otf',
		'.ttf',
		'.woff',
		'.woff2',
		// Documents
		'.csv',
		'.doc',
		'.docx',
		'.md',
		'.odp',
		'.ods',
		'.odt',
		'.pdf',
		'.ppt',
		'.pptx',
		'.ps',
		'.rtf',
		'.txt',
		'.xls',
		'.xlsx',
		// Archives
		'.7z',
		'.bz2',
		'.deb',
		'.dmg',
		'.gz',
		'.iso',
		'.jar',
		'.rar',
		'.rpm',
		'.tar',
		'.xz',
		'.zip',
		'.zst',
		// Code/Data
		'.class',
		'.css',
		'.ejs',
		'.js',
		'.json',
		'.map',
		'.mjs',
		'.wasm',
		'.xml',
		// Binaries
		'.bin',
		'.exe',
		// Web
		'.webmanifest',
	]
	const lowerPath = pathname.toLowerCase()
	return staticExtensions.some((ext) => lowerPath.endsWith(ext) || lowerPath.includes(ext + '?'))
}
