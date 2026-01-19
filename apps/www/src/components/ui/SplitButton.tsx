'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Spinner } from './Spinner'

interface SplitButtonProps {
	primaryLabel: string
	primaryOnClick: () => void
	secondaryLabel: string
	secondaryOnClick: () => void
	variant: 'primary' | 'success'
	dropdownVariant?: 'primary' | 'success'
	loading?: boolean
	disabled?: boolean
}

export function SplitButton({
	primaryLabel,
	primaryOnClick,
	secondaryLabel,
	secondaryOnClick,
	variant,
	dropdownVariant,
	loading = false,
	disabled = false,
}: SplitButtonProps) {
	const [isOpen, setIsOpen] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setIsOpen(false)
			}
		}

		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside)
			return () => document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [isOpen])

	const variantStyles = {
		primary: {
			button: 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
		},
		success: {
			button: 'bg-[var(--success)] text-white hover:opacity-90',
		},
	}

	const styles = variantStyles[variant]
	const dropdownStyles = variantStyles[dropdownVariant || variant]
	const isDisabled = disabled || loading

	const handlePrimaryClick = () => {
		if (!isDisabled) {
			primaryOnClick()
		}
	}

	const handleSecondaryClick = () => {
		if (!isDisabled) {
			secondaryOnClick()
			setIsOpen(false)
		}
	}

	const handleDropdownToggle = () => {
		if (!isDisabled) {
			setIsOpen(!isOpen)
		}
	}

	return (
		<div ref={containerRef} className="relative inline-flex">
			{/* Main button */}
			<button
				type="button"
				onClick={handlePrimaryClick}
				disabled={isDisabled}
				className={cn(
					'px-4 py-2 text-sm font-medium rounded-l-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-r border-white/20',
					styles.button
				)}
			>
				{loading ? <Spinner size="sm" /> : primaryLabel}
			</button>

			{/* Dropdown trigger */}
			<button
				type="button"
				onClick={handleDropdownToggle}
				disabled={isDisabled}
				className={cn(
					'px-2 py-2 rounded-r-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
					styles.button
				)}
				aria-haspopup="true"
				aria-expanded={isOpen}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className={cn('transition-transform', isOpen && 'rotate-180')}
				>
					<polyline points="6 15 12 9 18 15" />
				</svg>
			</button>

			{/* Dropdown menu - opens upward to avoid modal clipping */}
			{isOpen && (
				<div className="absolute right-0 bottom-full mb-1 z-50 min-w-full">
					<button
						type="button"
						onClick={handleSecondaryClick}
						className={cn(
							'w-full px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap text-left',
							dropdownStyles.button
						)}
					>
						{secondaryLabel}
					</button>
				</div>
			)}
		</div>
	)
}
