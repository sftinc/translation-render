import { notFound } from 'next/navigation'
import { getOriginById, getHostsForOrigin } from '@pantolingo/db'
import { DashboardNav } from '@/components/dashboard/DashboardNav'
import { HostTable } from '@/components/dashboard/HostTable'

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
				breadcrumbs={[
					{ label: 'Dashboard', href: '/dashboard' },
					{ label: `${origin.domain} (${origin.originLang})` },
				]}
			/>

			<h2 className="mb-4 text-2xl font-semibold text-[var(--text-heading)]">Hosts</h2>

			<HostTable hosts={hosts} />
		</div>
	)
}
