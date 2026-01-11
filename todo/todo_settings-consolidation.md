# Consolidate Host Settings to Origin

## Summary

Move origin-level settings from `host` table to `origin` table and remove `skip_patterns` column.

## Why

Current settings on `host` are actually properties of the source site, not the target language:

| Setting          | Current Location | Issue                                                                         |
| ---------------- | ---------------- | ----------------------------------------------------------------------------- |
| `skip_words`     | host             | Brand names (e.g., "eSnipe", "eBay") shouldn't be translated for ANY language |
| `skip_path`      | host             | Paths like `/api/`, `/admin` are source-site paths, not language-specific     |
| `translate_path` | host             | Usually a site-wide SEO decision, not per-language                            |
| `skip_patterns`  | host             | PII/numeric detection should ALWAYS apply - no need to configure              |

---

## Phase 1: Hardcode Skip Patterns (Code Only)

**Goal:** Remove `skip_patterns` from configuration, always apply PII/numeric detection.

**No database changes required.**

-   [ ] Update skip-patterns.ts to hardcode default patterns
-   [ ] Update index.ts to remove skipPatterns conditional
-   [ ] Update host.ts query and HostConfig type
-   [ ] Test translation still works
-   [ ] Deploy

### Details

1. **apps/translate/src/index.ts**

    - Remove `hostConfig.skipPatterns` check
    - Always apply patterns (hardcode `['pii', 'numeric']`)

2. **apps/translate/src/translation/skip-patterns.ts**

    - Update to always use default patterns if none provided
    - Or simplify API to not accept patterns parameter

3. **packages/db/src/host.ts**
    - Stop querying `skip_patterns` column (can leave in DB for now)
    - Remove from `HostConfig` type

---

## Phase 2: Database Migration

**Goal:** Move `skip_words`, `skip_path`, `translate_path` to origin table.

-   [ ] Write and test migration SQL
-   [ ] Backup production data
-   [ ] Run migration (Steps 1-2 only)
-   [ ] Verify data copied correctly

### Migration SQL

```sql
-- Step 1: Add columns to origin
ALTER TABLE origin ADD COLUMN skip_words text[];
ALTER TABLE origin ADD COLUMN skip_path text[];
ALTER TABLE origin ADD COLUMN translate_path boolean DEFAULT true;

-- Step 2: Copy data from first host per origin (or merge if multiple hosts differ)
UPDATE origin o
SET
  skip_words = h.skip_words,
  skip_path = h.skip_path,
  translate_path = h.translate_path
FROM (
  SELECT DISTINCT ON (origin_id) origin_id, skip_words, skip_path, translate_path
  FROM host
  WHERE origin_id IS NOT NULL
  ORDER BY origin_id, id
) h
WHERE o.id = h.origin_id;

-- Step 3: Drop columns from host (after code is updated)
ALTER TABLE host DROP COLUMN skip_words;
ALTER TABLE host DROP COLUMN skip_patterns;
ALTER TABLE host DROP COLUMN skip_path;
ALTER TABLE host DROP COLUMN translate_path;
```

---

## Phase 3: Code Changes for Origin Settings

**Goal:** Update code to read settings from origin instead of host.

-   [ ] Update getHostConfig() query to JOIN with origin
-   [ ] Update HostConfig type
-   [ ] Test with migrated data
-   [ ] Deploy code changes
-   [ ] Run migration Step 3 (drop old columns)

### Details

1. **packages/db/src/host.ts**

    - Update `getHostConfig()` to JOIN with origin table
    - Fetch `skip_words`, `skip_path`, `translate_path` from origin
    - Update `HostConfig` type

2. **apps/translate/src/index.ts**

    - No changes needed (still uses hostConfig.skipWords, etc.)

3. **apps/translate/src/config.ts**
    - Update `HOST_SETTINGS` fallback if still used

---

## Phase 4: Dashboard UI Updates

**Goal:** Move settings editing from host to origin in dashboard.

-   [ ] Update origin settings UI
-   [ ] Remove fields from host settings UI
-   [ ] Test end-to-end

### Details

1. **apps/www** - Origin settings page

    - Add skip_words editor
    - Add skip_path editor
    - Add translate_path toggle

2. **apps/www** - Host settings
    - Remove skip_words, skip_path, translate_path fields

---

## What Stays on Host

| Column          | Reason                        |
| --------------- | ----------------------------- |
| `target_lang`   | Per-host by definition        |
| `proxied_cache` | Could vary per language       |
| `enabled`       | Per-host toggle               |
| `style`         | TBD - see open question below |

## Open Questions

-   **Should `style` move to origin?**
    -   Origin: One consistent voice/style across all languages
    -   Host: Different styles per market (formal German, casual Spanish)
