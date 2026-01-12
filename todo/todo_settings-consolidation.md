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

## Phase 1: Hardcode Skip Patterns (Code Only) ✅

**Goal:** Remove `skip_patterns` from configuration, always apply PII/numeric detection.

**No database changes required.**

-   [x] Update skip-patterns.ts to hardcode default patterns
-   [x] Update index.ts to remove skipPatterns conditional
-   [x] Update host.ts query and HostConfig type
-   [x] Test translation still works
-   [x] Commit

### Details

1. **apps/translate/src/translation/skip-patterns.ts**

    - Removed `enabledPatterns` parameter from `applyPatterns()`
    - Always applies both PII and numeric patterns

2. **apps/translate/src/index.ts**

    - Removed conditional, now calls `applyPatterns(text)` directly

3. **packages/db/src/host.ts**

    - Removed `skipPatterns` from `HostConfig` type
    - Removed `skip_patterns` from SQL query
    - Removed `parseSkipPatterns()` function

4. **Dead code cleanup**
    - Removed `HOST_SETTINGS` from config.ts
    - Removed `HostSettings` interface from types.ts
    - Removed duplicate `PatternType` from packages/db

---

## Phase 2: Database Migration ✅

**Goal:** Move `skip_words`, `skip_path`, `translate_path` to origin table.

-   [x] Write and test migration SQL
-   [x] Backup production data
-   [x] Run migration (Steps 1-2 only)
-   [x] Verify data copied correctly

### Migration SQL

```sql
-- Step 1: Add columns to origin
ALTER TABLE origin ADD COLUMN skip_words text[];
ALTER TABLE origin ADD COLUMN skip_path text[];
ALTER TABLE origin ADD COLUMN translate_path boolean DEFAULT true;

-- Step 2a: Copy skip_words and translate_path from first host per origin
UPDATE origin o
SET
  skip_words = h.skip_words,
  translate_path = h.translate_path
FROM (
  SELECT DISTINCT ON (origin_id) origin_id, skip_words, translate_path
  FROM host
  WHERE origin_id IS NOT NULL
  ORDER BY origin_id, id
) h
WHERE o.id = h.origin_id;

-- Step 2b: Merge skip_path from ALL hosts per origin (union of distinct values)
-- This ensures no skip_path values are lost (e.g., localhost has /api/, /admin)
UPDATE origin o
SET skip_path = merged.paths
FROM (
  SELECT origin_id, array_agg(DISTINCT path) AS paths
  FROM (
    SELECT origin_id, unnest(skip_path) AS path
    FROM host
    WHERE origin_id IS NOT NULL AND skip_path IS NOT NULL
  ) expanded
  GROUP BY origin_id
) merged
WHERE o.id = merged.origin_id;

-- Step 3: Drop columns from host (after code is updated in Phase 3)
ALTER TABLE host DROP COLUMN skip_words;
ALTER TABLE host DROP COLUMN skip_patterns;
ALTER TABLE host DROP COLUMN skip_path;
ALTER TABLE host DROP COLUMN translate_path;
```

---

## Phase 3: Code Changes for Origin Settings

**Goal:** Update code to read settings from origin instead of host.

-   [x] Update getHostConfig() query to read from origin
-   [x] Update query type (translate_path nullable)
-   [x] Test with migrated data (build passes)
-   [ ] Deploy code changes
-   [ ] Run migration Step 3 (drop old columns)

### Details

1. **packages/db/src/host.ts**

    - Changed SQL to select `o.skip_words`, `o.skip_path`, `o.translate_path` from origin
    - Added `?? true` fallback for translate_path (handles NULL from existing rows)
    - Updated query type to allow `translate_path: boolean | null`

2. **apps/translate/src/index.ts**

    - No changes needed (still uses hostConfig.skipWords, etc.)

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
