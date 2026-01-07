import { notFound } from 'next/navigation'
import { getOriginById, getHostsForOrigin } from '@pantolingo/db'
import { DashboardNav } from '@/components/dashboard/DashboardNav'
import { HostTable } from '@/components/dashboard/HostTable'
import { getLanguageName } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface OriginDetailPageProps {
	params: Promise<{ id: string }>
}

export default async function OriginDetailPage({ params }: OriginDetailPageProps) {
	const { id } = await params
	const originId = parseInt(id, 10)

	if (isNaN(originId)) {
		notFound()
	}

	const origin = await getOriginById(originId)

	if (!origin) {
		notFound()
	}

	const hosts = await getHostsForOrigin(originId)

	return (
		<div>
			<DashboardNav
				breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: origin.domain }]}
			/>

			<div className="mb-8">
				<h2 className="text-2xl font-semibold text-[var(--text-heading)]">{origin.domain}</h2>
				<p className="mt-1 text-[var(--text-muted)]">
					Source language: {getLanguageName(origin.originLang)}
				</p>
			</div>

			<div className="mb-4">
				<h3 className="text-lg font-medium text-[var(--text-heading)]">Translation Hosts</h3>
				<p className="text-sm text-[var(--text-muted)]">
					Click a host to view and manage translations
				</p>
			</div>

			<HostTable hosts={hosts} />
		</div>
	)
}
