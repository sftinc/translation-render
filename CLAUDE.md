# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT: Commit Messages

**Do NOT include "Generated with Claude Code" or similar attribution in commit messages.** Keep commit messages clean and focused on the changes only.

## Project Overview

Pantolingo is a **pnpm monorepo** with two applications and a shared database package:

- **`apps/translate`**: Translation proxy (Express) that translates websites on-the-fly
- **`apps/www`**: Customer-facing website (Next.js) for managing translation domains
- **`packages/db`**: Shared PostgreSQL database layer

**Core Use Case**: Host translated versions of a website on different domains (e.g., `es.esnipe.com` for Spanish, `fr.esnipe.com` for French) without maintaining separate codebases.

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
│       ├── src/app/
│       │   ├── (marketing)/    # Public pages (/, /pricing, /contact, /rtc)
│       │   ├── (auth)/         # Auth pages (/login, /signup)
│       │   └── (dashboard)/    # Customer dashboard (/dashboard)
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── db/                     # Shared database layer
│       ├── src/
│       │   ├── pool.ts         # PostgreSQL connection pool
│       │   ├── host.ts         # Host configuration queries
│       │   ├── segments.ts     # Translation segment queries
│       │   ├── paths.ts        # URL path mapping queries
│       │   ├── junctions.ts    # Junction table queries
│       │   └── utils/hash.ts   # Text hashing utility
│       ├── package.json
│       └── tsconfig.json
│
├── dev/postgres/               # Database schema files
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
```

## Architecture

### Translation Proxy (`apps/translate`)

The translation proxy processes each request through this pipeline:

**Cache → Fetch → Parse → Extract → Translate → Apply → Rewrite → Return**

**Key Flow**:

- Requests hit Express → Host determines target language from database (`host` table)
- Static assets (`.js`, `.css`, `.png`, etc.) are proxied directly with optional caching
- HTML content flows through the full translation pipeline
- PostgreSQL stores: host configuration, translations, and pathname mappings

**Core Modules**:

- `server.ts`: Express server entry point, database connection
- `index.ts`: Main request handler, orchestrates the pipeline
- `config.ts`: Constants and fallback configuration
- `fetch/`: DOM manipulation (parsing, extraction, application, rewriting)
- `translation/`: Translation engine (OpenRouter API, deduplication, patterns)

### Shared Database Package (`packages/db`)

Provides PostgreSQL queries and utilities used by both apps:

- `pool.ts`: Connection pool with lazy initialization (uses Proxy to defer pool creation until first query, ensuring env vars are loaded)
- `host.ts`: Host configuration queries with in-memory caching
- `segments.ts`: Batch get/upsert translations with hash-based lookups
- `paths.ts`: Bidirectional URL mapping storage
- `junctions.ts`: Junction table linking translations to pathnames
- `utils/hash.ts`: SHA-256 hashing for text lookups

**Usage in apps**:
```typescript
import { getHostConfig, batchGetTranslations } from '@pantolingo/db'
```

### Customer Website (`apps/www`)

Next.js 16 app with Tailwind CSS v4. Placeholder pages (to be implemented):

- Marketing pages: `/`, `/pricing`, `/contact`, `/rtc`
- Auth pages: `/login`, `/signup`
- Dashboard: `/dashboard`

### Database Schema

Schema file: [dev/postgres/pg-schema.sql](dev/postgres/pg-schema.sql)

**Tables** (origin-scoped model):

- `origin`: Origin websites (domain, source language)
- `host`: Translated domains (hostname, target language, config options)
- `origin_segment`: Source text segments scoped to origin (text, text_hash)
- `translated_segment`: Translations scoped to origin + language
- `origin_path`: Source URL paths scoped to origin
- `translated_path`: Translated URL paths scoped to origin + language
- `origin_path_segment`: Junction linking paths to segments (for cache invalidation)

### Environment Variables

**Important**: The `.env` file must be at the **monorepo root** (not in individual app directories). The translate app explicitly loads from `../../.env` relative to its source directory.

Required:

- `POSTGRES_DB_URL`: PostgreSQL connection string
- `OPENROUTER_API_KEY`: OpenRouter API key for translation

Optional:

- `PORT`: Server port (defaults to 8787)

See [.env.example](.env.example) for all variables.

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
   - Include paths: `apps/translate/**`, `packages/db/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`

### Customer Website (`apps/www`)

1. Create new Web Service in Render
2. Connect to same repository
3. **Root Directory**: (leave empty - uses repo root)
4. **Build command**: `pnpm install && pnpm build:www`
5. **Start command**: `pnpm start:www`
6. **Build Filters**:
   - Include paths: `apps/www/**`, `packages/db/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
7. Add environment variables (`POSTGRES_DB_URL`, etc.)

## Future Considerations (not yet implemented)

- Authentication system for `apps/www`
- User/account tables in database
- Multi-tenancy: `user_id` foreign key on `origin` and `host` tables
- Billing integration
