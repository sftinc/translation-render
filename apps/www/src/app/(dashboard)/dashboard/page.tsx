import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getWebsitesWithStats } from '@pantolingo/db'
import { WebsiteCard } from '@/components/dashboard/WebsiteCard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
	const session = await auth()

	if (!session) {
		redirect('/login')
	}

	const websites = await getWebsitesWithStats(session.user.accountId)

	return (
		<div>
			<h2 className="mb-4 text-2xl font-semibold text-[var(--text-heading)]">Your Websites</h2>

			{websites.length === 0 ? (
				<div className="text-center py-12 bg-[var(--card-bg)] rounded-lg">
					<p className="text-[var(--text-muted)]">No websites configured yet</p>
				</div>
			) : (
				<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
					{websites.map((website) => (
						<WebsiteCard key={website.id} website={website} />
					))}
				</div>
			)}
		</div>
	)
}
