# PostgreSQL Schema - Translation Proxy

## Overview

PostgreSQL database schema for storing host configuration (replaces `HOST_SETTINGS` in `config.ts`) and translation cache (replaces in-memory cache).

Adapted from the D1 schema in `db.md` with PostgreSQL-native types.

## Schema Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     POSTGRESQL SCHEMA                               │
└─────────────────────────────────────────────────────────────────────┘

┌───────────────────────────┐
│          user             │
├───────────────────────────┤
│ id (SERIAL PK)            │
│ email (TEXT UNIQUE)       │
│ name (TEXT)               │
│ created_at (TIMESTAMPTZ)  │
│ updated_at (TIMESTAMPTZ)  │  ◄─── Auto-updated via trigger
└───────────────────────────┘
          │
          │ 1:N
          ▼
┌───────────────────────────┐
│         origin            │
├───────────────────────────┤
│ id (SERIAL PK)            │
│ user_id (INTEGER FK)      │──────► user.id (CASCADE)
│ domain (TEXT UNIQUE)      │     Example: 'www.esnipe.com'
│ origin_lang (TEXT)        │     Source language (e.g., 'en')
│ created_at (TIMESTAMPTZ)  │
│ updated_at (TIMESTAMPTZ)  │
└───────────────────────────┘
          │
          │ 1:N
          ▼
┌─────────────────────────────────┐
│            host                 │  ◄─── Replaces HOST_SETTINGS config
├─────────────────────────────────┤
│ id (SERIAL PK)                  │
│ origin_id (INTEGER FK)          │──────► origin.id (CASCADE)
│ hostname (TEXT UNIQUE)          │     Example: 'es.esnipe.com'
│ target_lang (TEXT)              │     Example: 'es', 'fr', 'de'
│ skip_words (TEXT[])             │     Array: {'eSnipe','eBay'}
│ skip_patterns (TEXT[])          │     Array: {'pii','numeric'}
│ skip_path (TEXT[])              │     Array: {'/api/','^/admin'}
│ translate_path (BOOLEAN)        │     Default: TRUE
│ proxied_cache (INTEGER)         │     Minutes, Default: 0
│ enabled (BOOLEAN)               │     Default: TRUE
│ created_at (TIMESTAMPTZ)        │
│ updated_at (TIMESTAMPTZ)        │
└─────────────────────────────────┘
          │
          │ 1:N
          ├────────────────────────────────┐
          │                                │
          ▼                                ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│        pathname             │   │       translation           │  ◄─── Per-host translations
├─────────────────────────────┤   ├─────────────────────────────┤
│ id (SERIAL PK)              │   │ id (SERIAL PK)              │
│ host_id (INTEGER FK)        │   │ host_id (INTEGER FK)        │──────► host.id (CASCADE)
│ path (TEXT)                 │   │ original_text (TEXT)        │
│ translated_path (TEXT)      │   │ translated_text (TEXT)      │
│ hit_count (INTEGER)         │   │ kind (TEXT)                 │  'text','title','meta','attribute'
│ created_at (TIMESTAMPTZ)    │   │ text_hash (TEXT)            │  Hash for fast lookup
│                             │   │ created_at (TIMESTAMPTZ)    │
│ UNIQUE(host_id, path)       │   │ updated_at (TIMESTAMPTZ)    │
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
│ id (SERIAL PK)              │                │
│ pathname_id (INTEGER FK)    │──────► pathname.id (CASCADE)
│ translation_id (INTEGER FK) │◄───────────────┘ (CASCADE)
│ created_at (TIMESTAMPTZ)    │
│                             │
│ UNIQUE(pathname_id,         │
│        translation_id)      │     Ensures no duplicate links
└─────────────────────────────┘
```

## PostgreSQL vs D1 Type Mappings

| D1 (SQLite)              | PostgreSQL       | Notes                           |
| ------------------------ | ---------------- | ------------------------------- |
| `INTEGER PRIMARY KEY`    | `SERIAL`         | Auto-increment                  |
| `INTEGER` (timestamps)   | `TIMESTAMPTZ`    | Native timezone-aware           |
| `INTEGER` (booleans)     | `BOOLEAN`        | Native TRUE/FALSE               |
| `TEXT` (JSON arrays)     | `TEXT[]`         | Native array type               |
| Manual timestamp updates | Trigger function | Auto-updates `updated_at`       |

## Tables

### user

Stores user accounts (for multi-tenancy).

| Column     | Type        | Description            |
| ---------- | ----------- | ---------------------- |
| id         | SERIAL PK   | Auto-increment user ID |
| email      | TEXT UNIQUE | User email address     |
| name       | TEXT        | Display name           |
| created_at | TIMESTAMPTZ | Auto-set on insert     |
| updated_at | TIMESTAMPTZ | Auto-updated on change |

### origin

Stores origin domains (main websites to translate).

| Column      | Type        | Description                      |
| ----------- | ----------- | -------------------------------- |
| id          | SERIAL PK   | Auto-increment origin ID         |
| user_id     | INTEGER FK  | References user.id (CASCADE)     |
| domain      | TEXT UNIQUE | Origin domain (e.g., 'www.esnipe.com') |
| origin_lang | TEXT        | Source language code (e.g., 'en') |
| created_at  | TIMESTAMPTZ | Auto-set on insert               |
| updated_at  | TIMESTAMPTZ | Auto-updated on change           |

### host

Stores host configuration (replaces `HOST_SETTINGS` in config.ts).

| Column         | Type        | Description                                    |
| -------------- | ----------- | ---------------------------------------------- |
| id             | SERIAL PK   | Auto-increment host ID                         |
| origin_id      | INTEGER FK  | References origin.id (CASCADE)                 |
| hostname       | TEXT UNIQUE | Full subdomain (e.g., 'es.esnipe.com')         |
| target_lang    | TEXT        | Target language code (e.g., 'es', 'fr')        |
| skip_words     | TEXT[]      | Words to preserve (e.g., `{'eSnipe','eBay'}`)  |
| skip_patterns  | TEXT[]      | Pattern types (e.g., `{'pii','numeric'}`)      |
| skip_path      | TEXT[]      | Path prefixes to skip (e.g., `{'/api/'}`)      |
| translate_path | BOOLEAN     | Enable URL translation (default: TRUE)         |
| proxied_cache  | INTEGER     | Cache duration in minutes (default: 0)         |
| enabled        | BOOLEAN     | Host active flag (default: TRUE)               |
| created_at     | TIMESTAMPTZ | Auto-set on insert                             |
| updated_at     | TIMESTAMPTZ | Auto-updated on change                         |

**Note:** Patterns require a prefix: `includes:` for substring match (e.g., `includes:/api/`), `regex:` for regex (e.g., `regex:^/admin`).

### pathname

Stores URL pathname mappings for bidirectional lookup.

| Column          | Type        | Description                              |
| --------------- | ----------- | ---------------------------------------- |
| id              | SERIAL PK   | Auto-increment pathname ID               |
| host_id         | INTEGER FK  | References host.id (CASCADE)             |
| path            | TEXT        | Original pathname (ALWAYS origin lang)   |
| translated_path | TEXT        | Translated pathname                      |
| hit_count       | INTEGER     | Request count (default: 1)               |
| created_at      | TIMESTAMPTZ | Auto-set on insert                       |

**Constraint:** `UNIQUE(host_id, path)`

### translation

Stores translation pairs per host.

| Column          | Type        | Description                              |
| --------------- | ----------- | ---------------------------------------- |
| id              | SERIAL PK   | Auto-increment translation ID            |
| host_id         | INTEGER FK  | References host.id (CASCADE)             |
| original_text   | TEXT        | Source text                              |
| translated_text | TEXT        | Translated text                          |
| kind            | TEXT        | Type: 'text', 'title', 'meta', 'attribute' |
| text_hash       | TEXT        | Hash for fast lookup                     |
| created_at      | TIMESTAMPTZ | Auto-set on insert                       |
| updated_at      | TIMESTAMPTZ | Auto-updated on change                   |

**Constraint:** `UNIQUE(host_id, text_hash)`

### pathname_translation

Junction table linking pathnames to their translations.

| Column         | Type        | Description                    |
| -------------- | ----------- | ------------------------------ |
| id             | SERIAL PK   | Auto-increment ID              |
| pathname_id    | INTEGER FK  | References pathname.id         |
| translation_id | INTEGER FK  | References translation.id      |
| created_at     | TIMESTAMPTZ | Auto-set on insert             |

**Constraint:** `UNIQUE(pathname_id, translation_id)`

## Indexes

```sql
-- origin table
CREATE INDEX idx_origin_user_id ON origin(user_id);

-- host table
CREATE INDEX idx_host_origin_id ON host(origin_id);

-- pathname table (bidirectional lookup)
CREATE INDEX idx_pathname_host_translated ON pathname(host_id, translated_path);

-- translation table
CREATE INDEX idx_translation_search ON translation(host_id, original_text);

-- pathname_translation table
CREATE INDEX idx_pathname_translation_pathname ON pathname_translation(pathname_id);
CREATE INDEX idx_pathname_translation_reverse ON pathname_translation(translation_id);
```

## Trigger Function

Auto-updates `updated_at` column on row changes:

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Applied to: `user`, `origin`, `host`, `translation`

## Example Queries

### Host Lookup (Hot Path)

```sql
SELECT h.id, h.target_lang, h.skip_words, h.skip_patterns,
       h.skip_path, h.translate_path, h.proxied_cache,
       o.origin_lang, o.domain
FROM host h
JOIN origin o ON o.id = h.origin_id
WHERE h.hostname = 'es.esnipe.com' AND h.enabled = TRUE;
```

### Pathname Bidirectional Lookup

```sql
SELECT path, translated_path
FROM pathname
WHERE host_id = 1 AND (path = '/precios' OR translated_path = '/precios');
```

### Translation Lookup

```sql
SELECT translated_text
FROM translation
WHERE host_id = 1 AND text_hash = 'abc123...';
```

## Files

- `pg-schema.sql` - DDL statements (tables, indexes, triggers)
- `pg-seed.sql` - Initial data (user, origin, hosts from HOST_SETTINGS)
