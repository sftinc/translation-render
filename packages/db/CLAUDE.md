# Database Package (`packages/db`)

Shared PostgreSQL queries and utilities used by both apps.

## Modules

-   `pool.ts`: Connection pool with lazy initialization (uses Proxy to defer pool creation until first query, ensuring env vars are loaded)
-   `translation.ts`: Translation configuration queries with in-memory caching
-   `segments.ts`: Batch get/upsert translations with hash-based lookups
-   `paths.ts`: Bidirectional URL mapping storage
-   `junctions.ts`: Junction table linking translations to pathnames
-   `views.ts`: Page view recording and last_used_on timestamp updates
-   `dashboard.ts`: Dashboard CRUD operations (websites, languages, segments, paths with stats and pagination)
-   `utils/hash.ts`: SHA-256 hashing for text lookups

## Usage

```typescript
import { getTranslationConfig, batchGetTranslations } from '@pantolingo/db'
import { getWebsitesWithStats, updateSegmentTranslation } from '@pantolingo/db'
```

## Database Schema

**Tables** (website-scoped model):

-   `website`: Source websites (hostname, source language)
-   `translation`: Translated domains (hostname, target language, config options)
-   `website_segment`: Source text segments scoped to website (text, text_hash)
-   `translation_segment`: Translations scoped to website + language
-   `website_path`: Source URL paths scoped to website
-   `translation_path`: Translated URL paths scoped to website + language
-   `website_path_segment`: Junction linking paths to segments (for cache invalidation)
-   `stats_page_view`: Page view analytics per path/language/date
-   `account`: User accounts (email, name, verified_at)
-   `account_website`: Junction linking accounts to websites with roles
-   `auth_session`: User sessions (session_token, account_id, expires)
-   `auth_token`: Magic link verification tokens (with 8-char code for manual entry, failed_attempts for brute force protection)

## Database Functions

-   `calculate_word_count()`: Counts words for both space-delimited and character-based languages (CJK, Thai, etc.), strips HTML placeholders
-   `update_updated_at_column()`: Trigger to auto-update `updated_at` timestamps
-   `set_translation_segment_word_count()` / `set_translation_path_word_count()`: Triggers to auto-calculate word counts on insert/update

## Notes

This package is not deployed separately - it's bundled into each app at build time.
