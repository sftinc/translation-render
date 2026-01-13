import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { canAccessOrigin, getOriginById, getLangsForOrigin } from '@pantolingo/db'
import { getFlag } from '@pantolingo/lang'
import { DashboardNav } from '@/components/dashboard/DashboardNav'
import { LangTable } from '@/components/dashboard/LangTable'

export const dynamic = 'force-dynamic'

interface OriginDetailPageProps {
	params: Promise<{ id: string }>
}

export default async function OriginDetailPage({ params }: OriginDetailPageProps) {
	const session = await auth()

	if (!session) {
		redirect('/login')
	}

	const { id } = await params
	const originId = parseInt(id, 10)

	if (isNaN(originId)) {
		notFound()
	}

	// Check authorization
	if (!(await canAccessOrigin(session.user.profileId, originId))) {
		notFound()
	}

	const origin = await getOriginById(originId)

	if (!origin) {
		notFound()
	}

	const langs = await getLangsForOrigin(originId)

	return (
		<div>
			<DashboardNav
				breadcrumbs={[
					{ label: 'Dashboard', href: '/dashboard' },
					{ label: `${origin.domain} ${getFlag(origin.originLang)}` },
				]}
			/>

			<h2 className="mb-4 text-2xl font-semibold text-[var(--text-heading)]">Languages</h2>

			<LangTable langs={langs} originId={originId} />
		</div>
	)
}
