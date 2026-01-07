'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal, ModalFooter, Button } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { getLanguageName } from '@/lib/utils'
import {
	saveSegmentTranslation,
	savePathTranslation,
	reviewSegment,
	reviewPath,
} from '@/actions/translations'

interface EditModalProps {
	type: 'segment' | 'path'
	isOpen: boolean
	onClose: () => void
	originId: number
	originalText: string
	translatedText: string | null
	isReviewed: boolean
	targetLang: string
	onUpdate?: () => void
}

export function EditModal({
	type,
	isOpen,
	onClose,
	originId,
	originalText,
	translatedText,
	isReviewed,
	targetLang,
	onUpdate,
}: EditModalProps) {
	const router = useRouter()
	const [isPending, startTransition] = useTransition()
	const [value, setValue] = useState(translatedText || '')
	const [error, setError] = useState<string | null>(null)

	const handleSave = async () => {
		setError(null)
		startTransition(async () => {
			const result =
				type === 'segment'
					? await saveSegmentTranslation(originId, targetLang, value)
					: await savePathTranslation(originId, targetLang, value)

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
			const result =
				type === 'segment'
					? await reviewSegment(originId, targetLang)
					: await reviewPath(originId, targetLang)

			if (result.success) {
				router.refresh()
				onUpdate?.()
				onClose()
			} else {
				setError(result.error || 'Failed to mark as reviewed')
			}
		})
	}

	const title = type === 'segment' ? 'Edit Segment Translation' : 'Edit Path Translation'

	return (
		<Modal isOpen={isOpen} onClose={onClose} title={title}>
			<div className="grid grid-cols-2 gap-6">
				{/* Original text */}
				<div>
					<div className="mb-2 flex items-center gap-2">
						<span className="text-sm font-medium text-[var(--text-muted)]">Original</span>
					</div>
					<div className="rounded-lg border border-[var(--border)] bg-[var(--page-bg)] p-4 min-h-[200px]">
						{type === 'path' ? (
							<code className="text-sm whitespace-pre-wrap break-all">{originalText}</code>
						) : (
							<p className="text-sm whitespace-pre-wrap">{originalText}</p>
						)}
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
					<textarea
						value={value}
						onChange={(e) => setValue(e.target.value)}
						placeholder={`Enter ${getLanguageName(targetLang)} translation...`}
						className="w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] p-4 min-h-[200px] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
						disabled={isPending}
					/>
				</div>
			</div>

			{error && (
				<div className="mt-4 p-3 rounded-lg bg-[var(--error)]/10 text-[var(--error)] text-sm">
					{error}
				</div>
			)}

			<ModalFooter>
				<Button variant="secondary" onClick={onClose} disabled={isPending}>
					Cancel
				</Button>
				{translatedText && !isReviewed && (
					<Button variant="success" onClick={handleMarkReviewed} disabled={isPending}>
						{isPending ? 'Saving...' : 'Mark Reviewed'}
					</Button>
				)}
				<Button variant="primary" onClick={handleSave} disabled={isPending || !value.trim()}>
					{isPending ? 'Saving...' : 'Save Translation'}
				</Button>
			</ModalFooter>
		</Modal>
	)
}
