import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { formatNumber, getLanguageName } from '@/lib/utils'
import type { OriginWithStats } from '@pantolingo/db'

interface OriginCardProps {
	origin: OriginWithStats
}

export function OriginCard({ origin }: OriginCardProps) {
	return (
		<Card href={`/dashboard/origin/${origin.id}`}>
			<CardHeader>
				<CardTitle>{origin.domain}</CardTitle>
				<CardDescription>Source: {getLanguageName(origin.originLang)}</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-3 gap-4 text-center">
					<div>
						<div className="text-2xl font-semibold text-[var(--text-heading)]">
							{formatNumber(origin.hostCount)}
						</div>
						<div className="text-xs text-[var(--text-muted)]">
							{origin.hostCount === 1 ? 'Host' : 'Hosts'}
						</div>
					</div>
					<div>
						<div className="text-2xl font-semibold text-[var(--text-heading)]">
							{formatNumber(origin.segmentCount)}
						</div>
						<div className="text-xs text-[var(--text-muted)]">Segments</div>
					</div>
					<div>
						<div className="text-2xl font-semibold text-[var(--text-heading)]">
							{formatNumber(origin.pathCount)}
						</div>
						<div className="text-xs text-[var(--text-muted)]">Paths</div>
					</div>
				</div>
			</CardContent>
		</Card>
	)
}
