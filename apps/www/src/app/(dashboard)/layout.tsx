import { ThemeToggle } from '@/components/ui/ThemeToggle'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-screen bg-[var(--page-bg)]">
			<header className="border-b border-[var(--border)] bg-[var(--card-bg)]">
				<div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex items-center justify-between">
					<h1 className="text-xl font-semibold text-[var(--text-heading)]">Pantolingo</h1>
					<ThemeToggle />
				</div>
			</header>
			<main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
		</div>
	)
}
