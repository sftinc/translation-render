# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# IMPORTANT User Instructions

-   **Commit messages**: Do NOT include "Generated with Claude Code" or similar attribution. Keep commit messages clean and focused on the changes only.

-   **Planning Agent**

    -   Include a **clickable markdown link** to the plan file at the end of the plan
    -   Format: `[filename.md](../../../../.claude/plans/filename.md)`

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
│   ├── translate/              # Translation proxy (Express)
│   │   ├── src/
│   │   │   ├── server.ts       # Express entry point
│   │   │   ├── index.ts        # Main request handler
│   │   │   ├── config.ts       # Constants and fallback config
│   │   │   ├── fetch/          # DOM manipulation pipeline
│   │   │   └── translation/    # Translation engine
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── www/                    # Customer website (Next.js)
│       ├── src/
│       │   ├── app/
│       │   │   ├── (marketing)/    # Public pages (/)
│       │   │   ├── (auth)/         # Auth pages (/login, /signup)
│       │   │   └── (dashboard)/    # Customer dashboard
│       │   │       └── dashboard/
│       │   │           ├── page.tsx                        # /dashboard - origins overview
│       │   │           └── origin/[id]/
│       │   │               ├── page.tsx                    # /dashboard/origin/:id - language list
│       │   │               └── lang/[langCd]/page.tsx      # /dashboard/origin/:id/lang/:langCd - translations
│       │   ├── actions/            # Server actions
│       │   ├── components/         # React components
│       │   │   ├── ui/             # Reusable UI (Modal, Table, Badge, Lexical editor)
│       │   │   └── dashboard/      # Dashboard-specific (EditModal, LangTable, OriginCard)
│       │   └── lib/                # Utilities
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── db/                     # Shared database layer
│   │   ├── src/
│   │   │   ├── pool.ts         # PostgreSQL connection pool (lazy init via Proxy)
│   │   │   ├── host.ts         # Host configuration queries with caching
│   │   │   ├── segments.ts     # Translation segment queries
│   │   │   ├── paths.ts        # URL path mapping queries
│   │   │   ├── junctions.ts    # Junction table queries
│   │   │   ├── views.ts        # Page view analytics
│   │   │   ├── dashboard.ts    # Dashboard CRUD operations for www app
│   │   │   └── utils/hash.ts   # SHA-256 hashing utility
│   │   └── package.json
│   │
│   └── lang/                   # Shared language utilities
│       ├── src/
│       │   ├── index.ts        # Exports all language utilities
│       │   ├── data.ts         # Static language data (41 supported languages)
│       │   ├── info.ts         # Intl.DisplayNames-based language info
│       │   └── lookup.ts       # Country/language mappings, RTL detection
│       └── package.json
│
├── package.json                # Root workspace config
├── pnpm-workspace.yaml         # pnpm workspace definition
└── tsconfig.base.json          # Shared TypeScript config
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

# Clean all node_modules and reinstall (useful for fixing dependency issues)
pnpm clean
```

## Architecture

### Translation Proxy (`apps/translate`)

The translation proxy processes each request through this pipeline:

**Cache → Fetch → Parse → Extract → Translate → Apply → Rewrite → Return**

**Key Flow**:

-   Requests hit Express → Host determines target language from database (`host` table)
-   Static assets (`.js`, `.css`, `.png`, etc.) are proxied directly with optional caching
-   HTML content flows through the full translation pipeline
-   PostgreSQL stores: host configuration, translations, and pathname mappings

**Core Modules**:

-   `server.ts`: Express server entry point, database connection
-   `index.ts`: Main request handler, orchestrates the pipeline
-   `config.ts`: Constants and fallback configuration
-   `fetch/`: DOM manipulation (parsing, extraction, application, rewriting)
-   `translation/`: Translation engine (OpenRouter API, deduplication, patterns)

**HTML Placeholder System**:

Inline HTML elements are converted to placeholders during translation to preserve formatting:

| Type | Tags                                    | Example              |
| ---- | --------------------------------------- | -------------------- |
| `HB` | `<b>`, `<strong>`                       | `[HB1]bold[/HB1]`    |
| `HE` | `<em>`, `<i>`                           | `[HE1]italic[/HE1]`  |
| `HA` | `<a>`                                   | `[HA1]link[/HA1]`    |
| `HS` | `<span>`                                | `[HS1]styled[/HS1]`  |
| `HG` | `<u>`, `<sub>`, `<sup>`, `<mark>`, etc. | `[HG1]text[/HG1]`    |
| `HV` | `<br>`, `<hr>`, `<img>`, `<wbr>` (void) | `[HV1]` (no closing) |

Defined in `config.ts` (`HTML_TAG_MAP`, `VOID_TAGS`). Logic in `fetch/dom-placeholders.ts`.

**Translation Engine**:

-   Uses OpenRouter API (configured in `translation/translate.ts`)
-   Prompts defined in `translation/prompts.ts` (SEGMENT_PROMPT for text, PATHNAME_PROMPT for URLs)
-   Skip patterns in `translation/skip-patterns.ts` (PII, numeric, code detection)

### Shared Database Package (`packages/db`)

Provides PostgreSQL queries and utilities used by both apps:

-   `pool.ts`: Connection pool with lazy initialization (uses Proxy to defer pool creation until first query, ensuring env vars are loaded)
-   `host.ts`: Host configuration queries with in-memory caching
-   `segments.ts`: Batch get/upsert translations with hash-based lookups
-   `paths.ts`: Bidirectional URL mapping storage
-   `junctions.ts`: Junction table linking translations to pathnames
-   `views.ts`: Page view recording and last_used_on timestamp updates
-   `dashboard.ts`: Dashboard CRUD operations (origins, languages, segments, paths with stats and pagination)
-   `utils/hash.ts`: SHA-256 hashing for text lookups

**Usage in apps**:

```typescript
import { getHostConfig, batchGetTranslations } from '@pantolingo/db'
import { getOriginsWithStats, updateSegmentTranslation } from '@pantolingo/db'
```

### Shared Language Package (`packages/lang`)

Provides language metadata and utilities using **lowercase BCP 47 regional codes** (e.g., `es-mx`, `pt-br`) and `Intl.DisplayNames`:

-   41 supported languages with localized display names
-   Flag emoji generation from country codes
-   RTL language detection (Arabic, Hebrew, Farsi, Urdu)
-   Country-language mappings

**Usage in apps**:

```typescript
import { getLanguageInfo, isRtlLanguage, SUPPORTED_LANGUAGES } from '@pantolingo/lang'
```

### Customer Website (`apps/www`)

Next.js 16 app with Tailwind CSS v4 and React 19.

**Routes**:

-   `/` - Marketing landing page
-   `/login`, `/signup` - Auth pages
-   `/dashboard` - Origins overview with segment/path counts
-   `/dashboard/origin/[id]` - Language list for an origin
-   `/dashboard/origin/[id]/lang/[langCd]` - Translation editor for segments and paths

**Key Components**:

-   `EditModal` - Modal with Lexical-based editor for editing translations
-   `LangTable`, `SegmentTable`, `PathTable` - Data tables with pagination
-   `PlaceholderEditor` - Lexical editor with placeholder validation (preserves `[HB1]...[/HB1]` formatting)

### Database Schema

**Tables** (origin-scoped model):

-   `origin`: Origin websites (domain, source language)
-   `host`: Translated domains (hostname, target language, config options)
-   `origin_segment`: Source text segments scoped to origin (text, text_hash)
-   `translated_segment`: Translations scoped to origin + language
-   `origin_path`: Source URL paths scoped to origin
-   `translated_path`: Translated URL paths scoped to origin + language
-   `origin_path_segment`: Junction linking paths to segments (for cache invalidation)
-   `origin_path_view`: Page view analytics per path/language/date
-   `account`: Accounts (for multi-tenant billing)
-   `account_profile`: Account membership with roles
-   `profile`: User profiles (email, name)

**Database functions**:

-   `calculate_word_count()`: Counts words for both space-delimited and character-based languages (CJK, Thai, etc.), strips HTML placeholders
-   `update_updated_at_column()`: Trigger to auto-update `updated_at` timestamps
-   `set_translated_segment_word_count()` / `set_translated_path_word_count()`: Triggers to auto-calculate word counts on insert/update

### Environment Variables

**Important**: The `.env` file must be at the **monorepo root**. Both apps load from there:

-   `translate` app: loads via dotenv in `server.ts`
-   `www` app: loads via dotenv in `next.config.ts`

Copy `.env.example` to `.env` and fill in your values. Never commit `.env` to version control.

#### Required Variables

| Variable             | Used By   | Description                                                                                                                                                                               |
| -------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_DB_URL`    | Both apps | PostgreSQL connection string. Format: `postgresql://[user]:[password]@[host]:[port]/[database]?sslmode=require`. Both apps connect to the same database via the `@pantolingo/db` package. |
| `OPENROUTER_API_KEY` | translate | API key for [OpenRouter](https://openrouter.ai/keys). Powers AI translations by routing requests to LLMs (Claude, GPT, etc.). Required for the translation proxy to function.             |

#### Optional Variables

| Variable                | Used By   | Default | Description                                                                                                                            |
| ----------------------- | --------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                  | translate | `8787`  | Port the translation proxy listens on.                                                                                                 |
| `DASHBOARD_ALLOWED_IPS` | www       | (none)  | Comma-separated IP allowlist for dashboard access. If set, only listed IPs can access `/dashboard/*` routes. Leave unset to allow all. |
| `GOOGLE_PROJECT_ID`     | translate | (none)  | Google Cloud project ID. Currently unused, reserved for future Google Translate API integration.                                       |

#### Render.com Deployment

When deploying to Render, add these environment variables to each service:

**translate service**: `POSTGRES_DB_URL`, `OPENROUTER_API_KEY`, `PORT` (optional)

**www service**: `POSTGRES_DB_URL`, `DASHBOARD_ALLOWED_IPS` (optional)

## Deployment (Render.com)

Each app deploys as a separate Render service. Both apps share the same PostgreSQL database.
`packages/db` is not deployed — it's bundled into each app.

**For pnpm monorepos**, keep Root Directory empty (repo root) and use Build Filters:

### Translation Proxy (`apps/translate`)

1. Go to Render dashboard → translate service → Settings
2. **Root Directory**: (leave empty - uses repo root)
3. **Build command**: `pnpm install && pnpm build:translate`
4. **Start command**: `node apps/translate/dist/server.js`
5. **Build Filters** (Settings → Build & Deploy → Build Filters):
    - Include paths: `apps/translate/**`, `packages/db/**`, `packages/lang/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`

### Customer Website (`apps/www`)

1. Create new Web Service in Render
2. Connect to same repository
3. **Root Directory**: (leave empty - uses repo root)
4. **Build command**: `pnpm install && pnpm build:www`
5. **Start command**: `pnpm start:www`
6. **Build Filters**:
    - Include paths: `apps/www/**`, `packages/db/**`, `packages/lang/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
7. Add environment variables (`POSTGRES_DB_URL`, etc.)

## Testing and Linting

No test framework or linter is currently configured. TypeScript compilation (`tsc`) is the only code quality check.
