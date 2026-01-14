import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { canAccessWebsite, getWebsiteById, getLangsForWebsite } from '@pantolingo/db'
import { getFlag } from '@pantolingo/lang'
import { DashboardNav } from '@/components/dashboard/DashboardNav'
import { LangTable } from '@/components/dashboard/LangTable'

export const dynamic = 'force-dynamic'

interface WebsiteDetailPageProps {
	params: Promise<{ id: string }>
}

export default async function WebsiteDetailPage({ params }: WebsiteDetailPageProps) {
	const session = await auth()

	if (!session) {
		redirect('/login')
	}

	const { id } = await params
	const websiteId = parseInt(id, 10)

	if (isNaN(websiteId)) {
		notFound()
	}

	// Check authorization
	if (!(await canAccessWebsite(session.user.accountId, websiteId))) {
		notFound()
	}

	const website = await getWebsiteById(websiteId)

	if (!website) {
		notFound()
	}

	const langs = await getLangsForWebsite(websiteId)

	return (
		<div>
			<DashboardNav
				breadcrumbs={[
					{ label: 'Dashboard', href: '/dashboard' },
					{ label: `${website.domain} ${getFlag(website.sourceLang)}` },
				]}
			/>

			<h2 className="mb-4 text-2xl font-semibold text-[var(--text-heading)]">Languages</h2>

			<LangTable langs={langs} websiteId={websiteId} />
		</div>
	)
}
