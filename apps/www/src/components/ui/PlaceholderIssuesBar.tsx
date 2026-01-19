'use client'

import {
	type StandaloneKind,
	type PairedKind,
	STANDALONE_LABELS,
	PAIRED_LABELS,
	STANDALONE_COLORS,
	PAIRED_COLORS,
	isStandaloneKind,
	isPairedKind,
} from './placeholder-shared'
import { parseToken } from './placeholder-utils'

interface PlaceholderIssuesBarProps {
	missing: string[]
	extra: string[]
	nestingErrors: string[]
	unclosedErrors: string[]
	onInsertMissing: (token: string) => void
	onRemoveExtra: (token: string) => void
}

interface ChipProps {
	token: string
	onClick: () => void
	action: 'insert' | 'remove'
}

function Chip({ token, onClick, action }: ChipProps) {
	const parsed = parseToken(token)
	if (!parsed) return null

	// Determine label and color based on type
	let label: string
	let color: string

	if (parsed.isClose) {
		if (isPairedKind(parsed.kind)) {
			label = `/${PAIRED_LABELS[parsed.kind as PairedKind]}`
			color = PAIRED_COLORS[parsed.kind as PairedKind]
		} else {
			label = token
			color = 'var(--text-muted)'
		}
	} else if (isStandaloneKind(parsed.kind)) {
		label = STANDALONE_LABELS[parsed.kind as StandaloneKind]
		color = STANDALONE_COLORS[parsed.kind as StandaloneKind]
	} else if (isPairedKind(parsed.kind)) {
		label = PAIRED_LABELS[parsed.kind as PairedKind]
		color = PAIRED_COLORS[parsed.kind as PairedKind]
	} else {
		label = token
		color = 'var(--text-muted)'
	}

	const prefix = action === 'insert' ? '+' : '×'
	const title = action === 'insert'
		? `Click to insert ${token}`
		: `Click to remove all ${token}`

	return (
		<button
			type="button"
			onClick={onClick}
			className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all hover:scale-105 hover:shadow-sm cursor-pointer"
			style={{
				backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`,
				color: color,
				border: `1px dashed ${color}`,
			}}
			title={title}
		>
			{prefix} {label}
		</button>
	)
}

export function PlaceholderIssuesBar({
	missing,
	extra,
	nestingErrors,
	unclosedErrors,
	onInsertMissing,
	onRemoveExtra,
}: PlaceholderIssuesBarProps) {
	// Return null if no issues
	if (
		missing.length === 0 &&
		extra.length === 0 &&
		nestingErrors.length === 0 &&
		unclosedErrors.length === 0
	) {
		return null
	}

	// Show ONE category at a time in priority order: Missing → Extra → Nesting → Unclosed
	let content: React.ReactNode

	if (missing.length > 0) {
		// Filter out closing tags for paired placeholders (clicking open tag inserts both)
		const missingToShow = missing.filter((token) => {
			const parsed = parseToken(token)
			return parsed && !parsed.isClose
		})

		content = missingToShow.length > 0 ? (
			<div className="flex items-center gap-2 flex-wrap">
				<span className="text-xs font-medium text-[var(--warning)]">Missing:</span>
				{missingToShow.map((token) => (
					<Chip
						key={token}
						token={token}
						onClick={() => onInsertMissing(token)}
						action="insert"
					/>
				))}
			</div>
		) : null
	} else if (extra.length > 0) {
		content = (
			<div className="flex items-center gap-2 flex-wrap">
				<span className="text-xs font-medium text-[var(--warning)]">Extra:</span>
				{extra.map((token) => (
					<Chip
						key={token}
						token={token}
						onClick={() => onRemoveExtra(token)}
						action="remove"
					/>
				))}
			</div>
		)
	} else if (nestingErrors.length > 0) {
		content = (
			<div className="flex items-center gap-2 flex-wrap">
				<span className="text-xs font-medium text-[var(--warning)]">Nesting error:</span>
				<span className="text-xs text-[var(--warning)]">{nestingErrors[0]}</span>
			</div>
		)
	} else if (unclosedErrors.length > 0) {
		content = (
			<div className="flex items-center gap-2 flex-wrap">
				<span className="text-xs font-medium text-[var(--warning)]">Unclosed:</span>
				<span className="text-xs text-[var(--warning)]">{unclosedErrors[0]}</span>
			</div>
		)
	}

	return (
		<div className="mt-2 p-2 rounded-lg bg-[var(--warning)]/10 border border-[var(--warning)]/30">
			{content}
		</div>
	)
}
