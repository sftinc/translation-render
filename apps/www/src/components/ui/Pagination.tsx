import Link from 'next/link'
import { cn } from '@/lib/utils'

interface PaginationProps {
	currentPage: number
	totalPages: number
	baseUrl: string
	className?: string
}

export function Pagination({ currentPage, totalPages, baseUrl, className }: PaginationProps) {
	if (totalPages <= 1) return null

	const getPageUrl = (page: number) => {
		const url = new URL(baseUrl, 'http://localhost')
		url.searchParams.set('page', String(page))
		return url.pathname + url.search
	}

	const hasPrev = currentPage > 1
	const hasNext = currentPage < totalPages

	return (
		<div className={cn('flex items-center justify-between', className)}>
			<div className="text-sm text-[var(--text-muted)]">
				Page {currentPage} of {totalPages}
			</div>
			<div className="flex gap-2">
				{hasPrev ? (
					<Link
						href={getPageUrl(currentPage - 1)}
						className="px-3 py-1.5 text-sm font-medium rounded-md bg-[var(--card-bg)] text-[var(--text-heading)] hover:bg-[var(--border)] transition-colors"
					>
						Previous
					</Link>
				) : (
					<span className="px-3 py-1.5 text-sm font-medium rounded-md bg-[var(--card-bg)] text-[var(--text-subtle)] cursor-not-allowed">
						Previous
					</span>
				)}
				{hasNext ? (
					<Link
						href={getPageUrl(currentPage + 1)}
						className="px-3 py-1.5 text-sm font-medium rounded-md bg-[var(--card-bg)] text-[var(--text-heading)] hover:bg-[var(--border)] transition-colors"
					>
						Next
					</Link>
				) : (
					<span className="px-3 py-1.5 text-sm font-medium rounded-md bg-[var(--card-bg)] text-[var(--text-subtle)] cursor-not-allowed">
						Next
					</span>
				)}
			</div>
		</div>
	)
}
