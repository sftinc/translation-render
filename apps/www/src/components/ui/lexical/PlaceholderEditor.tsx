'use client'

import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
} from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
	$getRoot,
	$getSelection,
	$isRangeSelection,
	$createTextNode,
	$createParagraphNode,
	COMMAND_PRIORITY_LOW,
	PASTE_COMMAND,
	COPY_COMMAND,
	CUT_COMMAND,
	type LexicalEditor,
	type LexicalNode,
} from 'lexical'

import {
	type StandaloneKind,
	type PairedKind,
	PLACEHOLDER_REGEX,
	STANDALONE_KINDS,
	PAIRED_KINDS,
	isStandaloneKind,
	isPairedKind,
} from '../placeholder-shared'
import {
	PlaceholderStandaloneNode,
	$createPlaceholderStandaloneNode,
	$isPlaceholderStandaloneNode,
} from './PlaceholderStandaloneNode'
import {
	PlaceholderPairedNode,
	$createPlaceholderPairedNode,
	$isPlaceholderPairedNode,
} from './PlaceholderPairedNode'
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
// Serialization: Text <-> Lexical
// ============================================================================

/**
 * Parse placeholder text into Lexical nodes
 */
function parseTextToNodes(text: string): void {
	const root = $getRoot()
	root.clear()

	const paragraph = $createParagraphNode()
	root.append(paragraph)

	if (!text) return

	const regex = new RegExp(PLACEHOLDER_REGEX.source, 'g')
	let lastIndex = 0
	let match: RegExpExecArray | null

	// Collect all matches first
	const matches: Array<{
		fullMatch: string
		kind: string
		index: number
		isClose: boolean
		start: number
		end: number
	}> = []

	while ((match = regex.exec(text)) !== null) {
		const kindPart = match[1]
		const indexNum = parseInt(match[2], 10)
		const isClose = kindPart.startsWith('/')
		const kind = isClose ? kindPart.slice(1) : kindPart

		matches.push({
			fullMatch: match[0],
			kind,
			index: indexNum,
			isClose,
			start: match.index,
			end: match.index + match[0].length,
		})
	}

	// Build nodes using a stack for paired elements
	type StackItem = { kind: PairedKind; index: number; node: PlaceholderPairedNode }
	const stack: StackItem[] = []

	function getCurrentParent() {
		return stack.length > 0 ? stack[stack.length - 1].node : paragraph
	}

	function addTextNode(content: string) {
		if (content) {
			getCurrentParent().append($createTextNode(content))
		}
	}

	for (const m of matches) {
		// Add text before this match
		if (m.start > lastIndex) {
			addTextNode(text.slice(lastIndex, m.start))
		}

		if (m.isClose) {
			// Closing tag - find matching open
			for (let i = stack.length - 1; i >= 0; i--) {
				if (stack[i].kind === m.kind && stack[i].index === m.index) {
					// Close all tags from i to end
					const closed = stack.splice(i)
					const closedNode = closed[0].node

					// Append closed node to new parent
					getCurrentParent().append(closedNode)
					break
				}
			}
		} else if (isStandaloneKind(m.kind)) {
			// Standalone placeholder
			const node = $createPlaceholderStandaloneNode(m.kind as StandaloneKind, m.index)
			getCurrentParent().append(node)
		} else if (isPairedKind(m.kind)) {
			// Opening tag - push to stack
			const node = $createPlaceholderPairedNode(m.kind as PairedKind, m.index)
			stack.push({ kind: m.kind as PairedKind, index: m.index, node })
		}

		lastIndex = m.end
	}

	// Add remaining text
	if (lastIndex < text.length) {
		addTextNode(text.slice(lastIndex))
	}

	// Handle unclosed tags - append them to paragraph
	while (stack.length > 0) {
		const unclosed = stack.pop()!
		getCurrentParent().append(unclosed.node)
	}
}

/**
 * Serialize Lexical state to placeholder text
 */
function serializeNodesToText(editor: LexicalEditor): string {
	let result = ''

	editor.getEditorState().read(() => {
		const root = $getRoot()

		function traverse(node: LexicalNode): void {
			if ($isPlaceholderStandaloneNode(node)) {
				result += node.getToken()
			} else if ($isPlaceholderPairedNode(node)) {
				result += node.getOpenToken()
				for (const child of node.getChildren()) {
					traverse(child)
				}
				result += node.getCloseToken()
			} else if (node.getType() === 'text') {
				result += node.getTextContent()
			} else if (node.getType() === 'linebreak') {
				result += '\n'
			} else if ('getChildren' in node && typeof node.getChildren === 'function') {
				for (const child of (node as { getChildren: () => LexicalNode[] }).getChildren()) {
					traverse(child)
				}
			}
		}

		for (const child of root.getChildren()) {
			traverse(child)
		}
	})

	return result
}

// ============================================================================
// Plugins
// ============================================================================

/**
 * Plugin to sync external value with editor state
 */
function ValueSyncPlugin({
	value,
	onChange,
}: {
	value: string
	onChange: (value: string) => void
}) {
	const [editor] = useLexicalComposerContext()
	const isExternalUpdate = useRef(false)
	const lastValue = useRef(value)

	// Sync external value changes to editor
	useEffect(() => {
		if (value !== lastValue.current) {
			isExternalUpdate.current = true
			lastValue.current = value

			editor.update(() => {
				parseTextToNodes(value)
			})

			// Reset flag after update completes
			setTimeout(() => {
				isExternalUpdate.current = false
			}, 0)
		}
	}, [editor, value])

	// Sync editor changes to external value
	useEffect(() => {
		return editor.registerUpdateListener(({ editorState }) => {
			if (isExternalUpdate.current) return

			const newValue = serializeNodesToText(editor)
			if (newValue !== lastValue.current) {
				lastValue.current = newValue
				onChange(newValue)
			}
		})
	}, [editor, onChange])

	return null
}

/**
 * Plugin for placeholder-aware clipboard handling
 */
function ClipboardPlugin() {
	const [editor] = useLexicalComposerContext()

	useEffect(() => {
		// Handle paste - parse placeholder tokens from plain text
		const removePaste = editor.registerCommand(
			PASTE_COMMAND,
			(event: ClipboardEvent) => {
				const clipboardData = event.clipboardData
				if (!clipboardData) return false

				const text = clipboardData.getData('text/plain')
				if (!text) return false

				event.preventDefault()

				editor.update(() => {
					const selection = $getSelection()
					if (!$isRangeSelection(selection)) return

					// Delete selected content
					selection.removeText()

					// Parse and insert the pasted text
					const regex = new RegExp(PLACEHOLDER_REGEX.source, 'g')
					let lastIndex = 0
					let match: RegExpExecArray | null

					while ((match = regex.exec(text)) !== null) {
						// Insert text before match
						if (match.index > lastIndex) {
							selection.insertText(text.slice(lastIndex, match.index))
						}

						// Parse the placeholder token
						const parsed = parseToken(match[0])
						if (parsed) {
							if (parsed.isStandalone) {
								const node = $createPlaceholderStandaloneNode(
									parsed.kind as StandaloneKind,
									parsed.index
								)
								selection.insertNodes([node])
							} else if (parsed.isPaired && !parsed.isClose) {
								// For paired placeholders, just insert as text for now
								// (user can use toolbar for proper paired insertion)
								selection.insertText(match[0])
							} else {
								// Closing tag or unknown - insert as text
								selection.insertText(match[0])
							}
						}

						lastIndex = match.index + match[0].length
					}

					// Insert remaining text
					if (lastIndex < text.length) {
						selection.insertText(text.slice(lastIndex))
					}
				})

				return true
			},
			COMMAND_PRIORITY_LOW
		)

		// Helper to serialize a node to text with placeholder tokens
		function serializeNode(node: LexicalNode): string {
			if ($isPlaceholderStandaloneNode(node)) {
				return node.getToken()
			} else if ($isPlaceholderPairedNode(node)) {
				let inner = ''
				for (const child of node.getChildren()) {
					inner += serializeNode(child)
				}
				return node.getOpenToken() + inner + node.getCloseToken()
			} else {
				return node.getTextContent()
			}
		}

		// Handle copy - serialize to plain text with tokens
		const removeCopy = editor.registerCommand(
			COPY_COMMAND,
			(event: ClipboardEvent) => {
				const selection = $getSelection()
				if (!$isRangeSelection(selection)) return false

				// Get selected text with placeholder tokens properly serialized
				let text = ''
				const nodes = selection.getNodes()

				for (const node of nodes) {
					text += serializeNode(node)
				}

				event.clipboardData?.setData('text/plain', text)
				event.preventDefault()
				return true
			},
			COMMAND_PRIORITY_LOW
		)

		// Handle cut - same as copy but also delete
		const removeCut = editor.registerCommand(
			CUT_COMMAND,
			(event: ClipboardEvent) => {
				const selection = $getSelection()
				if (!$isRangeSelection(selection)) return false

				// Copy first with proper serialization
				let text = ''
				const nodes = selection.getNodes()

				for (const node of nodes) {
					text += serializeNode(node)
				}

				event.clipboardData?.setData('text/plain', text)

				// Then delete
				editor.update(() => {
					selection.removeText()
				})

				event.preventDefault()
				return true
			},
			COMMAND_PRIORITY_LOW
		)

		return () => {
			removePaste()
			removeCopy()
			removeCut()
		}
	}, [editor])

	return null
}

/**
 * Plugin to expose ref methods
 */
function RefPlugin({
	editorRef,
}: {
	editorRef: React.MutableRefObject<PlaceholderEditorRef | null>
}) {
	const [editor] = useLexicalComposerContext()

	useImperativeHandle(editorRef, () => ({
		insertPlaceholder: (token: string) => {
			const parsed = parseToken(token)
			if (!parsed) return

			editor.update(() => {
				const selection = $getSelection()
				if (!$isRangeSelection(selection)) return

				if (parsed.isStandalone) {
					const node = $createPlaceholderStandaloneNode(
						parsed.kind as StandaloneKind,
						parsed.index
					)
					selection.insertNodes([node])
				} else if (parsed.isPaired && !parsed.isClose) {
					// Insert empty paired node with cursor inside
					const node = $createPlaceholderPairedNode(
						parsed.kind as PairedKind,
						parsed.index
					)
					selection.insertNodes([node])
					// Move cursor inside the node
					node.selectStart()
				}
			})
		},
		focus: () => {
			editor.focus()
		},
	}))

	return null
}

// ============================================================================
// Main Component
// ============================================================================

function onError(error: Error) {
	console.error('Lexical error:', error)
}

export const PlaceholderEditor = forwardRef<PlaceholderEditorRef, PlaceholderEditorProps>(
	function PlaceholderEditor(
		{ value, onChange, placeholder, disabled, className },
		ref
	) {
		const editorRef = useRef<PlaceholderEditorRef | null>(null)

		// Forward ref
		useImperativeHandle(ref, () => editorRef.current!, [])

		const initialConfig = {
			namespace: 'PlaceholderEditor',
			onError,
			nodes: [PlaceholderStandaloneNode, PlaceholderPairedNode],
			editable: !disabled,
			editorState: () => {
				parseTextToNodes(value)
			},
		}

		const placeholderElement = placeholder ? (
			<div className="absolute top-4 left-4 text-[var(--text-subtle)] pointer-events-none text-sm">
				{placeholder}
			</div>
		) : (
			<div />
		)

		return (
			<LexicalComposer initialConfig={initialConfig}>
				<div className="relative">
					<PlainTextPlugin
						contentEditable={
							<ContentEditable
								className={`w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] p-4 min-h-[200px] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent whitespace-pre-wrap ${
									disabled ? 'opacity-50 cursor-not-allowed' : ''
								} ${className || ''}`}
								aria-placeholder={placeholder || ''}
								placeholder={placeholderElement}
							/>
						}
						ErrorBoundary={LexicalErrorBoundary}
					/>
					<ValueSyncPlugin value={value} onChange={onChange} />
					<ClipboardPlugin />
					<RefPlugin editorRef={editorRef} />
				</div>
			</LexicalComposer>
		)
	}
)
