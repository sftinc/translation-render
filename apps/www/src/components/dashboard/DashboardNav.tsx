import Link from 'next/link'

interface Breadcrumb {
	label: string
	href?: string
}

interface DashboardNavProps {
	breadcrumbs: Breadcrumb[]
}

export function DashboardNav({ breadcrumbs }: DashboardNavProps) {
	return (
		<nav className="mb-6">
			<ol className="flex items-center gap-2 text-sm">
				{breadcrumbs.map((crumb, index) => (
					<li key={index} className="flex items-center gap-2">
						{index > 0 && <span className="text-[var(--text-subtle)]">/</span>}
						{crumb.href ? (
							<Link
								href={crumb.href}
								className="text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors"
							>
								{crumb.label}
							</Link>
						) : (
							<span className="text-[var(--text-heading)] font-medium">{crumb.label}</span>
						)}
					</li>
				))}
			</ol>
		</nav>
	)
}
