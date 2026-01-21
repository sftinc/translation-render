# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# IMPORTANT User Instructions

-   **Commit messages**: Do NOT include "Generated with Claude Code" or similar attribution. Keep commit messages clean and focused on the changes only.

-   **Planning Agent**

    -   Include the plan name at the end of the plan: `Plan Name: {thePlanName}`

-   **Todo files**: When creating future work items, add a file to `todo/` named `todo_<task-name>.md`.
    -   `## Summary` - describe the change(s)
    -   `## Why` - rationale (tables helpful for comparing current vs proposed)
    -   `## Phase N: Name` - break into deployable phases with **Goal:** and `- [ ]` checkboxes
    -   `### Details` - numbered implementation steps with file paths
    -   `## Open Questions` - unresolved decisions (optional)

## Project Overview

Pantolingo is a **pnpm monorepo** with two applications and shared packages:

-   **`apps/translate`**: Translation proxy (Express) that translates websites on-the-fly
-   **`apps/www`**: Customer-facing website (Next.js) for managing translation domains
-   **`packages/db`**: Shared PostgreSQL database layer
-   **`packages/lang`**: Shared language utilities (41 supported languages, RTL detection)

**Core Use Case**: Host translated versions of a website on different domains (e.g., `es.esnipe.com` for Spanish, `fr.esnipe.com` for French) without maintaining separate codebases.

## Prerequisites

-   Node.js >= 20.0.0
-   pnpm >= 8.0.0

## Monorepo Structure

```
pantolingo/
├── apps/
│   ├── translate/      # Translation proxy (Express) - see apps/translate/CLAUDE.md
│   └── www/            # Customer website (Next.js) - see apps/www/CLAUDE.md
├── packages/
│   ├── db/             # Shared database layer - see packages/db/CLAUDE.md
│   └── lang/           # Shared language utilities - see packages/lang/CLAUDE.md
├── package.json        # Root workspace config
├── pnpm-workspace.yaml # pnpm workspace definition
└── tsconfig.base.json  # Shared TypeScript config
```

## Development Commands

```bash
# Install all dependencies
pnpm install

# Run all apps in development (parallel)
pnpm dev

# Run individual apps
pnpm dev:translate    # Translation proxy on :8787
pnpm dev:www          # Next.js website on :3000

# Build all packages and apps
pnpm build

# Build individual apps
pnpm build:translate
pnpm build:www

# Start all apps in production mode
pnpm start

# Start individual apps
pnpm start:translate
pnpm start:www

# Clean all node_modules and reinstall
pnpm clean
```

## Environment Variables

The `.env` file must be at the **monorepo root**. Both apps load from there.

Copy `.env.example` to `.env` and fill in your values. Never commit `.env` to version control.

| Variable             | Used By   | Description                                      |
| -------------------- | --------- | ------------------------------------------------ |
| `POSTGRES_DB_URL`    | Both apps | PostgreSQL connection string (required)          |
| `OPENROUTER_API_KEY` | translate | API key for OpenRouter (required for translate)  |

See app-specific CLAUDE.md files for additional environment variables.

## Testing

Uses **Vitest** for unit and integration tests.

```bash
pnpm test          # Run all tests once
pnpm test:watch    # Watch mode (re-runs on file changes)
```

### Test File Conventions

- Place tests next to source files: `foo.ts` → `foo.test.ts`
- Use `.test.ts` extension

### Test-Driven Development (TDD)

When requested (or when implementing complex logic), follow TDD:

1. **Red**: Write a failing test first with expected input/output
2. **Green**: Write minimum code to make the test pass
3. **Refactor**: Clean up while keeping tests green

```typescript
// Example: foo.test.ts
import { describe, it, expect } from 'vitest'
import { myFunction } from './foo.js'

describe('myFunction', () => {
  it('returns expected output for given input', () => {
    expect(myFunction('input')).toBe('expected')
  })
})
```

### When to Write Tests

- Complex business logic or algorithms
- Bug fixes (write test to reproduce, then fix)
- Database queries (test with real data scenarios)
- When the user requests TDD approach

## Linting

No linter currently configured. TypeScript compilation (`tsc`) is the primary code quality check.
