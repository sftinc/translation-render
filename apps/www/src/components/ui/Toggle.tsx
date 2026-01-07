import Link from 'next/link'
import { cn } from '@/lib/utils'

interface ToggleOption {
	value: string
	label: string
	count?: number
}

interface ToggleProps {
	options: ToggleOption[]
	value: string
	baseUrl: string
	paramName: string
	className?: string
}

export function Toggle({ options, value, baseUrl, paramName, className }: ToggleProps) {
	return (
		<div className={cn('inline-flex rounded-lg bg-[var(--card-bg)] p-1', className)}>
			{options.map((option) => {
				const isActive = option.value === value
				const url = new URL(baseUrl, 'http://localhost')
				url.searchParams.set(paramName, option.value)
				const href = url.pathname + url.search

				return (
					<Link
						key={option.value}
						href={href}
						className={cn(
							'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
							isActive
								? 'bg-[var(--accent)] text-white'
								: 'text-[var(--text-muted)] hover:text-[var(--text-heading)]'
						)}
					>
						{option.label}
						{option.count !== undefined && (
							<span className={cn('ml-1.5', isActive ? 'text-white/80' : 'text-[var(--text-subtle)]')}>
								({option.count.toLocaleString()})
							</span>
						)}
					</Link>
				)
			})}
		</div>
	)
}
