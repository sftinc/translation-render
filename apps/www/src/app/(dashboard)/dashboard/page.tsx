import { getOriginsWithStats } from '@pantolingo/db'
import { OriginCard } from '@/components/dashboard/OriginCard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
	const origins = await getOriginsWithStats()

	return (
		<div>
			<h2 className="mb-4 text-2xl font-semibold text-[var(--text-heading)]">Your Origins</h2>

			{origins.length === 0 ? (
				<div className="text-center py-12 bg-[var(--card-bg)] rounded-lg">
					<p className="text-[var(--text-muted)]">No origins configured yet</p>
				</div>
			) : (
				<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
					{origins.map((origin) => (
						<OriginCard key={origin.id} origin={origin} />
					))}
				</div>
			)}
		</div>
	)
}
