import Link from 'next/link'
import { cn } from '@/lib/utils'

interface CardProps {
	children: React.ReactNode
	className?: string
	href?: string
}

export function Card({ children, className, href }: CardProps) {
	const baseStyles = cn(
		'rounded-lg bg-[var(--card-bg)] p-6 shadow-[0_2px_8px_var(--shadow-color)]',
		href && 'transition-shadow hover:shadow-[0_4px_12px_var(--shadow-color)] cursor-pointer',
		className
	)

	if (href) {
		return (
			<Link href={href} className={baseStyles}>
				{children}
			</Link>
		)
	}

	return <div className={baseStyles}>{children}</div>
}

interface CardHeaderProps {
	children: React.ReactNode
	className?: string
}

export function CardHeader({ children, className }: CardHeaderProps) {
	return <div className={cn('mb-4', className)}>{children}</div>
}

interface CardTitleProps {
	children: React.ReactNode
	className?: string
}

export function CardTitle({ children, className }: CardTitleProps) {
	return <h3 className={cn('text-lg font-semibold text-[var(--text-heading)]', className)}>{children}</h3>
}

interface CardDescriptionProps {
	children: React.ReactNode
	className?: string
}

export function CardDescription({ children, className }: CardDescriptionProps) {
	return <p className={cn('text-sm text-[var(--text-muted)]', className)}>{children}</p>
}

interface CardContentProps {
	children: React.ReactNode
	className?: string
}

export function CardContent({ children, className }: CardContentProps) {
	return <div className={className}>{children}</div>
}
