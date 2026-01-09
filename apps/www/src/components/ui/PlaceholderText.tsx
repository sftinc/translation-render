'use client'

import { useMemo } from 'react'
import {
	type StandaloneKind,
	type PairedKind,
	type ASTNode,
	type Token,
	PLACEHOLDER_REGEX,
	STANDALONE_KINDS,
	PAIRED_KINDS,
	PlaceholderBadge,
	PlaceholderWrapper,
} from './placeholder-shared'

// Tokenize text into segments
function tokenize(text: string): Token[] {
	const tokens: Token[] = []
	let lastIndex = 0

	// Find all placeholders
	const matches: Array<{ match: RegExpExecArray; isClosing: boolean; kind: string; index: number }> = []
	let match: RegExpExecArray | null

	// Reset regex state
	const regex = new RegExp(PLACEHOLDER_REGEX.source, 'g')

	while ((match = regex.exec(text)) !== null) {
		const kindPart = match[1]
		const indexPart = parseInt(match[2], 10)
		const isClosing = kindPart.startsWith('/')
		const kind = isClosing ? kindPart.slice(1) : kindPart

		matches.push({
			match,
			isClosing,
			kind,
			index: indexPart,
		})
	}

	// Process matches
	for (const { match, isClosing, kind, index } of matches) {
		const start = match.index
		const end = start + match[0].length

		// Add text before this token
		if (start > lastIndex) {
			tokens.push({
				type: 'text',
				content: text.slice(lastIndex, start),
				start: lastIndex,
				end: start,
			})
		}

		// Determine token type
		if (isClosing) {
			tokens.push({
				type: 'close',
				content: match[0],
				kind,
				index,
				start,
				end,
			})
		} else if (STANDALONE_KINDS.includes(kind as StandaloneKind)) {
			// Standalone placeholders (no closing tag)
			tokens.push({
				type: 'standalone',
				content: match[0],
				kind,
				index,
				start,
				end,
			})
		} else if (PAIRED_KINDS.includes(kind as PairedKind)) {
			// Paired placeholders (opening tag)
			tokens.push({
				type: 'open',
				content: match[0],
				kind,
				index,
				start,
				end,
			})
		}

		lastIndex = end
	}

	// Add remaining text
	if (lastIndex < text.length) {
		tokens.push({
			type: 'text',
			content: text.slice(lastIndex),
			start: lastIndex,
			end: text.length,
		})
	}

	return tokens
}

// Parse tokens into AST with nesting support
function parseToAST(tokens: Token[]): ASTNode[] {
	const result: ASTNode[] = []
	const stack: Array<{ kind: PairedKind; index: number; children: ASTNode[] }> = []

	for (const token of tokens) {
		const current = stack.length > 0 ? stack[stack.length - 1].children : result

		switch (token.type) {
			case 'text':
				current.push({ type: 'text', content: token.content })
				break

			case 'standalone':
				current.push({
					type: 'standalone',
					kind: token.kind as StandaloneKind,
					index: token.index!,
				})
				break

			case 'open':
				stack.push({
					kind: token.kind as PairedKind,
					index: token.index!,
					children: [],
				})
				break

			case 'close':
				// Find matching open tag
				for (let i = stack.length - 1; i >= 0; i--) {
					if (stack[i].kind === token.kind && stack[i].index === token.index) {
						// Pop all items from i to end
						const closed = stack.splice(i)
						const node = closed[0]

						// If there were unclosed tags between, add their children to this node
						for (let j = 1; j < closed.length; j++) {
							node.children.push(...closed[j].children)
						}

						const target = stack.length > 0 ? stack[stack.length - 1].children : result
						target.push({
							type: 'paired',
							kind: node.kind,
							index: node.index,
							children: node.children,
						})
						break
					}
				}
				break
		}
	}

	// Handle any unclosed tags - add their children to result
	for (const unclosed of stack) {
		result.push(...unclosed.children)
	}

	return result
}

// Render AST to React nodes
function renderAST(nodes: ASTNode[], keyPrefix = ''): React.ReactNode[] {
	return nodes.map((node, i) => {
		const key = `${keyPrefix}${i}`

		switch (node.type) {
			case 'text':
				// Render text directly without wrapper to inherit parent color
				return node.content

			case 'standalone':
				return <PlaceholderBadge key={key} kind={node.kind} />

			case 'paired':
				return (
					<PlaceholderWrapper key={key} kind={node.kind}>
						{renderAST(node.children, `${key}-`)}
					</PlaceholderWrapper>
				)
		}
	})
}

// Main component
interface PlaceholderTextProps {
	text: string
	className?: string
}

export function PlaceholderText({ text, className }: PlaceholderTextProps) {
	const ast = useMemo(() => {
		const tokens = tokenize(text)
		return parseToAST(tokens)
	}, [text])

	return <span className={className}>{renderAST(ast)}</span>
}
