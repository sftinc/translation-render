import { cn } from '@/lib/utils'

interface TableProps {
	children: React.ReactNode
	className?: string
}

export function Table({ children, className }: TableProps) {
	return (
		<div className="overflow-x-auto rounded-lg border border-[var(--border)]">
			<table className={cn('w-full text-left text-sm', className)}>{children}</table>
		</div>
	)
}

interface TableHeaderProps {
	children: React.ReactNode
	className?: string
}

export function TableHeader({ children, className }: TableHeaderProps) {
	return <thead className={cn('bg-[var(--card-bg)] text-[var(--text-muted)]', className)}>{children}</thead>
}

interface TableBodyProps {
	children: React.ReactNode
	className?: string
}

export function TableBody({ children, className }: TableBodyProps) {
	return <tbody className={cn('divide-y divide-[var(--border)]', className)}>{children}</tbody>
}

interface TableRowProps {
	children: React.ReactNode
	className?: string
	onClick?: () => void
	clickable?: boolean
}

export function TableRow({ children, className, onClick, clickable }: TableRowProps) {
	return (
		<tr
			className={cn(
				'bg-[var(--page-bg)]',
				(clickable || onClick) && 'cursor-pointer hover:bg-[var(--card-bg)] transition-colors',
				className
			)}
			onClick={onClick}
		>
			{children}
		</tr>
	)
}

interface TableHeadProps {
	children: React.ReactNode
	className?: string
}

export function TableHead({ children, className }: TableHeadProps) {
	return (
		<th className={cn('px-4 py-3 font-medium text-[var(--text-muted)]', className)}>
			{children}
		</th>
	)
}

interface TableCellProps {
	children: React.ReactNode
	className?: string
}

export function TableCell({ children, className }: TableCellProps) {
	return (
		<td className={cn('px-4 py-3 text-[var(--text-heading)]', className)}>
			{children}
		</td>
	)
}

interface EmptyStateProps {
	message: string
	className?: string
}

export function EmptyState({ message, className }: EmptyStateProps) {
	return (
		<div className={cn('py-12 text-center text-[var(--text-muted)]', className)}>
			{message}
		</div>
	)
}
