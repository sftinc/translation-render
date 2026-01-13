'use client'

import { useState } from 'react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyState } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { PlaceholderText } from '@/components/ui/PlaceholderText'
import { PathEditModal } from './PathEditModal'
import type { PathWithTranslation } from '@pantolingo/db'

interface PathTableProps {
	paths: PathWithTranslation[]
	targetLang: string
	originId: number
	onUpdate?: () => void
}

export function PathTable({ paths, targetLang, originId, onUpdate }: PathTableProps) {
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
								<code
									className="block max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap text-sm text-[var(--text-muted)]"
									title={path.path}
								>
									<PlaceholderText text={path.path} />
								</code>
							</TableCell>
							<TableCell>
								{path.translatedPath ? (
									<code
										className="block max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap text-sm"
										title={path.translatedPath}
									>
										<PlaceholderText text={path.translatedPath} />
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
				<PathEditModal
					isOpen={!!editingPath}
					onClose={() => setEditingPath(null)}
					originId={originId}
					originPathId={editingPath.originPathId}
					originalPath={editingPath.path}
					translatedPath={editingPath.translatedPath}
					isReviewed={!!editingPath.reviewedAt}
					targetLang={targetLang}
					onUpdate={onUpdate}
				/>
			)}
		</>
	)
}
