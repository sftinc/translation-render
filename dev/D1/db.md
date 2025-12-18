# Database Schema - Translation Proxy

## Overview

D1 database schema for storing host configuration (replaces `HOST_SETTINGS` in `config.ts`) and translation cache (replaces Cloudflare KV cache).

## Schema Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     DATABASE SCHEMA                                  │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│       user           │
├──────────────────────┤
│ id (INTEGER PK)      │
│ email (TEXT UNIQUE)  │
│ name (TEXT)          │
│ created_at (INTEGER) │
│ updated_at (INTEGER) │
└──────────────────────┘
          │
          │ 1:N
          ▼
┌──────────────────────┐
│      origin          │
├──────────────────────┤
│ id (INTEGER PK)      │
│ user_id (INTEGER FK) │
│ domain (TEXT UNIQUE) │     Example: 'www.find-your-item.com'
│ origin_lang (TEXT)   │     Source language (e.g., 'en')
│ created_at (INTEGER) │
│ updated_at (INTEGER) │
└──────────────────────┘
          │
          │ 1:N
          ▼
┌─────────────────────────────┐
│          host               │  ◄─── Replaces HOST_SETTINGS config
├─────────────────────────────┤
│ id (INTEGER PK)             │
│ origin_id (INTEGER FK)      │
│ hostname (TEXT UNIQUE)      │     Example: 'sp.find-your-item.com'
│ target_lang (TEXT)          │     Example: 'es', 'fr', 'de'
│ skip_words (TEXT)           │     JSON: '["Find-Your-Item","eBay"]'
│ skip_patterns (TEXT)        │     JSON: '["numeric"]'
│ enabled (INTEGER DEFAULT 1) │
│ created_at (INTEGER)        │
│ updated_at (INTEGER)        │
└─────────────────────────────┘
          │
          │ 1:N
          ├────────────────────────────┐
          │                            │
          ▼                            ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│        pathname             │   │      translation            │  ◄─── Per-host translations
├─────────────────────────────┤   ├─────────────────────────────┤
│ id (INTEGER PK)             │   │ id (INTEGER PK)             │
│ host_id (INTEGER FK)        │   │ host_id (INTEGER FK)        │  ◄─── Scoped to host
│ path (TEXT)                 │   │ origin_text (TEXT)          │
│ translated_path (TEXT)      │   │ translated_text (TEXT)      │
│ hit_count (INT DEFAULT 1)   │   │ kind (TEXT)                 │  'text','title','meta','attribute'
│ created_at (INTEGER)        │   │ text_hash (TEXT)            │  Hash for fast lookup
│                             │   │ created_at (INTEGER)        │
│ UNIQUE(host_id, path)       │   │ updated_at (INTEGER)        │
│                             │   │                             │
│ NOTE: path is ALWAYS the    │   │ UNIQUE(host_id, text_hash)  │
│ origin pathname             │   └─────────────────────────────┘
└─────────────────────────────┘                │
          │                                    │
          │ N:M                                │
          │                                    │
          ▼                                    │
┌─────────────────────────────┐                │
│   pathname_translation      │                │
├─────────────────────────────┤                │
│ id (INTEGER PK)             │                │
│ pathname_id (INTEGER FK)    │                │
│ translation_id (INTEGER FK) │◄───────────────┘
│ created_at (INTEGER)        │
│                             │
│ UNIQUE(pathname_id,         │
│        translation_id)      │     Ensures no duplicate links
└─────────────────────────────┘
```

## Tables

### user

Stores user accounts (for multi-tenancy).

| Column     | Type                | Description            |
| ---------- | ------------------- | ---------------------- |
| id         | INTEGER PRIMARY KEY | Auto-increment user ID |
| email      | TEXT UNIQUE         | User email address     |
| name       | TEXT                | Display name           |
| created_at | INTEGER             | Unix timestamp         |
| updated_at | INTEGER             | Unix timestamp         |

### origin

Stores origin domains (main websites to translate).

| Column      | Type                | Description                                                                |
| ----------- | ------------------- | -------------------------------------------------------------------------- |
| id          | INTEGER PRIMARY KEY | Auto-increment origin ID                                                   |
| user_id     | INTEGER             | Foreign key to user.id                                                     |
| domain      | TEXT UNIQUE         | Origin domain (e.g., 'www.find-your-item.com')                             |
| origin_lang | TEXT                | Source language code (e.g., 'en') - the language of content on this origin |
| created_at  | INTEGER             | Unix timestamp                                                             |
| updated_at  | INTEGER             | Unix timestamp                                                             |

**Indexes:**

-   `domain` (UNIQUE) - for fast origin lookups

### host

Stores host configuration (replaces `HOST_SETTINGS` in config.ts).

| Column        | Type                | Description                                                                  |
| ------------- | ------------------- | ---------------------------------------------------------------------------- |
| id            | INTEGER PRIMARY KEY | Auto-increment host ID                                                       |
| origin_id     | INTEGER             | Foreign key to origin.id                                                     |
| hostname      | TEXT UNIQUE         | Full subdomain (e.g., 'sp.find-your-item.com')                               |
| target_lang   | TEXT                | Target language code (e.g., 'es', 'fr', 'de') - the language to translate TO |
| skip_words    | TEXT                | JSON array of words to preserve (e.g., '["Find-Your-Item"]')                 |
| skip_patterns | TEXT                | JSON array of pattern types (e.g., '["numeric"]')                            |
| enabled       | INTEGER             | 0 = disabled, 1 = enabled (default 1)                                        |
| created_at    | INTEGER             | Unix timestamp                                                               |
| updated_at    | INTEGER             | Unix timestamp                                                               |

**Indexes:**

-   `hostname` (UNIQUE) - for fast request routing
-   `origin_id` - for JOIN performance

**Note:** The source language (`origin_lang`) is stored in the `origin` table, not here. Each host inherits the source language from its origin.

### pathname

Stores unique pathnames per host with their translations for bidirectional URL lookups.

**IMPORTANT:** The `path` field ALWAYS stores the original (English) pathname, never the translated version.

**Write-once:** Pathname records are created once and never updated. The `hit_count` field may be incremented for analytics tracking.

| Column          | Type                | Description                                                                            |
| --------------- | ------------------- | -------------------------------------------------------------------------------------- |
| id              | INTEGER PRIMARY KEY | Auto-increment pathname ID                                                             |
| host_id         | INTEGER             | Foreign key to host.id                                                                 |
| path            | TEXT                | Original URL pathname (e.g., '/pricing', '/products') - ALWAYS in origin language      |
| translated_path | TEXT                | Translated URL pathname (e.g., '/precios', '/produits') - in target language           |
| hit_count       | INTEGER DEFAULT 1   | Number of requests (starts at 1 when record created, incremented on subsequent visits) |
| created_at      | INTEGER             | Unix timestamp                                                                         |

**Constraints:**

-   `UNIQUE(host_id, path)` - each original path is unique per host

**Indexes:**

-   `(host_id, path)` - for forward lookups (original → translated)
-   `(host_id, translated_path)` - for reverse lookups (translated → original)

**Bidirectional Lookup:**
The `pathname` table supports both forward and reverse lookups using a single query:

```sql
-- Lookup either direction (input could be original or translated)
SELECT path, translated_path
FROM pathname
WHERE host_id = ? AND (path = ? OR translated_path = ?);

-- If result.path === input: return result.translated_path (forward)
-- If result.translated_path === input: return result.path (reverse)
```

This approach:

-   Single query for both directions
-   Prevents duplicate records for the same page
-   Maintains accurate analytics (hit_count not split across variants)
-   Both indexes (`path` and `translated_path`) enable efficient lookups
-   Replaces the KV pathname cache structure (`origin` and `translated` hash maps)

### translation

Stores translation pairs per host (replaces KV cache, allows user customization).

**IMPORTANT:** Languages are not stored in this table. Both `origin_lang` and `target_lang` are determined by the host:

-   `origin_lang` → via `host.origin_id` → `origin.origin_lang`
-   `target_lang` → via `host.target_lang`

| Column          | Type                | Description                                                      |
| --------------- | ------------------- | ---------------------------------------------------------------- |
| id              | INTEGER PRIMARY KEY | Auto-increment translation ID                                    |
| host_id         | INTEGER             | Foreign key to host.id (scoped per host, implies both languages) |
| original_text   | TEXT                | Source text (in origin language)                                 |
| translated_text | TEXT                | Translated text (in target language)                             |
| kind            | TEXT                | Type: 'text', 'title', 'meta', 'attribute'                       |
| text_hash       | TEXT                | Hash of original_text for fast lookups (SHA256 or MD5)           |
| created_at      | INTEGER             | Unix timestamp                                                   |
| updated_at      | INTEGER             | Unix timestamp                                                   |

**Constraints:**

-   `UNIQUE(host_id, text_hash)` - one translation per text per host

**Indexes:**

-   `(host_id, text_hash)` - fast lookup during translation (hot path)
-   `(host_id, original_text)` - for admin UI/search (cold path)

**Why no language fields?**
Since `host_id` uniquely determines both source and target languages, storing them would be redundant. For queries needing language info, JOIN to `host` and `origin` tables.

### pathname_translation

Junction table linking pathnames to translations (tracks which translations appear on which pages).

| Column         | Type                | Description                   |
| -------------- | ------------------- | ----------------------------- |
| id             | INTEGER PRIMARY KEY | Auto-increment ID             |
| pathname_id    | INTEGER             | Foreign key to pathname.id    |
| translation_id | INTEGER             | Foreign key to translation.id |
| created_at     | INTEGER             | Unix timestamp                |

**Constraints:**

-   `UNIQUE(pathname_id, translation_id)` - no duplicate translation links per page

**Indexes:**

-   `(pathname_id)` - retrieve all translations for a page
-   `(translation_id)` - reverse lookups (which pages use this translation)

**Note:** Translations are sorted by `original_text` when retrieved for a page, not by position.

## Key Design Decisions

### 1. Language Storage - Origin vs. Host

**`origin_lang` lives in `origin` table:**

-   The source content language is a property of the origin domain
-   All hosts pointing to the same origin share the same source language
-   Single source of truth - defined once at the origin level

**`target_lang` lives in `host` table:**

-   Each host defines what language it translates TO
-   Multiple hosts can translate the same origin to different languages

**No language fields in `translation` table:**

-   Languages are implicit via `host_id` (JOIN to get language info)
-   Avoids redundant data
-   Simplifies schema and queries

### 2. Pathname Storage & Bidirectional Lookup

The `pathname` table stores both original and translated pathnames with bidirectional lookup support:

-   **`path`**: ALWAYS the original (English) pathname - used as the canonical identifier
-   **`translated_path`**: The translated pathname (e.g., `/precios` for Spanish)
-   **Single query**: `WHERE host_id = ? AND (path = ? OR translated_path = ?)` handles both directions
-   **Benefits**:
    -   Single pathname record per logical page
    -   Accurate analytics (hit_count not fragmented)
    -   Efficient bidirectional lookups with two indexes
    -   Replaces KV pathname cache structure

**Request Flow:**

```
1. User visits: sp.find-your-item.com/precios
2. Bidirectional lookup: SELECT path, translated_path WHERE host_id = X AND (path = '/precios' OR translated_path = '/precios')
3. Returns: path='/pricing', translated_path='/precios'
4. Use 'path' as canonical identifier for all operations
```

### 3. Per-Host Translation Scoping

Translations are scoped to `host_id`, allowing:

-   **User customization**: Each user can override translations for their specific use case
-   **Example**: User A's "Contact" → "Contacto", User B's "Contact" → "Contáctenos"

### 4. Deduplication Within Host

The `text_hash` unique constraint per host ensures:

-   Same "Hello" → "Hola" stored once per host
-   Reused across multiple pages for that host
-   Storage efficiency while maintaining customization

### 5. Pathname Tracking

Separate `pathname` table enables:

-   **Filter translations by page**: See all translations used on `/products`
-   **Analytics**: Track most popular pages (`hit_count`)
-   **Bidirectional URL lookup**: Support bookmarked/indexed translated URLs
-   **Future**: KV cache entire page by `pathname_id`

### 6. Position Tracking

The `position` field in `pathname_translation` is **critical**:

-   Maintains extraction order from DOM
-   Ensures translations are applied to correct elements
-   Must match extraction/application symmetry in `dom-extractor.ts` and `dom-applicator.ts`

## Use Cases

### 1. Request Routing (Hot Path)

```sql
-- Get host configuration for incoming request
SELECT h.id, h.target_lang, h.skip_words, h.skip_patterns, o.origin_lang, o.domain
FROM host h
JOIN origin o ON o.id = h.origin_id
WHERE h.hostname = 'sp.find-your-item.com' AND h.enabled = 1;
```

### 2. Translation Lookup (Hot Path)

```sql
-- Get cached translation for a text segment
SELECT translated_text
FROM translation
WHERE host_id = 5 AND text_hash = 'a1b2c3d4...';
```

### 3. Pathname Bidirectional Lookup (Hot Path)

```sql
-- Lookup pathname in either direction (replaces KV pathname cache)
SELECT path, translated_path
FROM pathname
WHERE host_id = 5 AND (path = '/precios' OR translated_path = '/precios');
-- Returns: path='/pricing', translated_path='/precios'
-- If input matches 'path': forward lookup, return 'translated_path'
-- If input matches 'translated_path': reverse lookup, return 'path'
```

### 4. Get Translations for Page Rendering

```sql
-- Retrieve ordered translations for a specific page (after pathname normalization)
SELECT t.original_text, t.translated_text, t.kind
FROM translation t
JOIN pathname_translation pt ON pt.translation_id = t.id
JOIN pathname p ON p.id = pt.pathname_id
WHERE p.host_id = 5 AND p.path = '/pricing'  -- Always use original path
ORDER BY pt.position;
```

### 5. Custom Translation Override

```sql
-- User customizes a translation for their host
UPDATE translation
SET translated_text = '¡Hola amigo!', updated_at = ?
WHERE host_id = 5 AND text_hash = 'hash_of_hello';
```

### 6. Filter Translations by Pathname

```sql
-- See all translations used on /products page
SELECT t.*, h.target_lang, o.origin_lang
FROM translation t
JOIN pathname_translation pt ON pt.translation_id = t.id
JOIN pathname p ON p.id = pt.pathname_id
JOIN host h ON h.id = p.host_id
JOIN origin o ON o.id = h.origin_id
WHERE p.host_id = 5 AND p.path = '/products'
ORDER BY pt.position;
```

### 7. Analytics - Most Popular Pages

```sql
-- Find most-visited pages
SELECT path, translated_path, hit_count, created_at
FROM pathname
WHERE host_id = 5
ORDER BY hit_count DESC
LIMIT 10;
```

### 8. Find Translations Across Hosts (Admin)

```sql
-- Find all Spanish translations of "Hello" across all hosts
SELECT h.hostname, t.translated_text, t.updated_at
FROM translation t
JOIN host h ON h.id = t.host_id
WHERE h.target_lang = 'es' AND t.original_text = 'Hello';
```

## Migration Notes

### From config.ts HOST_SETTINGS

```typescript
// OLD: config.ts
HOST_SETTINGS: {
  'sp.find-your-item.com': {
    lang: 'es',
    skipWords: ['Find-Your-Item'],
    skipPatterns: ['numeric']
  }
}

// NEW: D1 query
SELECT h.*, o.origin_lang
FROM host h
JOIN origin o ON o.id = h.origin_id
WHERE h.hostname = 'sp.find-your-item.com' AND h.enabled = 1;
```

### From KV Cache - Segment Cache

```
OLD KV:
  Key: "segments::es::www.find-your-item.com::/products"
  Value: [{original, translated}, {original, translated}, ...]

NEW D1:
  1. Normalize incoming pathname to original: /productos → /pricing
  2. Get pathname: WHERE host_id = X AND path = '/pricing'
  3. Query: SELECT ... FROM pathname_translation JOIN translation WHERE pathname_id = Y ORDER BY position
  4. Return ordered array of translations
```

### From KV Cache - Pathname Mapping

```
OLD KV:
  Key: "pathnames::es::www.find-your-item.com"
  Value: {
    origin: { "/pricing": "/precios" },
    translated: { "/precios": "/pricing" }
  }

NEW D1:
  pathname table with translated_path field:
  - Record: { host_id: 5, path: '/pricing', translated_path: '/precios' }
  - Bidirectional lookup via single query with OR condition
  - Two indexes enable efficient lookups in both directions
```

## Request Flow Example

**User visits: `sp.find-your-item.com/precios`**

```sql
-- 1. Route request - get host config
SELECT h.id, h.target_lang, o.origin_lang, o.domain
FROM host h
JOIN origin o ON o.id = h.origin_id
WHERE h.hostname = 'sp.find-your-item.com' AND h.enabled = 1;
-- Returns: host_id=5, target_lang='es', origin_lang='en', domain='www.find-your-item.com'

-- 2. Bidirectional pathname lookup
SELECT path, translated_path
FROM pathname
WHERE host_id = 5 AND (path = '/precios' OR translated_path = '/precios');
-- Returns: path='/pricing', translated_path='/precios'
-- Since input matches translated_path, we know original is '/pricing'

-- 3. Get cached translations for the page
SELECT t.original_text, t.translated_text, t.kind
FROM translation t
JOIN pathname_translation pt ON pt.translation_id = t.id
WHERE pt.pathname_id = (SELECT id FROM pathname WHERE host_id = 5 AND path = '/pricing')
ORDER BY pt.position;

-- 4. Update analytics
UPDATE pathname
SET hit_count = hit_count + 1
WHERE host_id = 5 AND path = '/pricing';
```

## Future Features Enabled

1. **Page-level KV cache**: Cache entire rendered HTML by `pathname_id`
2. **Translation versioning**: Add `version` field to track updates
3. **Custom translation UI**: Admin panel for editing translations
4. **Analytics dashboard**: Popular pages, translation coverage, cache hit rates
5. **A/B testing**: Multiple translation variants per segment
6. **Translation memory**: Reuse translations across different hosts for same user
7. **Bulk import/export**: CSV export of translations for external editing

## Indexes Summary

```sql
-- user table
CREATE UNIQUE INDEX idx_user_email ON user(email);

-- origin table
CREATE UNIQUE INDEX idx_origin_domain ON origin(domain);
CREATE INDEX idx_origin_user_id ON origin(user_id);

-- host table
CREATE UNIQUE INDEX idx_host_hostname ON host(hostname);
CREATE INDEX idx_host_origin_id ON host(origin_id);

-- pathname table
CREATE UNIQUE INDEX idx_pathname_host_path ON pathname(host_id, path);
CREATE INDEX idx_pathname_host_translated ON pathname(host_id, translated_path);

-- translation table
CREATE UNIQUE INDEX idx_translation_unique ON translation(host_id, text_hash);
CREATE INDEX idx_translation_search ON translation(host_id, original_text);

-- pathname_translation table
CREATE UNIQUE INDEX idx_pathname_translation_unique ON pathname_translation(pathname_id, translation_id);
CREATE INDEX idx_pathname_translation_pathname ON pathname_translation(pathname_id);
CREATE INDEX idx_pathname_translation_reverse ON pathname_translation(translation_id);
```

## Performance Considerations

### Hot Path Queries (must be fast)

1. **Host lookup**: `WHERE hostname = ?` - covered by unique index
2. **Translation lookup**: `WHERE host_id = ? AND text_hash = ?` - covered by composite index
3. **Pathname bidirectional lookup**: `WHERE host_id = ? AND (path = ? OR translated_path = ?)` - covered by both composite indexes

### Cold Path Queries (can be slower)

1. **Admin searches**: `WHERE original_text LIKE ?` - has index but may be slow for LIKE
2. **Cross-host analytics**: Requires JOINs across multiple tables
3. **Language queries**: Requires JOIN to origin table

### Optimization Tips

-   Use prepared statements for all queries (reduces parsing overhead)
-   Batch INSERT/UPDATE operations when possible
-   Consider read replicas for analytics queries (future)
-   Monitor D1 query performance metrics
