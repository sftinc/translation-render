import { notFound, redirect } from 'next/navigation'
import {
	getOriginById,
	isValidLangForOrigin,
	getPathsForOrigin,
	getSegmentsForLang,
	getPathsForLang,
} from '@pantolingo/db'
import { DashboardNav } from '@/components/dashboard/DashboardNav'
import { SegmentTable } from '@/components/dashboard/SegmentTable'
import { PathTable } from '@/components/dashboard/PathTable'
import { Toggle } from '@/components/ui/Toggle'
import { PathSelect } from '@/components/ui/PathSelect'
import { Pagination } from '@/components/ui/Pagination'
import { formatNumber } from '@/lib/utils'
import { getFlag, getLanguageLabel } from '@pantolingo/lang'

export const dynamic = 'force-dynamic'

interface LangDetailPageProps {
	params: Promise<{ id: string; langCd: string }>
	searchParams: Promise<{ view?: string; filter?: string; page?: string; path?: string }>
}

export default async function LangDetailPage({ params, searchParams }: LangDetailPageProps) {
	const { id, langCd } = await params
	const { view = 'segments', filter = 'unreviewed', page = '1', path } = await searchParams
	const originId = parseInt(id, 10)
	const pageNum = parseInt(page, 10) || 1
	const limit = 50

	// Parse path param: undefined = all, 'none' = orphans, number = specific path
	const pathId: number | 'none' | undefined =
		path === undefined ? undefined : path === 'none' ? 'none' : parseInt(path, 10) || undefined

	// Invalid originId - show 404
	if (isNaN(originId)) {
		notFound()
	}

	const origin = await getOriginById(originId)

	// Origin not found - show 404
	if (!origin) {
		notFound()
	}

	// Invalid language for this origin - redirect to origin page
	const validLang = await isValidLangForOrigin(originId, langCd)
	if (!validLang) {
		redirect(`/dashboard/origin/${originId}`)
	}

	const validView = view === 'paths' ? 'paths' : 'segments'
	const validFilter = filter === 'all' ? 'all' : 'unreviewed'

	// Fetch paths for the dropdown (only when viewing segments)
	const pathOptions = validView === 'segments' ? await getPathsForOrigin(originId) : []

	const segmentData =
		validView === 'segments'
			? await getSegmentsForLang(originId, langCd, validFilter, pageNum, limit, pathId)
			: null
	const pathData =
		validView === 'paths'
			? await getPathsForLang(originId, langCd, validFilter, pageNum, limit)
			: null
	const data = segmentData ?? pathData!

	// Build path param string for URLs
	const pathParam = pathId !== undefined ? `&path=${pathId}` : ''
	const baseUrl = `/dashboard/origin/${originId}/lang/${langCd}?view=${validView}&filter=${validFilter}${pathParam}`

	return (
		<div>
			<DashboardNav
				breadcrumbs={[
					{ label: 'Dashboard', href: '/dashboard' },
					{
						label: `${origin.domain} ${getFlag(origin.originLang)}`,
						href: `/dashboard/origin/${originId}`,
					},
					{ label: `${getLanguageLabel(langCd)} (${formatNumber(data.total)})` },
				]}
			/>

			{/* View and Filter toggles */}
			<div className="mb-6 flex flex-wrap items-center gap-4">
				<Toggle
					options={[
						{ value: 'segments', label: 'Segments' },
						{ value: 'paths', label: 'Paths' },
					]}
					value={validView}
					baseUrl={`/dashboard/origin/${originId}/lang/${langCd}?filter=${validFilter}`}
					paramName="view"
				/>
				<Toggle
					options={[
						{ value: 'unreviewed', label: 'Unreviewed' },
						{ value: 'all', label: 'All' },
					]}
					value={validFilter}
					baseUrl={`/dashboard/origin/${originId}/lang/${langCd}?view=${validView}${pathParam}`}
					paramName="filter"
				/>
				{validView === 'segments' && (
					<PathSelect
						paths={pathOptions}
						selectedPathId={pathId ?? null}
						baseUrl={`/dashboard/origin/${originId}/lang/${langCd}?view=${validView}&filter=${validFilter}`}
						className="ml-auto"
					/>
				)}
			</div>

			{/* Empty state message */}
			{data.total === 0 && validFilter === 'unreviewed' && (
				<div className="mb-6 rounded-lg bg-[var(--success-bg)] p-4 text-[var(--success-text)]">
					All translations have been reviewed. Switch to &quot;All&quot; to see all translations.
				</div>
			)}

			{/* Data table */}
			{segmentData && <SegmentTable segments={segmentData.items} targetLang={langCd} />}
			{pathData && <PathTable paths={pathData.items} targetLang={langCd} />}

			{/* Pagination */}
			<div className="mt-6">
				<Pagination currentPage={data.page} totalPages={data.totalPages} baseUrl={baseUrl} />
			</div>
		</div>
	)
}
