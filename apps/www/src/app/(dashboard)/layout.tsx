import { auth, signOut } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
	const session = await auth()

	if (!session) {
		redirect('/login')
	}

	async function handleSignOut() {
		'use server'
		await signOut({ redirectTo: '/' })
	}

	return (
		<div className="min-h-screen bg-[var(--page-bg)]">
			<header className="border-b border-[var(--border)] bg-[var(--card-bg)]">
				<div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex items-center justify-between">
					<h1 className="text-xl font-semibold text-[var(--text-heading)]">Pantolingo</h1>
					<div className="flex items-center gap-4">
						<span className="text-sm text-[var(--text-muted)]">
							{session.user.name || session.user.email}
						</span>
						<form action={handleSignOut}>
							<button
								type="submit"
								className="text-sm text-[var(--text-muted)] hover:text-[var(--text-body)] transition cursor-pointer"
							>
								Sign out
							</button>
						</form>
						<ThemeToggle />
					</div>
				</div>
			</header>
			<main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
		</div>
	)
}
