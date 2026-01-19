'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Modal, ModalFooter, Button } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { PlaceholderText } from '@/components/ui/PlaceholderText'
import {
	PlaceholderEditor,
	type PlaceholderEditorRef,
} from '@/components/ui/PlaceholderEditor'
import { PlaceholderIssuesBar } from '@/components/ui/PlaceholderIssuesBar'
import { SplitButton } from '@/components/ui/SplitButton'
import { validatePlaceholders, type ValidationResult } from '@/components/ui/placeholder-utils'
import { getLanguageName } from '@pantolingo/lang'
import { saveSegmentTranslation } from '@/actions/translations'

interface SegmentEditModalProps {
	isOpen: boolean
	onClose: () => void
	websiteId: number
	websiteSegmentId: number
	originalText: string
	translatedText: string | null
	isReviewed: boolean
	targetLang: string
	onUpdate?: () => void
}

export function SegmentEditModal({
	isOpen,
	onClose,
	websiteId,
	websiteSegmentId,
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

	// reviewed = true  → mark reviewed
	// reviewed = false → mark NOT reviewed
	// reviewed = null  → don't change review status
	const handleSave = async (reviewed: boolean | null) => {
		setError(null)

		// Final validation before save
		if (validationResult && !validationResult.valid) {
			setError(validationResult.errors.join('. '))
			return
		}

		startTransition(async () => {
			const result = await saveSegmentTranslation(
				websiteId,
				websiteSegmentId,
				targetLang,
				value,
				reviewed
			)

			if (result.success) {
				router.refresh()
				onUpdate?.()
				onClose()
			} else {
				setError(result.error || 'Failed to save')
			}
		})
	}

	const handleInsertPlaceholder = (token: string) => {
		editorRef.current?.insertPlaceholder(token)
		editorRef.current?.focus()
	}

	const handleRemovePlaceholder = (token: string) => {
		// Global replace to remove ALL instances
		const newValue = value.replaceAll(token, '')
		setValue(newValue)
	}

	const handleReset = () => {
		setValue(translatedText || '')
		setError(null)
	}

	const canSave = value.trim() && (!validationResult || validationResult.valid)

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="Edit Segment"
			badge={
				<Badge variant={isReviewed ? 'success' : 'warning'}>
					{isReviewed ? 'Reviewed' : 'Pending Review'}
				</Badge>
			}
		>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
					</div>

					{/* Placeholder editor */}
					<PlaceholderEditor
						ref={editorRef}
						value={value}
						onChange={setValue}
						placeholder={`Enter ${getLanguageName(targetLang)} translation...`}
						disabled={isPending}
					/>

					{/* Placeholder issues bar - below editor */}
					<PlaceholderIssuesBar
						missing={validationResult?.missing || []}
						extra={validationResult?.extra || []}
						nestingErrors={validationResult?.nestingErrors || []}
						unclosedErrors={validationResult?.unclosedErrors || []}
						onInsertMissing={handleInsertPlaceholder}
						onRemoveExtra={handleRemovePlaceholder}
					/>
				</div>
			</div>

			{/* Server error */}
			{error && (
				<div className="mt-4 p-3 rounded-lg bg-[var(--error)]/10 text-[var(--error)] text-sm">
					{error}
				</div>
			)}

			<ModalFooter className="justify-between">
				<Button variant="secondary" onClick={handleReset} disabled={isPending}>
					Reset
				</Button>

				{isReviewed ? (
					<SplitButton
						variant="primary"
						dropdownVariant="success"
						primaryLabel="Save"
						primaryOnClick={() => handleSave(null)}
						secondaryLabel="Unreview + Save"
						secondaryOnClick={() => handleSave(false)}
						loading={isPending}
						disabled={!canSave}
					/>
				) : (
					<SplitButton
						variant="success"
						dropdownVariant="primary"
						primaryLabel="Reviewed + Save"
						primaryOnClick={() => handleSave(true)}
						secondaryLabel="Save"
						secondaryOnClick={() => handleSave(null)}
						loading={isPending}
						disabled={!canSave}
					/>
				)}
			</ModalFooter>
		</Modal>
	)
}
