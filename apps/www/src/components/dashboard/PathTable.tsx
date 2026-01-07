'use client'

import { useState } from 'react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyState } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { truncate } from '@/lib/utils'
import { EditModal } from './EditModal'
import type { PathWithTranslation } from '@pantolingo/db'

interface PathTableProps {
	paths: PathWithTranslation[]
	hostId: number
	targetLang: string
	onUpdate?: () => void
}

export function PathTable({ paths, hostId, targetLang, onUpdate }: PathTableProps) {
	const [editingPath, setEditingPath] = useState<PathWithTranslation | null>(null)

	if (paths.length === 0) {
		return <EmptyState message="No paths found" />
	}

	return (
		<>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-[45%]">Original Path</TableHead>
						<TableHead className="w-[45%]">Translated Path</TableHead>
						<TableHead className="w-[10%]">Status</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{paths.map((path) => (
						<TableRow
							key={path.originPathId}
							clickable
							onClick={() => setEditingPath(path)}
						>
							<TableCell>
								<code className="text-sm text-[var(--text-muted)]" title={path.path}>
									{truncate(path.path, 60)}
								</code>
							</TableCell>
							<TableCell>
								{path.translatedPath ? (
									<code className="text-sm" title={path.translatedPath}>
										{truncate(path.translatedPath, 60)}
									</code>
								) : (
									<span className="text-[var(--text-subtle)] italic">Not translated</span>
								)}
							</TableCell>
							<TableCell>
								{path.translatedPath ? (
									path.reviewedAt ? (
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

			{editingPath && (
				<EditModal
					type="path"
					isOpen={!!editingPath}
					onClose={() => setEditingPath(null)}
					originId={editingPath.originPathId}
					originalText={editingPath.path}
					translatedText={editingPath.translatedPath}
					isReviewed={!!editingPath.reviewedAt}
					targetLang={targetLang}
					onUpdate={onUpdate}
				/>
			)}
		</>
	)
}
