# Convert Pantolingo Translation Proxy to Monorepo

Convert this Node.js/Express translation proxy into a pnpm monorepo with a customer-facing Next.js website. The monorepo will support two apps sharing a common database layer.

---

## Target Structure

```
pantolingo/
├── apps/
│   ├── translate/                    # Translation proxy (Express)
│   │   ├── src/
│   │   │   ├── server.ts             # Express entry point
│   │   │   ├── index.ts              # Main request handler
│   │   │   ├── config.ts             # Constants and fallback config
│   │   │   ├── fetch/                # DOM manipulation pipeline
│   │   │   │   ├── dom-parser.ts
│   │   │   │   ├── dom-extractor.ts
│   │   │   │   ├── dom-applicator.ts
│   │   │   │   ├── dom-rewriter.ts
│   │   │   │   └── dom-metadata.ts
│   │   │   └── translation/          # Translation engine
│   │   │       ├── translate.ts
│   │   │       ├── prompts.ts
│   │   │       ├── translate-segments.ts
│   │   │       ├── translate-pathnames.ts
│   │   │       ├── skip-patterns.ts
│   │   │       ├── skip-words.ts
│   │   │       └── deduplicator.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── www/                          # Marketing + Customer dashboard (Next.js)
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx        # Root layout
│       │   │   ├── (marketing)/      # Public marketing pages
│       │   │   │   ├── page.tsx      # Home (/)
│       │   │   │   ├── pricing/
│       │   │   │   │   └── page.tsx  # /pricing
│       │   │   │   ├── contact/
│       │   │   │   │   └── page.tsx  # /contact
│       │   │   │   └── rtc/
│       │   │   │       └── page.tsx  # /rtc
│       │   │   ├── (auth)/           # Authentication pages
│       │   │   │   ├── login/
│       │   │   │   │   └── page.tsx  # /login
│       │   │   │   └── signup/
│       │   │   │       └── page.tsx  # /signup
│       │   │   └── (dashboard)/      # Authenticated customer area
│       │   │       └── dashboard/
│       │   │           └── page.tsx  # /dashboard
│       │   └── components/           # Shared UI components (empty for now)
│       ├── public/
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       └── postcss.config.js
│
├── packages/
│   └── db/                           # Shared database layer
│       ├── src/
│       │   ├── index.ts              # Public exports
│       │   ├── pool.ts               # PostgreSQL connection pool
│       │   ├── host.ts               # Host configuration queries
│       │   ├── segments.ts           # Translation segment queries
│       │   ├── paths.ts              # URL path mapping queries
│       │   ├── junctions.ts          # Junction table queries
│       │   └── utils/
│       │       └── hash.ts           # Text hashing utility
│       ├── package.json
│       └── tsconfig.json
│
├── dev/
│   └── postgres/
│       └── pg-schema.sql             # Shared database schema
│
├── package.json                      # Root workspace config
├── pnpm-workspace.yaml               # pnpm workspace definition
├── tsconfig.base.json                # Shared TypeScript config
├── .gitignore
├── .env.example                      # Document required env vars
└── CLAUDE.md                         # Updated project documentation
```

---

## Detailed Requirements

### 1. Root Configuration

**`pnpm-workspace.yaml`:**
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**Root `package.json`:**
```json
{
  "name": "pantolingo",
  "private": true,
  "scripts": {
    "dev": "pnpm --parallel -r dev",
    "dev:translate": "pnpm --filter @pantolingo/translate dev",
    "dev:www": "pnpm --filter @pantolingo/www dev",
    "build": "pnpm -r build",
    "build:translate": "pnpm --filter @pantolingo/translate build",
    "build:www": "pnpm --filter @pantolingo/www build",
    "start": "pnpm --parallel -r start",
    "start:translate": "pnpm --filter @pantolingo/translate start",
    "start:www": "pnpm --filter @pantolingo/www start"
  },
  "devDependencies": {
    "typescript": "^5.x"
  },
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

**Script summary:**
| Command | Description |
|---------|-------------|
| `pnpm dev` | Run all apps in dev mode (parallel) |
| `pnpm dev:translate` | Run translation proxy only (port 8787) |
| `pnpm dev:www` | Run Next.js website only (port 3000) |
| `pnpm build` | Build all packages and apps |
| `pnpm build:translate` | Build translation proxy only |
| `pnpm build:www` | Build Next.js website only |
| `pnpm start` | Start all apps in production mode |
| `pnpm start:translate` | Start translation proxy only |
| `pnpm start:www` | Start Next.js website only |

**`tsconfig.base.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

---

### 2. `packages/db/` — Shared Database Layer

**Extract from current project:**
- `src/db/pool.ts` → `packages/db/src/pool.ts`
- `src/db/host.ts` → `packages/db/src/host.ts`
- `src/db/segments.ts` → `packages/db/src/segments.ts`
- `src/db/paths.ts` → `packages/db/src/paths.ts`
- `src/db/junctions.ts` → `packages/db/src/junctions.ts`
- `src/utils/hash.ts` → `packages/db/src/utils/hash.ts`
- Move any TypeScript types/interfaces used by these files

**`packages/db/package.json`:**
```json
{
  "name": "@pantolingo/db",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "pg": "^8.x"
  },
  "devDependencies": {
    "@types/pg": "^8.x",
    "typescript": "^5.x"
  }
}
```

**`packages/db/src/index.ts`:**
- Export all public functions: `testConnection`, `closePool`, `getHostConfig`, `getTranslations`, `upsertTranslations`, `getPathMappings`, `upsertPathMappings`, etc.
- Export all types used by consuming apps

**`packages/db/tsconfig.json`:**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

---

### 3. `apps/translate/` — Translation Proxy

**Move current project files:**
- All files from project root into `apps/translate/`
- Remove `src/db/` (now in `packages/db/`)
- Remove `src/utils/hash.ts` (now in `packages/db/`)
- Keep `src/fetch/`, `src/translation/`, `src/server.ts`, `src/index.ts`, `src/config.ts`

**Update imports:**
- Change all `./db` or `./db/*` imports to `@pantolingo/db`
- Change `./utils/hash` imports to `@pantolingo/db` (export hash from db package)

**`apps/translate/package.json`:**
```json
{
  "name": "@pantolingo/translate",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "@pantolingo/db": "workspace:*",
    "dotenv": "^16.x",
    "express": "^4.x",
    "linkedom": "^0.x"
  },
  "devDependencies": {
    "@types/express": "^4.x",
    "@types/node": "^20.x",
    "tsx": "^4.x",
    "typescript": "^5.x"
  }
}
```

**`apps/translate/tsconfig.json`:**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

---

### 4. `apps/www/` — Customer Website (Next.js 16)

**Note:** Use Next.js 16 (latest stable, released December 2025). Requires Node.js 20.9.0+ and TypeScript 5.1.0+.

**Create new Next.js app with:**
- Next.js 16 with App Router
- TypeScript
- Tailwind CSS
- ESLint

**`apps/www/package.json`:**
```json
{
  "name": "@pantolingo/www",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "@pantolingo/db": "workspace:*",
    "next": "^16.x",
    "react": "^19.x",
    "react-dom": "^19.x"
  },
  "devDependencies": {
    "@types/node": "^20.x",
    "@types/react": "^19.x",
    "@types/react-dom": "^19.x",
    "autoprefixer": "^10.x",
    "postcss": "^8.x",
    "tailwindcss": "^3.x",
    "typescript": "^5.x"
  }
}
```

**Route structure with placeholder content:**

Each page should be a minimal placeholder that:
- Has a heading identifying the page
- Displays "Coming soon" or similar
- Verifies the routing works

```
src/app/
├── layout.tsx              # Root layout with html/body, basic metadata
├── globals.css             # Tailwind imports
├── (marketing)/
│   ├── layout.tsx          # Optional: shared marketing header/footer
│   ├── page.tsx            # Home: "Welcome to Pantolingo"
│   ├── pricing/
│   │   └── page.tsx        # "Pricing - Coming soon"
│   ├── contact/
│   │   └── page.tsx        # "Contact - Coming soon"
│   └── rtc/
│       └── page.tsx        # "RTC - Coming soon"
├── (auth)/
│   ├── login/
│   │   └── page.tsx        # "Login - Coming soon"
│   └── signup/
│       └── page.tsx        # "Sign up - Coming soon"
└── (dashboard)/
    ├── layout.tsx          # Optional: dashboard shell placeholder
    └── dashboard/
        └── page.tsx        # "Dashboard - Coming soon"
```

**Verify `@pantolingo/db` import works:**
In one page (e.g., dashboard), add:
```tsx
import { testConnection } from '@pantolingo/db'
// Just to verify the import resolves — don't call it yet
```

**`apps/www/tsconfig.json`:**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "jsx": "preserve",
    "module": "esnext",
    "moduleResolution": "bundler",
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

---

### 5. Environment Variables

**`.env.example` at root:**
```
# Database (required by both apps)
POSTGRES_DB_URL=postgresql://user:pass@host:5432/dbname

# Translation proxy
OPENROUTER_API_KEY=your-api-key
PORT=8787

# WWW (Next.js)
# Add auth-related vars here later
```

**For local development:**
- Each app can have its own `.env` file, or
- Use a root `.env` and configure apps to read from it
- Document both approaches in CLAUDE.md

---

### 6. Update CLAUDE.md

Replace current CLAUDE.md with updated documentation covering:

**Project Overview:**
- Monorepo with two apps and shared packages
- `apps/translate`: Translation proxy that translates websites on-the-fly
- `apps/www`: Customer-facing website for managing translation domains
- `packages/db`: Shared PostgreSQL database layer

**Development Commands:**
```bash
# Install all dependencies
pnpm install

# Run all apps in development
pnpm dev

# Run individual apps
pnpm dev:translate    # Translation proxy on :8787
pnpm dev:www          # Next.js website on :3000

# Build all
pnpm build

# Build individual apps
pnpm build:translate
pnpm build:www
```

**Monorepo Structure:**
- Document the full folder structure
- Explain what each app/package does
- Explain the workspace dependency pattern (`workspace:*`)

**Architecture sections:**
- Keep existing documentation for the translation proxy
- Update file paths to reflect new `apps/translate/` location
- Add section for `apps/www` (placeholder for now)
- Add section for `packages/db` explaining shared database layer

**Deployment:**
- Each app deploys as a separate Render service
- Both apps share the same PostgreSQL database
- `packages/db` is not deployed — it's bundled into each app

**Future Considerations (document but do not implement):**
- Authentication system for `apps/www`
- User/account tables in database
- Multi-tenancy: `user_id` foreign key on `origin` and `host` tables
- Billing integration

---

### 7. Files to Update/Move

| Current Location | New Location |
|-----------------|--------------|
| `src/server.ts` | `apps/translate/src/server.ts` |
| `src/index.ts` | `apps/translate/src/index.ts` |
| `src/config.ts` | `apps/translate/src/config.ts` |
| `src/fetch/*` | `apps/translate/src/fetch/*` |
| `src/translation/*` | `apps/translate/src/translation/*` |
| `src/db/*` | `packages/db/src/*` |
| `src/utils/hash.ts` | `packages/db/src/utils/hash.ts` |
| `dev/postgres/*` | `dev/postgres/*` (stays at root) |
| `package.json` | `apps/translate/package.json` (modified) |
| `tsconfig.json` | `apps/translate/tsconfig.json` (modified) |
| `CLAUDE.md` | `CLAUDE.md` (rewritten) |

---

### 8. What NOT To Do

- **Do NOT implement authentication** — just create placeholder pages
- **Do NOT change database schema** — no new tables or columns yet
- **Do NOT build actual UI** — placeholders only for `apps/www`
- **Do NOT change business logic** in the translation proxy
- **Do NOT add unnecessary dependencies**
- **Do NOT create separate layouts for each route group yet** — keep it simple
- **Do NOT set up CI/CD** — out of scope
- **Do NOT configure production deployments** — just document the approach

---

### 9. Verification Checklist

After conversion, verify:

1. `pnpm install` succeeds from root
2. `pnpm build` builds all packages and apps without errors
3. `pnpm dev:translate` starts proxy on port 8787
4. `pnpm dev:www` starts Next.js on port 3000
5. Translation proxy still works (test with existing host configuration)
6. All www routes render their placeholder pages:
   - `/` — Home
   - `/pricing` — Pricing
   - `/contact` — Contact
   - `/rtc` — RTC
   - `/login` — Login
   - `/signup` — Signup
   - `/dashboard` — Dashboard
7. `@pantolingo/db` import resolves in both apps
8. No TypeScript errors in any app or package

---

### 10. Migration Strategy (Git Workflow)

Use a feature branch to keep `main` deployable during migration.

**Step 1: Create migration branch**
```bash
git checkout main
git pull origin main
git checkout -b monorepo-migration
```

**Step 2: Do all conversion work on this branch**
- Create folder structure (`apps/`, `packages/`)
- Move files per section 7 above
- Update imports and configs
- Test locally with `pnpm dev:translate`
- Verify proxy still works against real hosts
- Commit frequently with clear messages

**Step 3: Test thoroughly before merging**
- Run full verification checklist (section 9)
- Test proxy with production database (read-only operations)
- Ensure `pnpm build` succeeds for all apps

**Step 4: Merge to main**
```bash
git checkout main
git merge monorepo-migration
git push origin main
```

**Step 5: Update Render deployment**

For pnpm monorepos, keep Root Directory empty (repo root) and use Build Filters to control when each service deploys.

For `apps/translate` (existing service):
1. Go to Render dashboard → translate service → Settings
2. **Root Directory**: (leave empty - uses repo root)
3. **Build command**: `pnpm install && pnpm build:translate`
4. **Start command**: `node apps/translate/dist/server.js`
5. **Build Filters** (Settings → Build & Deploy → Build Filters):
   - Include paths: `apps/translate/**`, `packages/db/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
6. Trigger manual deploy to verify

For `apps/www` (new service):
1. Create new Web Service in Render
2. Connect to same repository
3. **Root Directory**: (leave empty - uses repo root)
4. **Build command**: `pnpm install && pnpm build:www`
5. **Start command**: `pnpm start:www`
6. **Build Filters**:
   - Include paths: `apps/www/**`, `packages/db/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
7. Add environment variables (`POSTGRES_DB_URL`, etc.)

**Why this approach?**
- pnpm workspaces require installation from the repo root to resolve `workspace:*` dependencies
- Build Filters ensure each service only redeploys when its relevant files change
- Using root package.json scripts (`pnpm start:www`) avoids issues with pnpm hoisting binaries

**Rollback plan:**
If something breaks after merge:
```bash
git revert HEAD
git push origin main
```
Then fix issues on the branch and try again.

**During migration (if you need to hotfix production):**
```bash
# Switch to main, make fix, deploy
git stash
git checkout main
# ... make fix ...
git commit -m "hotfix: description"
git push origin main

# Return to migration work
git checkout monorepo-migration
git rebase main  # incorporate hotfix
git stash pop
```
