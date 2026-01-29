# Customer Website (`apps/www`)

Next.js 16 app with Tailwind CSS v4 and React 19.

## Routes

-   `/` - Marketing landing page
-   `/login`, `/signup` - Auth pages (email input)
-   `/auth/verify` - Turnstile verification page (shared by login/signup)
-   `/auth/check-email` - "Check your email" confirmation page
-   `/auth/enter-code` - Manual 8-character code entry page
-   `/auth/magic` - Magic link verification (redirects to `/api/auth/callback/smtp`)
-   `/onboarding` - Name setup for new users
-   `/account` - Websites overview with segment/path counts
-   `/account/website/[id]` - Language list for a website
-   `/account/website/[id]/lang/[langCd]` - Translation editor for segments and paths

## Auth Flow

The auth flow uses a shared cookie (`pantolingo-auth`) scoped to `/auth` paths that stores the email and flow type (`login` or `signup`).

**Flow:**
1. User enters email on `/login` or `/signup`
2. `prepareVerification(email, flow)` stores email+flow in cookie
3. Redirect to `/auth/verify` → Turnstile verification
4. On success, magic link email sent → redirect to `/auth/check-email`
5. User clicks email link OR enters code on `/auth/enter-code`
6. `/auth/magic` redirects to NextAuth callback → account

## Clean URLs

**Never expose `/api` routes to users.** User-facing URLs use clean paths:

| User-Facing URL | Internal Route | Method |
| --------------- | -------------- | ------ |
| `/auth/magic` | `/api/auth/callback/smtp` | Route redirect |
| `/auth/check-email` | N/A | Custom page (auth cookie) |
| `/auth/enter-code` | N/A | Custom page (auth cookie) |

## Directory Structure

```
src/
├── app/
│   ├── (marketing)/            # Public pages (/)
│   ├── (auth)/                 # Auth pages
│   │   ├── auth/               # Shared auth flow pages
│   │   │   ├── verify/         # /auth/verify - Turnstile verification
│   │   │   ├── check-email/    # /auth/check-email - "check your email"
│   │   │   ├── enter-code/     # /auth/enter-code - manual code entry
│   │   │   └── magic/          # /auth/magic - redirects to NextAuth callback
│   │   ├── login/              # /login - email input
│   │   │   └── error/          # /login/error - auth errors
│   │   ├── signup/             # /signup - email input
│   │   └── onboarding/         # /onboarding - name setup
│   ├── (account)/              # Customer account
│   │   └── account/
│   │       ├── page.tsx                        # /account - websites overview
│   │       └── website/[id]/
│   │           ├── page.tsx                    # /account/website/:id - language list
│   │           └── lang/[langCd]/page.tsx      # /account/website/:id/lang/:langCd - translations
│   ├── api/
│   │   └── auth/[...nextauth]/ # NextAuth API routes
│   └── healthz/                # Health check endpoint
├── actions/                    # Server actions
├── components/
│   ├── ui/                     # Reusable UI (Modal, Table, Badge, Lexical editor)
│   └── account/                # Account-specific (SegmentEditModal, PathEditModal, tables)
├── lib/                        # Utilities (auth, db queries)
├── proxy.ts                    # Auth middleware (route protection)
└── types/                      # TypeScript type extensions
```

## Key Components

-   `SegmentEditModal`, `PathEditModal` - Modals for editing translations
-   `LangTable`, `SegmentTable`, `PathTable` - Data tables with pagination
-   `PlaceholderEditor` - ContentEditable editor with placeholder validation

## Placeholder System

The `PlaceholderEditor` component renders and validates placeholders in translations. Placeholders must match between original and translated text.

### HTML Paired Placeholders (open/close tags)

| Code | Label | HTML Tags |
| ---- | ----- | --------- |
| `HB` | bold | `<b>`, `<strong>` |
| `HE` | emphasis | `<em>`, `<i>` |
| `HA` | anchor | `<a>` |
| `HS` | span | `<span>` |
| `HG` | element | `<u>`, `<sub>`, `<sup>`, `<mark>`, `<small>`, `<s>`, `<del>`, `<ins>`, `<abbr>`, `<q>`, `<cite>`, `<code>`, `<kbd>`, `<time>` |

### HTML Void Placeholders (self-closing, no close tag)

| Code | Label | HTML Tags |
| ---- | ----- | --------- |
| `HV` | element | `<br>`, `<hr>`, `<img>`, `<wbr>`, empty paired tags |

### Non-HTML Placeholders (standalone, no close tag)

| Code | Label | Purpose |
| ---- | ----- | ------- |
| `N` | number | Numbers (e.g., "1,234.56") |
| `E` | email | Email addresses (redacted for privacy) |
| `I` | id | Identifiers - UUIDs |
| `U` | url | URLs (with or without protocol) |
| `S` | skip | Brand names, proper nouns |

### Key Files

- `components/ui/PlaceholderEditor.tsx` - Main editor component
- `components/ui/PlaceholderIssuesBar.tsx` - Missing/extra placeholder warnings
- `components/ui/placeholder-shared.ts` - Labels, colors, tokenizer, AST parser
- `components/ui/placeholder-utils.ts` - Validation logic

## Activity Tracking

Translation edits are tracked in the `log_activity` table. Activity records are created when translation text or reviewed status changes.

### Activity Types

| Type | Description |
| ---- | ----------- |
| `segment_edit` | Segment translation text changed |
| `path_edit` | Path translation text changed |

### Details Schema

```typescript
// segment_edit
{
  translation_segment_id: number
  lang: string
  changes: {
    text?: { old: string, new: string }
    reviewed?: { old: boolean, new: boolean }
  }
}

// path_edit
{
  translation_path_id: number
  lang: string
  changes: {
    text?: { old: string, new: string }
    reviewed?: { old: boolean, new: boolean }
  }
}
```

Activity is logged when text OR reviewed status changes (or both). Both keys are optional.

### Key Files

- `actions/translations.ts` - Server actions that pass `accountId` to DB functions
- `packages/db/src/dashboard.ts` - `updateSegmentTranslation()`, `updatePathTranslation()` handle activity insertion

## Environment Variables

| Variable                | Default | Description                                       |
| ----------------------- | ------- | ------------------------------------------------- |
| `POSTGRES_DB_URL`       | -       | PostgreSQL connection string (required)           |
| `AUTH_SECRET`           | -       | NextAuth secret - generate with `openssl rand -base64 32` (required) |
| `SMTP_HOST`             | -       | SMTP server hostname (required)                   |
| `SMTP_USER`             | -       | SMTP username (required)                          |
| `SMTP_PASSWORD`         | -       | SMTP password (required)                          |
| `SMTP_FROM`             | -       | Email sender address, e.g. `noreply@pantolingo.com` (required) |
| `SMTP_PORT`             | 587     | SMTP port                                         |
| `SMTP_SECURE`           | false   | Use implicit TLS (true for port 465)              |
| `TURNSTILE_SITE_KEY` | - | Cloudflare Turnstile site key (required for auth forms) |
| `TURNSTILE_SECRET_KEY`  | -       | Cloudflare Turnstile secret key (required for auth forms) |

## Deployment (Render.com)

1. **Root Directory**: (leave empty - uses repo root)
2. **Build command**: `pnpm install && pnpm build:www`
3. **Start command**: `pnpm start:www`
4. **Build Filters**:
    - Include paths: `apps/www/**`, `packages/db/**`, `packages/lang/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`

## URL Message System

Use `?msg=` URL parameter for messages that result from redirects or navigation.

**When to use:**
- Server-side redirects (signOut, magic link errors)
- Navigation-based messages (session expired, access denied)

**When NOT to use:**
- Form action errors (use inline display with action state)
- Client-side validation errors

**Adding new messages:**
1. Add key to `lib/messages.ts` (lowercase alphanumeric only)
2. Set `page` property to restrict where message can appear
3. Redirect with `?msg=yourkey`

**Example:**
```typescript
// In server action or route handler
redirect('/login?msg=logout')

// In page with MessageDisplay
<MessageDisplay hidden={hasSubmitted} />
```
