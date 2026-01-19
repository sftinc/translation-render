'use client'

import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
} from 'react'
import {
	type StandaloneKind,
	type PairedKind,
	type ASTNode,
	tokenize,
	parseToAST,
	STANDALONE_COLORS,
	STANDALONE_LABELS,
	PAIRED_COLORS,
	PAIRED_LABELS,
} from './placeholder-shared'
import { parseToken } from './placeholder-utils'

// ============================================================================
// Types
// ============================================================================

export interface PlaceholderEditorProps {
	value: string
	onChange: (value: string) => void
	placeholder?: string
	disabled?: boolean
	className?: string
}

export interface PlaceholderEditorRef {
	insertPlaceholder: (token: string) => void
	focus: () => void
}

// ============================================================================
// Cursor Utilities
// ============================================================================

function getCursorOffset(container: HTMLElement): number {
	const selection = window.getSelection()
	if (!selection || selection.rangeCount === 0) return -1

	const range = selection.getRangeAt(0)

	// Check if selection is within our container
	if (!container.contains(range.startContainer)) return -1

	const preCaretRange = document.createRange()
	preCaretRange.selectNodeContents(container)
	preCaretRange.setEnd(range.startContainer, range.startOffset)

	// Count characters by walking through nodes
	return getTextLength(preCaretRange.cloneContents())
}

function getTextLength(node: Node): number {
	let length = 0

	if (node.nodeType === Node.TEXT_NODE) {
		length += node.textContent?.length || 0
	} else if (node instanceof HTMLElement) {
		const standalone = node.dataset.standalone
		const paired = node.dataset.paired
		const index = node.dataset.index

		if (standalone && index) {
			// Standalone placeholder token length
			length += `[${standalone}${index}]`.length
		} else if (paired && index) {
			// Opening tag + children + closing tag
			length += `[${paired}${index}]`.length
			for (const child of node.childNodes) {
				length += getTextLength(child)
			}
			length += `[/${paired}${index}]`.length
		} else {
			for (const child of node.childNodes) {
				length += getTextLength(child)
			}
		}
	} else if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
		for (const child of node.childNodes) {
			length += getTextLength(child)
		}
	}

	return length
}

function setCursorOffset(container: HTMLElement, targetOffset: number): void {
	if (targetOffset < 0) return

	const selection = window.getSelection()
	if (!selection) return

	const result = findNodeAtOffset(container, targetOffset)
	if (!result) return

	const range = document.createRange()
	range.setStart(result.node, result.offset)
	range.collapse(true)

	selection.removeAllRanges()
	selection.addRange(range)
}

function findNodeAtOffset(
	container: Node,
	targetOffset: number
): { node: Node; offset: number } | null {
	let currentOffset = 0

	function walk(node: Node): { node: Node; offset: number } | null {
		if (node.nodeType === Node.TEXT_NODE) {
			const textLength = node.textContent?.length || 0
			if (currentOffset + textLength >= targetOffset) {
				return { node, offset: targetOffset - currentOffset }
			}
			currentOffset += textLength
			return null
		}

		if (node instanceof HTMLElement) {
			const standalone = node.dataset.standalone
			const paired = node.dataset.paired
			const index = node.dataset.index

			if (standalone && index) {
				const tokenLength = `[${standalone}${index}]`.length
				if (currentOffset + tokenLength >= targetOffset) {
					// Target is within or at the placeholder - position after it
					return { node: node.parentNode!, offset: Array.from(node.parentNode!.childNodes).indexOf(node) + 1 }
				}
				currentOffset += tokenLength
				return null
			}

			if (paired && index) {
				const openLength = `[${paired}${index}]`.length
				currentOffset += openLength

				// Walk children
				for (const child of node.childNodes) {
					const result = walk(child)
					if (result) return result
				}

				const closeLength = `[/${paired}${index}]`.length
				currentOffset += closeLength
				return null
			}
		}

		// Regular element - walk children
		for (const child of node.childNodes) {
			const result = walk(child)
			if (result) return result
		}

		return null
	}

	const result = walk(container)

	// If we didn't find the exact position, return end of container
	if (!result && container.childNodes.length > 0) {
		const lastChild = container.childNodes[container.childNodes.length - 1]
		if (lastChild.nodeType === Node.TEXT_NODE) {
			return { node: lastChild, offset: lastChild.textContent?.length || 0 }
		}
		return { node: container, offset: container.childNodes.length }
	}

	return result
}

// ============================================================================
// Serialization (DOM -> Text)
// ============================================================================

function serializeDOMToValue(node: Node): string {
	let result = ''

	for (const child of node.childNodes) {
		if (child.nodeType === Node.TEXT_NODE) {
			result += child.textContent || ''
		} else if (child instanceof HTMLElement) {
			// Skip cursor anchor spans (contain ZWSP for cursor positioning)
			if (child.dataset.cursorAnchor !== undefined) {
				continue
			}

			const standalone = child.dataset.standalone
			const paired = child.dataset.paired
			const index = child.dataset.index

			if (standalone && index) {
				result += `[${standalone}${index}]`
			} else if (paired && index) {
				result += `[${paired}${index}]`
				result += serializeDOMToValue(child)
				result += `[/${paired}${index}]`
			} else {
				// Generic element - just recurse
				result += serializeDOMToValue(child)
			}
		}
	}

	return result
}

// ============================================================================
// AST -> DOM Rendering
// ============================================================================

function renderASTToHTML(nodes: ASTNode[]): string {
	let html = ''

	// Check if first node is a placeholder - need cursor anchor before it
	const firstNode = nodes[0]
	const needsStartAnchor =
		firstNode &&
		(firstNode.type === 'standalone' || firstNode.type === 'paired')

	// Check if last node is a placeholder - need cursor anchor after it
	const lastNode = nodes[nodes.length - 1]
	const needsEndAnchor =
		lastNode &&
		(lastNode.type === 'standalone' || lastNode.type === 'paired')

	if (needsStartAnchor) {
		html += '<span data-cursor-anchor>\u200B</span>'
	}

	for (const node of nodes) {
		switch (node.type) {
			case 'text':
				// Escape HTML entities but preserve whitespace
				html += escapeHTML(node.content)
				break

			case 'standalone': {
				const color = STANDALONE_COLORS[node.kind]
				const label = STANDALONE_LABELS[node.kind]
				html += `<span data-standalone="${node.kind}" data-index="${node.index}" contenteditable="false" class="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium whitespace-nowrap" style="background-color: color-mix(in srgb, ${color} 20%, transparent); color: ${color};">${label}</span>`
				break
			}

			case 'paired': {
				const color = PAIRED_COLORS[node.kind]
				const childHTML = renderASTToHTML(node.children)
				html += `<span data-paired="${node.kind}" data-index="${node.index}" class="relative group/placeholder inline rounded-sm px-0.5" style="background-color: color-mix(in srgb, ${color} 15%, transparent);">${childHTML}</span>`
				break
			}
		}
	}

	if (needsEndAnchor) {
		html += '<span data-cursor-anchor>\u200B</span>'
	}

	return html
}

function escapeHTML(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
}

// ============================================================================
// Main Component
// ============================================================================

export const PlaceholderEditor = forwardRef<PlaceholderEditorRef, PlaceholderEditorProps>(
	function PlaceholderEditor(
		{ value, onChange, placeholder, disabled, className },
		ref
	) {
		const editorRef = useRef<HTMLDivElement>(null)
		const lastValueRef = useRef(value)
		const isInternalUpdate = useRef(false)

		// Render value to DOM
		const renderValue = useCallback((newValue: string) => {
			if (!editorRef.current) return

			const tokens = tokenize(newValue)
			const ast = parseToAST(tokens)
			const html = renderASTToHTML(ast)

			editorRef.current.innerHTML = html || '<br>' // Empty div needs a br for cursor
		}, [])

		// Initial render and external value changes
		useEffect(() => {
			if (isInternalUpdate.current) {
				isInternalUpdate.current = false
				return
			}

			if (value !== lastValueRef.current) {
				const cursorOffset = editorRef.current ? getCursorOffset(editorRef.current) : -1

				lastValueRef.current = value
				renderValue(value)

				// Restore cursor if we had one
				if (cursorOffset >= 0 && editorRef.current) {
					requestAnimationFrame(() => {
						if (editorRef.current) {
							setCursorOffset(editorRef.current, cursorOffset)
						}
					})
				}
			}
		}, [value, renderValue])

		// Initial render on mount only - subsequent value changes are handled
		// by the useEffect above that watches [value, renderValue]
		useEffect(() => {
			renderValue(value)
		}, []) // eslint-disable-line react-hooks/exhaustive-deps

		// Handle input
		const handleInput = useCallback(() => {
			if (!editorRef.current) return

			const cursorOffset = getCursorOffset(editorRef.current)
			const newValue = serializeDOMToValue(editorRef.current)

			if (newValue !== lastValueRef.current) {
				lastValueRef.current = newValue
				isInternalUpdate.current = true
				onChange(newValue)

				// Re-render with new value to fix any visual issues
				renderValue(newValue)

				// Restore cursor
				if (cursorOffset >= 0) {
					requestAnimationFrame(() => {
						if (editorRef.current) {
							setCursorOffset(editorRef.current, cursorOffset)
						}
					})
				}
			}
		}, [onChange, renderValue])

		// Handle paste - insert raw text
		const handlePaste = useCallback((e: React.ClipboardEvent) => {
			e.preventDefault()
			const text = e.clipboardData.getData('text/plain')
			if (text) {
				document.execCommand('insertText', false, text)
			}
		}, [])

		// Handle copy - serialize selection to token text
		const handleCopy = useCallback((e: React.ClipboardEvent) => {
			e.preventDefault()
			const selection = window.getSelection()
			if (!selection || selection.rangeCount === 0) return

			const range = selection.getRangeAt(0)
			const fragment = range.cloneContents()
			const tokenText = serializeDOMToValue(fragment)

			e.clipboardData.setData('text/plain', tokenText)
		}, [])

		// Handle cut - copy then delete
		const handleCut = useCallback((e: React.ClipboardEvent) => {
			handleCopy(e)
			document.execCommand('delete')
		}, [handleCopy])

		// Expose methods via ref
		useImperativeHandle(ref, () => ({
			insertPlaceholder: (token: string) => {
				if (!editorRef.current) return

				editorRef.current.focus()

				const parsed = parseToken(token)
				if (!parsed) return

				if (parsed.isStandalone) {
					// Insert standalone token
					document.execCommand('insertText', false, token)
				} else if (parsed.isPaired && !parsed.isClose) {
					// Insert paired placeholder with default text between tags
					// (avoids browser bug with empty inline elements)
					const openTag = `[${parsed.kind}${parsed.index}]`
					const closeTag = `[/${parsed.kind}${parsed.index}]`
					document.execCommand('insertText', false, openTag + 'Text' + closeTag)
				}
			},
			focus: () => {
				editorRef.current?.focus()
			},
		}))

		const showPlaceholder = !value

		return (
			<div className="relative">
				<div
					ref={editorRef}
					contentEditable={!disabled}
					onInput={handleInput}
					onPaste={handlePaste}
					onCopy={handleCopy}
					onCut={handleCut}
					className={`w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] p-4 min-h-[200px] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent whitespace-pre-wrap ${
						disabled ? 'opacity-50 cursor-not-allowed' : ''
					} ${className || ''}`}
					aria-placeholder={placeholder || ''}
					suppressContentEditableWarning
				/>
				{showPlaceholder && placeholder && (
					<div className="absolute top-4 left-4 text-[var(--text-subtle)] pointer-events-none text-sm">
						{placeholder}
					</div>
				)}
			</div>
		)
	}
)
