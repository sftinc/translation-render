'use client'

import { useEffect, useRef, useCallback } from 'react'

declare global {
	interface Window {
		turnstile?: {
			render: (
				container: HTMLElement,
				options: {
					sitekey: string
					callback: (token: string) => void
					'error-callback'?: () => void
					'expired-callback'?: () => void
					theme?: 'light' | 'dark' | 'auto'
				}
			) => string
			reset: (widgetId: string) => void
			remove: (widgetId: string) => void
		}
	}
}

interface TurnstileProps {
	siteKey: string
	onVerify: (token: string) => void
	onError?: () => void
	onExpired?: () => void
}

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

/**
 * Cloudflare Turnstile CAPTCHA widget
 *
 * Test keys for development (from Cloudflare docs):
 * - Site key: 1x00000000000000000000AA (always passes)
 */
export function Turnstile({ siteKey, onVerify, onError, onExpired }: TurnstileProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const widgetIdRef = useRef<string | null>(null)
	const renderedRef = useRef(false)

	const handleVerify = useCallback(
		(token: string) => {
			console.log('[Turnstile] Verification successful, token received')
			onVerify(token)
		},
		[onVerify]
	)

	const handleError = useCallback(() => {
		onError?.()
	}, [onError])

	const handleExpired = useCallback(() => {
		onExpired?.()
	}, [onExpired])

	useEffect(() => {
		console.log('[Turnstile] useEffect running, siteKey:', siteKey ? 'present' : 'missing')
		if (!siteKey) {
			console.error('[Turnstile] siteKey prop is required')
			return
		}

		// Load script if not already loaded
		const existingScript = document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`)
		if (!existingScript) {
			const script = document.createElement('script')
			script.src = TURNSTILE_SCRIPT_URL
			script.async = true
			script.defer = true
			document.head.appendChild(script)
		}

		// Render widget when script is ready
		const renderWidget = () => {
			console.log('[Turnstile] renderWidget called', {
				hasContainer: !!containerRef.current,
				hasTurnstile: !!window.turnstile,
				alreadyRendered: renderedRef.current,
				hasWidgetId: !!widgetIdRef.current
			})
			if (
				!containerRef.current ||
				!window.turnstile ||
				renderedRef.current ||
				widgetIdRef.current
			) {
				return
			}

			// Detect current theme
			const isDark = document.documentElement.classList.contains('dark')

			renderedRef.current = true
			widgetIdRef.current = window.turnstile.render(containerRef.current, {
				sitekey: siteKey,
				callback: handleVerify,
				'error-callback': handleError,
				'expired-callback': handleExpired,
				theme: isDark ? 'dark' : 'light',
			})
		}

		// Poll for turnstile to be ready
		const checkInterval = setInterval(() => {
			if (window.turnstile) {
				clearInterval(checkInterval)
				renderWidget()
			}
		}, 100)

		// Cleanup
		return () => {
			clearInterval(checkInterval)
			if (widgetIdRef.current && window.turnstile) {
				window.turnstile.remove(widgetIdRef.current)
				widgetIdRef.current = null
				renderedRef.current = false
			}
		}
	}, [siteKey, handleVerify, handleError, handleExpired])

	return <div ref={containerRef} className="flex justify-center" />
}
