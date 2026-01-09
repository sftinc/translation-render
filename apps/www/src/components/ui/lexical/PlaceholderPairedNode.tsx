import type {
	DOMExportOutput,
	EditorConfig,
	LexicalNode,
	NodeKey,
	SerializedElementNode,
	Spread,
} from 'lexical'
import { ElementNode } from 'lexical'
import { type PairedKind, PAIRED_COLORS, PAIRED_LABELS } from '../placeholder-shared'

// ============================================================================
// Types
// ============================================================================

export type SerializedPlaceholderPairedNode = Spread<
	{
		kind: PairedKind
		index: number
	},
	SerializedElementNode
>

// ============================================================================
// Node Implementation
// ============================================================================

export class PlaceholderPairedNode extends ElementNode {
	__kind: PairedKind
	__index: number

	static getType(): string {
		return 'placeholder-paired'
	}

	static clone(node: PlaceholderPairedNode): PlaceholderPairedNode {
		return new PlaceholderPairedNode(node.__kind, node.__index, node.__key)
	}

	constructor(kind: PairedKind, index: number, key?: NodeKey) {
		super(key)
		this.__kind = kind
		this.__index = index
	}

	// Getters
	getKind(): PairedKind {
		return this.__kind
	}

	getIndex(): number {
		return this.__index
	}

	// Get the raw token strings
	getOpenToken(): string {
		return `[${this.__kind}${this.__index}]`
	}

	getCloseToken(): string {
		return `[/${this.__kind}${this.__index}]`
	}

	// DOM creation with colored background
	createDOM(config: EditorConfig): HTMLElement {
		const span = document.createElement('span')
		const color = PAIRED_COLORS[this.__kind]
		const label = PAIRED_LABELS[this.__kind]

		// Styling for the wrapper
		span.className = 'placeholder-paired relative group/placeholder inline rounded-sm px-0.5'
		span.style.backgroundColor = `color-mix(in srgb, ${color} 15%, transparent)`

		// Store data for serialization
		span.setAttribute('data-placeholder-open', this.getOpenToken())
		span.setAttribute('data-placeholder-close', this.getCloseToken())
		span.setAttribute('data-placeholder-kind', this.__kind)
		span.setAttribute('data-placeholder-label', label)

		return span
	}

	updateDOM(prevNode: PlaceholderPairedNode, dom: HTMLElement): boolean {
		// Update if kind changed (shouldn't normally happen)
		if (prevNode.__kind !== this.__kind) {
			const color = PAIRED_COLORS[this.__kind]
			dom.style.backgroundColor = `color-mix(in srgb, ${color} 15%, transparent)`
			dom.setAttribute('data-placeholder-kind', this.__kind)
			dom.setAttribute('data-placeholder-label', PAIRED_LABELS[this.__kind])
			return false
		}
		return false
	}

	// Export to DOM for copy operations
	exportDOM(): DOMExportOutput {
		const element = document.createElement('span')
		element.setAttribute('data-placeholder-open', this.getOpenToken())
		element.setAttribute('data-placeholder-close', this.getCloseToken())
		return { element }
	}

	// This is an inline element
	isInline(): boolean {
		return true
	}

	// Allow empty content (user can delete all text inside)
	canBeEmpty(): boolean {
		return true
	}

	// Prevent merging with adjacent nodes
	canMergeWith(): boolean {
		return false
	}

	// Serialization
	static importJSON(serializedNode: SerializedPlaceholderPairedNode): PlaceholderPairedNode {
		const node = $createPlaceholderPairedNode(serializedNode.kind, serializedNode.index)
		return node
	}

	exportJSON(): SerializedPlaceholderPairedNode {
		return {
			...super.exportJSON(),
			type: 'placeholder-paired',
			kind: this.__kind,
			index: this.__index,
			version: 1,
		}
	}
}

// ============================================================================
// Factory Functions
// ============================================================================

export function $createPlaceholderPairedNode(kind: PairedKind, index: number): PlaceholderPairedNode {
	return new PlaceholderPairedNode(kind, index)
}

export function $isPlaceholderPairedNode(
	node: LexicalNode | null | undefined
): node is PlaceholderPairedNode {
	return node instanceof PlaceholderPairedNode
}
