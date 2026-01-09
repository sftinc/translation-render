// Shared types, constants, and components for placeholder rendering
// Used by both PlaceholderText (read-only) and PlaceholderEditor (Lexical)

import React from 'react'

// ============================================================================
// Types
// ============================================================================

export type StandaloneKind = 'N' | 'P' | 'S' | 'HV'
export type PairedKind = 'HB' | 'HE' | 'HA' | 'HS' | 'HG'

export type ASTNode =
	| { type: 'text'; content: string }
	| { type: 'standalone'; kind: StandaloneKind; index: number }
	| { type: 'paired'; kind: PairedKind; index: number; children: ASTNode[] }

export interface Token {
	type: 'text' | 'open' | 'close' | 'standalone'
	content: string
	kind?: string
	index?: number
	start: number
	end: number
}

// ============================================================================
// Constants
// ============================================================================

export const PLACEHOLDER_REGEX = /\[(\/?[A-Z]+)(\d+)\]/g

export const STANDALONE_KINDS: StandaloneKind[] = ['N', 'P', 'S', 'HV']
export const PAIRED_KINDS: PairedKind[] = ['HB', 'HE', 'HA', 'HS', 'HG']

export const STANDALONE_LABELS: Record<StandaloneKind, string> = {
	N: 'number',
	P: 'email',
	S: 'skip',
	HV: 'element',
}

export const PAIRED_LABELS: Record<PairedKind, string> = {
	HB: 'bold',
	HE: 'emphasis',
	HA: 'anchor',
	HS: 'span',
	HG: 'element',
}

export const STANDALONE_COLORS: Record<StandaloneKind, string> = {
	N: 'var(--ph-number)',
	P: 'var(--ph-email)',
	S: 'var(--ph-skip)',
	HV: 'var(--ph-void)',
}

export const PAIRED_COLORS: Record<PairedKind, string> = {
	HB: 'var(--ph-bold)',
	HE: 'var(--ph-emphasis)',
	HA: 'var(--ph-anchor)',
	HS: 'var(--ph-span)',
	HG: 'var(--ph-generic)',
}

// ============================================================================
// Helper Functions
// ============================================================================

export function isStandaloneKind(kind: string): kind is StandaloneKind {
	return STANDALONE_KINDS.includes(kind as StandaloneKind)
}

export function isPairedKind(kind: string): kind is PairedKind {
	return PAIRED_KINDS.includes(kind as PairedKind)
}

// ============================================================================
// Shared Badge Component (for standalone placeholders)
// ============================================================================

interface PlaceholderBadgeProps {
	kind: StandaloneKind
	className?: string
}

export function PlaceholderBadge({ kind, className = '' }: PlaceholderBadgeProps) {
	const label = STANDALONE_LABELS[kind]
	const color = STANDALONE_COLORS[kind]

	return React.createElement('span', {
		className: `inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium mx-0.5 whitespace-nowrap ${className}`,
		style: {
			backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`,
			color: color,
		},
	}, label)
}

// ============================================================================
// Shared Wrapper Component (for paired placeholders)
// ============================================================================

interface PlaceholderWrapperProps {
	kind: PairedKind
	children: React.ReactNode
	showTooltip?: boolean
	className?: string
}

export function PlaceholderWrapper({
	kind,
	children,
	showTooltip = true,
	className = '',
}: PlaceholderWrapperProps) {
	const label = PAIRED_LABELS[kind]
	const color = PAIRED_COLORS[kind]

	const tooltip = showTooltip
		? React.createElement('span', {
				key: 'tooltip',
				className:
					'absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 text-xs rounded opacity-0 group-hover/placeholder:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 text-white',
				style: { backgroundColor: color },
		  }, label)
		: null

	return React.createElement(
		'span',
		{
			className: `relative group/placeholder inline rounded-sm px-0.5 ${className}`,
			style: {
				backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
			},
		},
		React.createElement(React.Fragment, null, tooltip, children)
	)
}
