# Database Package (`packages/db`)

Shared PostgreSQL queries and utilities used by both apps.

## Modules

-   `pool.ts`: Connection pool with lazy initialization (uses Proxy to defer pool creation until first query, ensuring env vars are loaded)
-   `host.ts`: Host configuration queries with in-memory caching
-   `segments.ts`: Batch get/upsert translations with hash-based lookups
-   `paths.ts`: Bidirectional URL mapping storage
-   `junctions.ts`: Junction table linking translations to pathnames
-   `views.ts`: Page view recording and last_used_on timestamp updates
-   `dashboard.ts`: Dashboard CRUD operations (websites, languages, segments, paths with stats and pagination)
-   `utils/hash.ts`: SHA-256 hashing for text lookups

## Usage

```typescript
import { getHostConfig, batchGetTranslations } from '@pantolingo/db'
import { getWebsitesWithStats, updateSegmentTranslation } from '@pantolingo/db'
```

## Database Schema

**Tables** (website-scoped model):

-   `website`: Source websites (domain, source language)
-   `host`: Translated domains (hostname, target language, config options)
-   `website_segment`: Source text segments scoped to website (text, text_hash)
-   `translated_segment`: Translations scoped to website + language
-   `website_path`: Source URL paths scoped to website
-   `translated_path`: Translated URL paths scoped to website + language
-   `website_path_segment`: Junction linking paths to segments (for cache invalidation)
-   `website_path_view`: Page view analytics per path/language/date
-   `account`: User accounts (email, name, verified_at)
-   `account_website`: Junction linking accounts to websites with roles
-   `auth_session`: User sessions (session_token, account_id, expires)
-   `auth_token`: Magic link verification tokens

## Database Functions

-   `calculate_word_count()`: Counts words for both space-delimited and character-based languages (CJK, Thai, etc.), strips HTML placeholders
-   `update_updated_at_column()`: Trigger to auto-update `updated_at` timestamps
-   `set_translated_segment_word_count()` / `set_translated_path_word_count()`: Triggers to auto-calculate word counts on insert/update

## Notes

This package is not deployed separately - it's bundled into each app at build time.
