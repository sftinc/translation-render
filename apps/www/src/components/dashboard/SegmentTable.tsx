'use client'

import { useState } from 'react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyState } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { PlaceholderText } from '@/components/ui/PlaceholderText'
import { SegmentEditModal } from './SegmentEditModal'
import type { SegmentWithTranslation } from '@pantolingo/db'

interface SegmentTableProps {
	segments: SegmentWithTranslation[]
	targetLang: string
	originId: number
	onUpdate?: () => void
}

export function SegmentTable({ segments, targetLang, originId, onUpdate }: SegmentTableProps) {
	const [editingSegment, setEditingSegment] = useState<SegmentWithTranslation | null>(null)

	if (segments.length === 0) {
		return <EmptyState message="No segments found" />
	}

	return (
		<>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-[45%]">Original Text</TableHead>
						<TableHead className="w-[45%]">Translation</TableHead>
						<TableHead className="w-[10%]">Status</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{segments.map((segment) => (
						<TableRow
							key={segment.originSegmentId}
							clickable
							onClick={() => setEditingSegment(segment)}
						>
							<TableCell>
								<span
									className="block max-w-[400px] overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-muted)]"
									title={segment.text}
								>
									<PlaceholderText text={segment.text} />
								</span>
							</TableCell>
							<TableCell>
								{segment.translatedText ? (
									<span
										className="block max-w-[400px] overflow-hidden text-ellipsis whitespace-nowrap"
										title={segment.translatedText}
									>
										<PlaceholderText text={segment.translatedText} />
									</span>
								) : (
									<span className="text-[var(--text-subtle)] italic">Not translated</span>
								)}
							</TableCell>
							<TableCell>
								{segment.translatedText ? (
									segment.reviewedAt ? (
										<Badge variant="success">Reviewed</Badge>
									) : (
										<Badge variant="warning">Pending</Badge>
									)
								) : (
									<Badge variant="neutral">-</Badge>
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>

			{editingSegment && (
				<SegmentEditModal
					isOpen={!!editingSegment}
					onClose={() => setEditingSegment(null)}
					originId={originId}
					originSegmentId={editingSegment.originSegmentId}
					originalText={editingSegment.text}
					translatedText={editingSegment.translatedText}
					isReviewed={!!editingSegment.reviewedAt}
					targetLang={targetLang}
					onUpdate={onUpdate}
				/>
			)}
		</>
	)
}
