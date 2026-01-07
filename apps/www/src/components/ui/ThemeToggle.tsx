'use client'

import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

function applyTheme(theme: Theme) {
	const root = document.documentElement
	root.classList.remove('light', 'dark')
	root.classList.add(theme)
}

function getInitialTheme(): Theme {
	// Check localStorage first
	const stored = localStorage.getItem('theme')
	if (stored === 'light' || stored === 'dark') {
		return stored
	}
	// Fall back to browser preference
	if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
		return 'dark'
	}
	return 'light'
}

export function ThemeToggle() {
	const [theme, setTheme] = useState<Theme>('light')
	const [mounted, setMounted] = useState(false)

	// Read theme from localStorage or browser preference and apply on mount
	useEffect(() => {
		const initialTheme = getInitialTheme()
		setTheme(initialTheme)
		applyTheme(initialTheme)
		setMounted(true)
	}, [])

	const toggleTheme = () => {
		const next: Theme = theme === 'light' ? 'dark' : 'light'
		setTheme(next)
		localStorage.setItem('theme', next)
		applyTheme(next)
	}

	// Prevent hydration mismatch
	if (!mounted) {
		return (
			<button
				className="p-2 rounded-md text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--border)] transition-colors"
				aria-label="Toggle theme"
			>
				<span className="w-5 h-5 block" />
			</button>
		)
	}

	return (
		<button
			onClick={toggleTheme}
			className="p-2 rounded-md text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--border)] transition-colors"
			aria-label={`Current theme: ${theme}. Click to toggle.`}
			title={`Theme: ${theme}`}
		>
			{theme === 'light' ? <SunIcon /> : <MoonIcon />}
		</button>
	)
}

function SunIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2" />
			<path d="M12 20v2" />
			<path d="m4.93 4.93 1.41 1.41" />
			<path d="m17.66 17.66 1.41 1.41" />
			<path d="M2 12h2" />
			<path d="M20 12h2" />
			<path d="m6.34 17.66-1.41 1.41" />
			<path d="m19.07 4.93-1.41 1.41" />
		</svg>
	)
}

function MoonIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
		</svg>
	)
}

