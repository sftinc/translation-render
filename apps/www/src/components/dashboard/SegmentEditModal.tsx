'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Modal, ModalFooter, Button } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { PlaceholderText } from '@/components/ui/PlaceholderText'
import {
	PlaceholderEditor,
	type PlaceholderEditorRef,
} from '@/components/ui/lexical/PlaceholderEditor'
import { MissingPlaceholderToolbar } from '@/components/ui/lexical/MissingPlaceholderToolbar'
import { validatePlaceholders, type ValidationResult } from '@/components/ui/lexical/placeholder-utils'
import { getLanguageName } from '@pantolingo/lang'
import { saveSegmentTranslation, reviewSegment } from '@/actions/translations'

interface SegmentEditModalProps {
	isOpen: boolean
	onClose: () => void
	originId: number
	originSegmentId: number
	originalText: string
	translatedText: string | null
	isReviewed: boolean
	targetLang: string
	onUpdate?: () => void
}

export function SegmentEditModal({
	isOpen,
	onClose,
	originId,
	originSegmentId,
	originalText,
	translatedText,
	isReviewed,
	targetLang,
	onUpdate,
}: SegmentEditModalProps) {
	const router = useRouter()
	const [isPending, startTransition] = useTransition()
	const [value, setValue] = useState(translatedText || '')
	const [error, setError] = useState<string | null>(null)
	const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
	const editorRef = useRef<PlaceholderEditorRef>(null)

	// Reset state when modal opens with new content
	useEffect(() => {
		if (isOpen) {
			setValue(translatedText || '')
			setError(null)
			setValidationResult(null)
		}
	}, [isOpen, translatedText])

	// Validate on every change
	useEffect(() => {
		if (value.trim()) {
			const result = validatePlaceholders(originalText, value)
			setValidationResult(result)
		} else {
			setValidationResult(null)
		}
	}, [value, originalText])

	const handleSave = async () => {
		setError(null)

		// Final validation before save
		if (validationResult && !validationResult.valid) {
			setError(validationResult.errors.join('. '))
			return
		}

		startTransition(async () => {
			const result = await saveSegmentTranslation(originId, originSegmentId, targetLang, value)

			if (result.success) {
				router.refresh()
				onUpdate?.()
				onClose()
			} else {
				setError(result.error || 'Failed to save')
			}
		})
	}

	const handleMarkReviewed = async () => {
		setError(null)
		startTransition(async () => {
			const result = await reviewSegment(originId, originSegmentId, targetLang)

			if (result.success) {
				router.refresh()
				onUpdate?.()
				onClose()
			} else {
				setError(result.error || 'Failed to mark as reviewed')
			}
		})
	}

	const handleInsertPlaceholder = (token: string) => {
		editorRef.current?.insertPlaceholder(token)
		editorRef.current?.focus()
	}

	const handleReset = () => {
		setValue(translatedText || '')
		setError(null)
	}

	const canSave = value.trim() && (!validationResult || validationResult.valid)

	return (
		<Modal isOpen={isOpen} onClose={onClose} title="Edit Segment Translation">
			<div className="grid grid-cols-2 gap-6">
				{/* Original text */}
				<div>
					<div className="mb-2 flex items-center gap-2">
						<span className="text-sm font-medium text-[var(--text-muted)]">Original</span>
					</div>
					<div className="rounded-lg border border-[var(--border)] bg-[var(--page-bg)] p-4 min-h-[200px]">
						<p className="text-sm whitespace-pre-wrap">
							<PlaceholderText text={originalText} />
						</p>
					</div>
				</div>

				{/* Translation */}
				<div>
					<div className="mb-2 flex items-center justify-between">
						<span className="text-sm font-medium text-[var(--text-muted)]">
							{getLanguageName(targetLang)} Translation
						</span>
						{translatedText && (
							<Badge variant={isReviewed ? 'success' : 'warning'}>
								{isReviewed ? 'Reviewed' : 'Pending Review'}
							</Badge>
						)}
					</div>

					{/* Missing placeholder toolbar */}
					<MissingPlaceholderToolbar
						missing={validationResult?.missing || []}
						onInsert={handleInsertPlaceholder}
					/>

					{/* Placeholder editor */}
					<PlaceholderEditor
						ref={editorRef}
						value={value}
						onChange={setValue}
						placeholder={`Enter ${getLanguageName(targetLang)} translation...`}
						disabled={isPending}
					/>
				</div>
			</div>

			{/* Validation warnings */}
			{validationResult && validationResult.errors.length > 0 && (
				<div className="mt-4 p-3 rounded-lg bg-[var(--warning)]/10 text-[var(--warning)] text-sm">
					<strong>Validation issues:</strong>
					<ul className="list-disc list-inside mt-1">
						{validationResult.errors.map((err, i) => (
							<li key={i}>{err}</li>
						))}
					</ul>
				</div>
			)}

			{/* Server error */}
			{error && (
				<div className="mt-4 p-3 rounded-lg bg-[var(--error)]/10 text-[var(--error)] text-sm">
					{error}
				</div>
			)}

			<ModalFooter>
				<Button variant="secondary" onClick={handleReset} disabled={isPending}>
					Reset
				</Button>
				{translatedText && !isReviewed && (
					<Button variant="success" onClick={handleMarkReviewed} disabled={isPending}>
						{isPending ? 'Saving...' : 'Mark Reviewed'}
					</Button>
				)}
				<Button variant="primary" onClick={handleSave} disabled={isPending || !canSave}>
					{isPending ? 'Saving...' : 'Save Translation'}
				</Button>
			</ModalFooter>
		</Modal>
	)
}
