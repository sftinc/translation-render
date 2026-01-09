import type { EditorConfig, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical'
import type { ReactNode } from 'react'
import { DecoratorNode } from 'lexical'
import { type StandaloneKind, PlaceholderBadge } from '../placeholder-shared'

// ============================================================================
// Types
// ============================================================================

export type SerializedPlaceholderStandaloneNode = Spread<
	{
		kind: StandaloneKind
		index: number
	},
	SerializedLexicalNode
>

// ============================================================================
// Node Implementation
// ============================================================================

export class PlaceholderStandaloneNode extends DecoratorNode<ReactNode> {
	__kind: StandaloneKind
	__index: number

	static getType(): string {
		return 'placeholder-standalone'
	}

	static clone(node: PlaceholderStandaloneNode): PlaceholderStandaloneNode {
		return new PlaceholderStandaloneNode(node.__kind, node.__index, node.__key)
	}

	constructor(kind: StandaloneKind, index: number, key?: NodeKey) {
		super(key)
		this.__kind = kind
		this.__index = index
	}

	// Getters
	getKind(): StandaloneKind {
		return this.__kind
	}

	getIndex(): number {
		return this.__index
	}

	// Get the raw token string (e.g., "[N1]")
	getToken(): string {
		return `[${this.__kind}${this.__index}]`
	}

	// DOM creation
	createDOM(_config: EditorConfig): HTMLElement {
		const span = document.createElement('span')
		span.setAttribute('data-placeholder-token', this.getToken())
		return span
	}

	updateDOM(): false {
		return false
	}

	// Decorator nodes are inline by default, but let's be explicit
	isInline(): boolean {
		return true
	}

	// Serialization
	static importJSON(serializedNode: SerializedPlaceholderStandaloneNode): PlaceholderStandaloneNode {
		return $createPlaceholderStandaloneNode(serializedNode.kind, serializedNode.index)
	}

	exportJSON(): SerializedPlaceholderStandaloneNode {
		return {
			...super.exportJSON(),
			type: 'placeholder-standalone',
			kind: this.__kind,
			index: this.__index,
			version: 1,
		}
	}

	// Text export (for copy/paste)
	getTextContent(): string {
		return this.getToken()
	}

	// Render the badge component
	decorate(): ReactNode {
		return <PlaceholderBadge kind={this.__kind} />
	}
}

// ============================================================================
// Factory Functions
// ============================================================================

export function $createPlaceholderStandaloneNode(
	kind: StandaloneKind,
	index: number
): PlaceholderStandaloneNode {
	return new PlaceholderStandaloneNode(kind, index)
}

export function $isPlaceholderStandaloneNode(
	node: LexicalNode | null | undefined
): node is PlaceholderStandaloneNode {
	return node instanceof PlaceholderStandaloneNode
}
