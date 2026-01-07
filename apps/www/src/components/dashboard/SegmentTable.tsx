'use client'

import { useState } from 'react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyState } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { truncate } from '@/lib/utils'
import { EditModal } from './EditModal'
import type { SegmentWithTranslation } from '@pantolingo/db'

interface SegmentTableProps {
	segments: SegmentWithTranslation[]
	hostId: number
	targetLang: string
	onUpdate?: () => void
}

export function SegmentTable({ segments, hostId, targetLang, onUpdate }: SegmentTableProps) {
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
								<span className="text-[var(--text-muted)]" title={segment.text}>
									{truncate(segment.text, 80)}
								</span>
							</TableCell>
							<TableCell>
								{segment.translatedText ? (
									<span title={segment.translatedText}>
										{truncate(segment.translatedText, 80)}
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
				<EditModal
					type="segment"
					isOpen={!!editingSegment}
					onClose={() => setEditingSegment(null)}
					originId={editingSegment.originSegmentId}
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
