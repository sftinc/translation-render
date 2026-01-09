'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface ModalProps {
	isOpen: boolean
	onClose: () => void
	title: string
	children: React.ReactNode
	className?: string
}

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
	const dialogRef = useRef<HTMLDialogElement>(null)

	useEffect(() => {
		const dialog = dialogRef.current
		if (!dialog) return

		if (isOpen) {
			dialog.showModal()
		} else {
			dialog.close()
		}
	}, [isOpen])

	useEffect(() => {
		const dialog = dialogRef.current
		if (!dialog) return

		const handleClose = () => onClose()
		dialog.addEventListener('close', handleClose)
		return () => dialog.removeEventListener('close', handleClose)
	}, [onClose])

	// Close on backdrop click
	const handleBackdropClick = (e: React.MouseEvent) => {
		if (e.target === dialogRef.current) {
			onClose()
		}
	}

	// Close on Escape key
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && isOpen) {
				onClose()
			}
		}
		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [isOpen, onClose])

	return (
		<dialog
			ref={dialogRef}
			className={cn(
				'fixed inset-0 m-auto max-h-[85vh] w-full max-w-4xl rounded-lg bg-[var(--card-bg)] text-[var(--page-fg)] p-0 shadow-[0_4px_24px_var(--shadow-color)] backdrop:bg-black/50',
				className
			)}
			onClick={handleBackdropClick}
		>
			<div className="flex flex-col max-h-[85vh]">
				<div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
					<h2 className="text-lg font-semibold text-[var(--text-heading)]">{title}</h2>
					<button
						onClick={onClose}
						className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--border)] transition-colors focus:outline-none"
						aria-label="Close"
					>
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
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>
				<div className="flex-1 overflow-auto p-6">{children}</div>
			</div>
		</dialog>
	)
}

interface ModalFooterProps {
	children: React.ReactNode
	className?: string
}

export function ModalFooter({ children, className }: ModalFooterProps) {
	return (
		<div className={cn('flex justify-end gap-3 border-t border-[var(--border)] pt-4 mt-4', className)}>
			{children}
		</div>
	)
}

interface ButtonProps {
	children: React.ReactNode
	variant?: 'primary' | 'secondary' | 'success'
	onClick?: () => void
	disabled?: boolean
	type?: 'button' | 'submit'
	className?: string
}

export function Button({ children, variant = 'secondary', onClick, disabled, type = 'button', className }: ButtonProps) {
	const variantStyles = {
		primary: 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
		secondary: 'bg-[var(--border)] text-[var(--text-heading)] hover:bg-[var(--border-hover)]',
		success: 'bg-[var(--success)] text-white hover:opacity-90',
	}

	return (
		<button
			type={type}
			onClick={onClick}
			disabled={disabled}
			className={cn(
				'px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
				variantStyles[variant],
				className
			)}
		>
			{children}
		</button>
	)
}
