'use client'

import { useRouter } from 'next/navigation'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyState } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { formatNumber, getLanguageName } from '@/lib/utils'
import type { HostWithStats } from '@pantolingo/db'

interface HostTableProps {
	hosts: HostWithStats[]
}

export function HostTable({ hosts }: HostTableProps) {
	const router = useRouter()

	if (hosts.length === 0) {
		return <EmptyState message="No hosts configured for this origin" />
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Hostname</TableHead>
					<TableHead>Language</TableHead>
					<TableHead>Status</TableHead>
					<TableHead className="text-right">Segments</TableHead>
					<TableHead className="text-right">Paths</TableHead>
					<TableHead className="text-right">Unreviewed</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{hosts.map((host) => (
					<TableRow
						key={host.id}
						clickable
						onClick={() => router.push(`/dashboard/host/${host.id}`)}
					>
						<TableCell className="font-medium">{host.hostname}</TableCell>
						<TableCell>{getLanguageName(host.targetLang)}</TableCell>
						<TableCell>
							<Badge variant={host.enabled ? 'success' : 'neutral'}>
								{host.enabled ? 'Active' : 'Disabled'}
							</Badge>
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{formatNumber(host.translatedSegmentCount)}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{formatNumber(host.translatedPathCount)}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{host.unreviewedSegmentCount + host.unreviewedPathCount > 0 ? (
								<Badge variant="warning">
									{formatNumber(host.unreviewedSegmentCount + host.unreviewedPathCount)}
								</Badge>
							) : (
								<Badge variant="success">0</Badge>
							)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	)
}
