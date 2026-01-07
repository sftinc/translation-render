import { cn } from '@/lib/utils'

type BadgeVariant = 'success' | 'warning' | 'error' | 'neutral'

interface BadgeProps {
	variant?: BadgeVariant
	children: React.ReactNode
	className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
	success: 'bg-[var(--success)]/10 text-[var(--success)]',
	warning: 'bg-[var(--warning)]/10 text-[var(--warning)]',
	error: 'bg-[var(--error)]/10 text-[var(--error)]',
	neutral: 'bg-[var(--text-subtle)]/10 text-[var(--text-subtle)]',
}

export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
	return (
		<span
			className={cn(
				'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
				variantStyles[variant],
				className
			)}
		>
			{children}
		</span>
	)
}
