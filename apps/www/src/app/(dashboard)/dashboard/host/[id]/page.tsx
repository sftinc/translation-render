import { notFound } from 'next/navigation'
import { getHostById, getSegmentsForHost, getPathsForHost } from '@pantolingo/db'
import { DashboardNav } from '@/components/dashboard/DashboardNav'
import { SegmentTable } from '@/components/dashboard/SegmentTable'
import { PathTable } from '@/components/dashboard/PathTable'
import { Toggle } from '@/components/ui/Toggle'
import { Pagination } from '@/components/ui/Pagination'
import { getLanguageName, formatNumber } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface HostDetailPageProps {
	params: Promise<{ id: string }>
	searchParams: Promise<{ view?: string; filter?: string; page?: string }>
}

export default async function HostDetailPage({ params, searchParams }: HostDetailPageProps) {
	const { id } = await params
	const { view = 'segments', filter = 'unreviewed', page = '1' } = await searchParams
	const hostId = parseInt(id, 10)
	const pageNum = parseInt(page, 10) || 1
	const limit = 50

	if (isNaN(hostId)) {
		notFound()
	}

	const host = await getHostById(hostId)

	if (!host) {
		notFound()
	}

	const validView = view === 'paths' ? 'paths' : 'segments'
	const validFilter = filter === 'all' ? 'all' : 'unreviewed'

	const data =
		validView === 'segments'
			? await getSegmentsForHost(hostId, validFilter, pageNum, limit)
			: await getPathsForHost(hostId, validFilter, pageNum, limit)

	const baseUrl = `/dashboard/host/${hostId}?view=${validView}&filter=${validFilter}`

	return (
		<div>
			<DashboardNav
				breadcrumbs={[
					{ label: 'Dashboard', href: '/dashboard' },
					{ label: host.originDomain, href: `/dashboard/origin/${host.originId}` },
					{ label: host.hostname },
				]}
			/>

			<div className="mb-8">
				<h2 className="text-2xl font-semibold text-[var(--text-heading)]">{host.hostname}</h2>
				<p className="mt-1 text-[var(--text-muted)]">
					{getLanguageName(host.originLang)} → {getLanguageName(host.targetLang)}
				</p>
			</div>

			{/* View and Filter toggles */}
			<div className="mb-6 flex flex-wrap items-center gap-4">
				<Toggle
					options={[
						{ value: 'segments', label: 'Segments' },
						{ value: 'paths', label: 'Paths' },
					]}
					value={validView}
					baseUrl={`/dashboard/host/${hostId}?filter=${validFilter}`}
					paramName="view"
				/>
				<Toggle
					options={[
						{ value: 'unreviewed', label: 'Unreviewed' },
						{ value: 'all', label: 'All' },
					]}
					value={validFilter}
					baseUrl={`/dashboard/host/${hostId}?view=${validView}`}
					paramName="filter"
				/>
				<span className="text-sm text-[var(--text-muted)]">
					{formatNumber(data.total)} {validView}
				</span>
			</div>

			{/* Data table */}
			{validView === 'segments' ? (
				<SegmentTable
					segments={data.items as any}
					hostId={hostId}
					targetLang={host.targetLang}
				/>
			) : (
				<PathTable
					paths={data.items as any}
					hostId={hostId}
					targetLang={host.targetLang}
				/>
			)}

			{/* Pagination */}
			<div className="mt-6">
				<Pagination currentPage={data.page} totalPages={data.totalPages} baseUrl={baseUrl} />
			</div>
		</div>
	)
}
