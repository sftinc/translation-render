# Junction Table Refactor: origin_path_segment

## Problem

The current `pathname_translation` table links `translated_path` to `translated_segment`. This means:
- The relationship is stored per-language (50 segments × 5 languages = 250 rows)
- To query "what's on this page?" you must specify a language
- Duplicate junction data across languages

## Solution

Link at the origin level instead. The relationship "segment X appears on page Y" is a property of the source content, not translations.

### New Table: `origin_path_segment`

```sql
CREATE TABLE origin_path_segment (
    id SERIAL PRIMARY KEY,
    origin_path_id INTEGER NOT NULL REFERENCES origin_path(id) ON DELETE CASCADE,
    origin_segment_id INTEGER NOT NULL REFERENCES origin_segment(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(origin_path_id, origin_segment_id)
);

CREATE INDEX idx_origin_path_segment_path ON origin_path_segment(origin_path_id);
CREATE INDEX idx_origin_path_segment_segment ON origin_path_segment(origin_segment_id);
```

### Benefits

1. **Store once**: 50 segments on a page = 50 junction rows total (not 50 × N languages)
2. **Query any language**: Join through origin tables to get any language
3. **Language-agnostic analytics**: "What content is on this page?" without specifying language
4. **Simpler data model**: Origin content relationships are language-independent

### Example Queries

**All Spanish translations for /pricing:**
```sql
SELECT ts.translated_text
FROM origin_path op
JOIN origin_path_segment ops ON ops.origin_path_id = op.id
JOIN translated_segment ts ON ts.origin_segment_id = ops.origin_segment_id
WHERE op.path = '/pricing' AND ts.lang = 'es'
```

**All languages for a page:**
```sql
SELECT ts.lang, COUNT(*) as segment_count
FROM origin_path op
JOIN origin_path_segment ops ON ops.origin_path_id = op.id
JOIN translated_segment ts ON ts.origin_segment_id = ops.origin_segment_id
WHERE op.path = '/pricing'
GROUP BY ts.lang
```

**Pages containing a specific segment:**
```sql
SELECT op.path
FROM origin_segment os
JOIN origin_path_segment ops ON ops.origin_segment_id = os.id
JOIN origin_path op ON op.id = ops.origin_path_id
WHERE os.text_hash = 'abc123'
```

## Code Changes Required

### 1. Rename file: `pathname-translations.ts` → `path-segments.ts`

**Old function:**
```typescript
export async function linkPathnameTranslations(
    translatedPathId: number,
    translatedSegmentIds: number[]
): Promise<void>
```

**New function:**
```typescript
export async function linkPathSegments(
    originPathId: number,
    originSegmentIds: number[]
): Promise<void> {
    if (originSegmentIds.length === 0) return

    await pool.query(
        `INSERT INTO origin_path_segment (origin_path_id, origin_segment_id)
        SELECT $1, unnest($2::int[])
        ON CONFLICT (origin_path_id, origin_segment_id) DO NOTHING`,
        [originPathId, originSegmentIds]
    )
}
```

### 2. Update `pathnames.ts` - Return both IDs

**Current return type:**
```typescript
Promise<Map<string, number>>  // path → translated_path.id
```

**New return type:**
```typescript
interface PathIds {
    originPathId: number
    translatedPathId: number
}
Promise<Map<string, PathIds>>  // path → { originPathId, translatedPathId }
```

**Updated query:**
```sql
INSERT INTO translated_path (origin_id, lang, origin_path_id, translated_path, hit_count)
SELECT $1, $2, op.id, t.translated, 1
FROM unnest($3::text[], $4::text[]) AS t(original, translated)
JOIN origin_path op ON op.origin_id = $1 AND op.path = t.original
ON CONFLICT (origin_path_id, lang)
DO UPDATE SET hit_count = translated_path.hit_count + 1
RETURNING
    id AS translated_path_id,
    origin_path_id,
    (SELECT path FROM origin_path WHERE id = origin_path_id) AS path
```

### 3. New function in `translations.ts` - Get origin segment IDs

```typescript
/**
 * Batch lookup origin segment IDs by text hash
 * Used to link origin segments to origin paths
 */
export async function batchGetOriginSegmentIds(
    originId: number,
    textHashes: string[]
): Promise<Map<string, number>> {
    if (textHashes.length === 0) return new Map()

    const result = await pool.query<{ text_hash: string; id: number }>(
        `SELECT text_hash, id
        FROM origin_segment
        WHERE origin_id = $1 AND text_hash = ANY($2::text[])`,
        [originId, textHashes]
    )

    const idMap = new Map<string, number>()
    for (const row of result.rows) {
        idMap.set(row.text_hash, row.id)
    }
    return idMap
}
```

### 4. Update `index.ts` call site

**Current code (~line 626-647):**
```typescript
if (normalizedSegments.length > 0) {
    const { normalized: normalizedPath } = normalizePathname(originalPathname)
    let currentPathnameId = pathnameIdMap.get(normalizedPath)

    // ... ensure pathname exists ...

    if (currentPathnameId) {
        const allHashes = normalizedSegments.map((s) => hashText(s.value))
        const allTranslationIds = await batchGetTranslationIds(originId, targetLang, allHashes)
        await linkPathnameTranslations(currentPathnameId, Array.from(allTranslationIds.values()))
    }
}
```

**New code:**
```typescript
if (normalizedSegments.length > 0) {
    const { normalized: normalizedPath } = normalizePathname(originalPathname)
    let pathIds = pathnameIdMap.get(normalizedPath)

    // ... ensure pathname exists (now returns { originPathId, translatedPathId }) ...

    if (pathIds?.originPathId) {
        const allHashes = normalizedSegments.map((s) => hashText(s.value))
        const originSegmentIds = await batchGetOriginSegmentIds(originId, allHashes)
        await linkPathSegments(pathIds.originPathId, Array.from(originSegmentIds.values()))
    }
}
```

### 5. Remove `batchGetTranslationIds` function

This function is no longer needed since we link at the origin level instead of translated level.

## Migration Steps

This is a separate migration from `migration-v2.sql` (schema normalization).

### Step 1: Create Table

Create file: `dev/postgres/migration-junction.sql`

```sql
-- Migration: Refactor junction table to link origin tables instead of translated tables
-- This reduces duplication (50 segments × 5 languages = 250 rows → 50 rows)

-- Create new origin-based junction table
CREATE TABLE origin_path_segment (
    id SERIAL PRIMARY KEY,
    origin_path_id INTEGER NOT NULL REFERENCES origin_path(id) ON DELETE CASCADE,
    origin_segment_id INTEGER NOT NULL REFERENCES origin_segment(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(origin_path_id, origin_segment_id)
);

CREATE INDEX idx_origin_path_segment_path ON origin_path_segment(origin_path_id);
CREATE INDEX idx_origin_path_segment_segment ON origin_path_segment(origin_segment_id);
```

### Step 2: Data Migration

Migrate existing data from `pathname_translation` to `origin_path_segment`. This collapses language-specific links into language-independent links:

```sql
-- Migrate data: Convert translated_* IDs to origin_* IDs
-- This deduplicates across languages (same origin pair only inserted once)
INSERT INTO origin_path_segment (origin_path_id, origin_segment_id)
SELECT DISTINCT tp.origin_path_id, ts.origin_segment_id
FROM pathname_translation pt
JOIN translated_path tp ON tp.id = pt.translated_path_id
JOIN translated_segment ts ON ts.id = pt.translated_segment_id
ON CONFLICT (origin_path_id, origin_segment_id) DO NOTHING;
```

### Step 3: Verify Migration

```sql
-- Count comparison (origin_path_segment should have fewer rows due to deduplication)
SELECT 'pathname_translation' as table_name, COUNT(*) as row_count FROM pathname_translation
UNION ALL
SELECT 'origin_path_segment', COUNT(*) FROM origin_path_segment;

-- Verify data integrity: All origin pairs should exist
SELECT COUNT(*) as missing_pairs
FROM pathname_translation pt
JOIN translated_path tp ON tp.id = pt.translated_path_id
JOIN translated_segment ts ON ts.id = pt.translated_segment_id
LEFT JOIN origin_path_segment ops
    ON ops.origin_path_id = tp.origin_path_id
    AND ops.origin_segment_id = ts.origin_segment_id
WHERE ops.id IS NULL;
-- Should return 0
```

### Step 4: Deploy Code Changes

Deploy the updated TypeScript code that uses `origin_path_segment`.

### Step 5: Cleanup - Drop Old Table

Create file: `dev/postgres/cleanup-junction.sql`

After testing in production, run this to remove the old table:

```sql
-- ONLY RUN AFTER VERIFYING NEW CODE WORKS IN PRODUCTION

-- Drop the old junction table
DROP TABLE IF EXISTS pathname_translation;
```

## Files Summary

| File | Action |
|------|--------|
| `dev/postgres/migration-v2.sql` | Add origin_path_segment table, remove pathname_translation |
| `src/db/pathname-translations.ts` | Rename to `path-segments.ts`, update function |
| `src/db/pathnames.ts` | Return `{ originPathId, translatedPathId }` |
| `src/db/translations.ts` | Add `batchGetOriginSegmentIds`, remove `batchGetTranslationIds` |
| `src/index.ts` | Update call site to use origin IDs |

## Final Table Structure

After this refactor, the complete schema will be:

```
origin (id, domain, origin_lang)
    ↓
host (id, origin_id, hostname, target_lang, ...)

origin_segment (id, origin_id, text, text_hash)
    ↓
translated_segment (id, origin_id, lang, origin_segment_id, translated_text)

origin_path (id, origin_id, path)
    ↓
translated_path (id, origin_id, lang, origin_path_id, translated_path, hit_count)

origin_path_segment (origin_path_id, origin_segment_id)  ← NEW: language-independent
```
