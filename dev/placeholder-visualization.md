# Placeholder Visualization System

## Overview

The translation proxy uses placeholder tokens to preserve content that shouldn't be translated (numbers, emails, brand names, HTML elements). This document describes the visualization system added to the dashboard to render these placeholders as colored visual elements instead of raw text like `[N1]` or `[HB1]content[/HB1]`.

## Placeholder Types

### Standalone Placeholders (single token)

| Pattern | Type | Label | Color Variable | Use Case |
|---------|------|-------|----------------|----------|
| `[N1]`, `[N2]` | Numeric | "number" | `--ph-number` (purple) | Preserves numbers like `123.45` |
| `[P1]`, `[P2]` | PII | "email" | `--ph-email` (cyan) | Preserves email addresses |
| `[S1]`, `[S2]` | Skip | "skip" | `--ph-skip` (orange) | Preserves brand names like `eSnipe` |
| `[HG1]` (no close) | Void | "element" | `--ph-void` (slate) | Void HTML elements like `<br>`, `<img>` |

### Paired Placeholders (open + close tags)

| Pattern | Type | Tooltip | Color Variable | HTML Elements |
|---------|------|---------|----------------|---------------|
| `[HB1]...[/HB1]` | Bold | "bold" | `--ph-bold` (red) | `<b>`, `<strong>` |
| `[HE1]...[/HE1]` | Emphasis | "emphasis" | `--ph-emphasis` (blue) | `<em>`, `<i>` |
| `[HA1]...[/HA1]` | Anchor | "anchor" | `--ph-anchor` (green) | `<a>` |
| `[HS1]...[/HS1]` | Span | "span" | `--ph-span` (yellow) | `<span>` |
| `[HG1]...[/HG1]` | Generic | "element" | `--ph-generic` (gray) | `<u>`, `<sub>`, `<mark>`, etc. |

## Implementation

### Core Component: `PlaceholderText.tsx`

Location: `apps/www/src/components/ui/PlaceholderText.tsx`

```tsx
import { PlaceholderText } from '@/components/ui/PlaceholderText'

// Basic usage
<PlaceholderText text="Price [N1] USD" />

// With className
<PlaceholderText text={segment.text} className="text-sm" />
```

### How It Works

#### 1. Tokenization

The component uses regex `/\[(\/?[A-Z]+)(\d+)\]/g` to find all placeholders:

```
Input: "Click [HA1]here[/HA1] for [N1] items"

Tokens:
- { type: 'text', content: 'Click ' }
- { type: 'open', kind: 'HA', index: 1 }
- { type: 'text', content: 'here' }
- { type: 'close', kind: 'HA', index: 1 }
- { type: 'text', content: ' for ' }
- { type: 'standalone', kind: 'N', index: 1 }
- { type: 'text', content: ' items' }
```

#### 2. Classification Rules

- **N, P, S** → Always standalone (single badge)
- **HB, HE, HA, HS** → Always paired (wrap content)
- **HG** → Check if `[/HGn]` exists in text:
  - If yes → Paired wrapper
  - If no → Standalone void element

#### 3. AST Parsing

Stack-based parser builds nested structure:

```typescript
type ASTNode =
  | { type: 'text'; content: string }
  | { type: 'standalone'; kind: StandaloneKind; index: number }
  | { type: 'paired'; kind: PairedKind; index: number; children: ASTNode[] }
```

Example for `"Hello [HB1]bold with [HA1]link[/HA1] inside[/HB1] world"`:

```
[
  { type: 'text', content: 'Hello ' },
  { type: 'paired', kind: 'HB', index: 1, children: [
    { type: 'text', content: 'bold with ' },
    { type: 'paired', kind: 'HA', index: 1, children: [
      { type: 'text', content: 'link' }
    ]},
    { type: 'text', content: ' inside' }
  ]},
  { type: 'text', content: ' world' }
]
```

#### 4. Rendering

**Standalone badges:**
```tsx
<span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium mx-0.5">
  {label}  {/* "number", "email", "skip", "element" */}
</span>
```

**Paired wrappers:**
```tsx
<span className="relative group/placeholder inline rounded-sm" style={{ backgroundColor }}>
  {/* Tooltip on hover */}
  <span className="absolute bottom-full ... opacity-0 group-hover/placeholder:opacity-100">
    {label}  {/* "bold", "emphasis", "anchor", "span", "element" */}
  </span>
  {children}
</span>
```

### CSS Variables

Added to `apps/www/src/app/globals.css`:

```css
:root {
  /* Placeholder colors */
  --ph-number: #7c3aed;   /* Purple */
  --ph-email: #0891b2;    /* Cyan */
  --ph-skip: #ea580c;     /* Orange */
  --ph-void: #64748b;     /* Slate */
  --ph-bold: #dc2626;     /* Red */
  --ph-emphasis: #2563eb; /* Blue */
  --ph-anchor: #16a34a;   /* Green */
  --ph-span: #ca8a04;     /* Yellow */
  --ph-generic: #6b7280;  /* Gray */
}
```

Same colors used for light and dark modes.

## Current Usage

### SegmentTable & PathTable

Both tables use PlaceholderText with CSS overflow for truncation:

```tsx
<span className="block max-w-[400px] overflow-hidden text-ellipsis whitespace-nowrap">
  <PlaceholderText text={segment.text} />
</span>
```

### EditModal (Original Side Only)

The original text side shows placeholders visually:

```tsx
<p className="text-sm whitespace-pre-wrap">
  <PlaceholderText text={originalText} />
</p>
```

The translation textarea remains raw text (user types `[HA1]text[/HA1]` directly).

## Future: Adding to Edit Side

To add placeholder visualization to the edit/translation side of the modal, you have two options:

### Option A: Live Preview Below Textarea

Keep the textarea for raw input, add a preview below:

```tsx
<textarea value={value} onChange={(e) => setValue(e.target.value)} />
<div className="mt-2 p-2 border rounded">
  <span className="text-xs text-muted">Preview:</span>
  <PlaceholderText text={value} />
</div>
```

### Option B: ContentEditable with Placeholder Rendering

Replace textarea with contentEditable div that renders placeholders inline. This is more complex:

1. Render PlaceholderText inside a contentEditable div
2. On input, extract raw text (strip rendering, keep placeholder tokens)
3. Re-render with PlaceholderText
4. Handle cursor position preservation

Challenges:
- Cursor position management when re-rendering
- Extracting raw text from rendered DOM
- Handling paste events
- Mobile/IME support

### Option C: Rich Text Editor

Use a library like Slate.js or ProseMirror with custom inline elements for placeholders.

**Recommendation:** Start with Option A (preview) - it's simple and gives users visibility without complexity.

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| No closing tag = standalone HG | Simpler than tracking which HG tags are void elements |
| CSS overflow instead of JS truncate | Prevents breaking placeholders mid-token |
| Same colors light/dark | Keeps colors vibrant and consistent |
| No accessibility features | Internal tooling, not user-facing |
| Simple regex parsing | Good enough performance, optimize later if needed |

## Files Reference

| File | Purpose |
|------|---------|
| `apps/www/src/components/ui/PlaceholderText.tsx` | Core parser and renderer |
| `apps/www/src/app/globals.css` | CSS color variables |
| `apps/www/src/components/dashboard/SegmentTable.tsx` | Uses PlaceholderText |
| `apps/www/src/components/dashboard/PathTable.tsx` | Uses PlaceholderText |
| `apps/www/src/components/dashboard/EditModal.tsx` | Uses PlaceholderText (original side) |
| `apps/translate/src/translation/prompts.ts` | Placeholder pattern definitions (source of truth) |

## Regex Pattern

The canonical placeholder regex from `prompts.ts`:

```
/\[(\/?[A-Z]+)(\d+)\]/g
```

Matches:
- `[N1]` - Opening/standalone (group 1: "N", group 2: "1")
- `[/HB1]` - Closing (group 1: "/HB", group 2: "1")

Does NOT match (treated as regular text):
- `[required]` - lowercase
- `[A]` - no number
- `[0]` - no letters
- `[a1]` - lowercase
