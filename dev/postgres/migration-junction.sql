-- ============================================================
-- DATABASE SCHEMA: ORIGIN PATH SEGMENT JUNCTION TABLE
-- Language-independent linking of paths to segments
-- ============================================================
--
-- This migration refactors the junction table to link at the origin level:
-- - Old: pathname_translation links translated_path → translated_segment (per-language)
-- - New: origin_path_segment links origin_path → origin_segment (language-independent)
--
-- Benefits:
-- - Store once: 50 segments on a page = 50 rows (not 50 × N languages)
-- - Query any language without specifying in junction
-- - "What content is on this page?" is language-independent
--
-- Run with: psql $POSTGRES_DB_URL -f migration-junction.sql
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- STEP 1: Create new origin-based junction table
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS origin_path_segment (
    id SERIAL PRIMARY KEY,
    origin_path_id INTEGER NOT NULL REFERENCES origin_path(id) ON DELETE CASCADE,
    origin_segment_id INTEGER NOT NULL REFERENCES origin_segment(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(origin_path_id, origin_segment_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_origin_path_segment_path ON origin_path_segment(origin_path_id);
CREATE INDEX IF NOT EXISTS idx_origin_path_segment_segment ON origin_path_segment(origin_segment_id);

-- ------------------------------------------------------------
-- STEP 2: Migrate existing data from pathname_translation
-- Collapses language-specific links into language-independent
-- ------------------------------------------------------------

INSERT INTO origin_path_segment (origin_path_id, origin_segment_id)
SELECT DISTINCT tp.origin_path_id, ts.origin_segment_id
FROM pathname_translation pt
JOIN translated_path tp ON tp.id = pt.translated_path_id
JOIN translated_segment ts ON ts.id = pt.translated_segment_id
WHERE tp.origin_path_id IS NOT NULL
  AND ts.origin_segment_id IS NOT NULL
ON CONFLICT (origin_path_id, origin_segment_id) DO NOTHING;

COMMIT;

-- ------------------------------------------------------------
-- VERIFICATION QUERIES (run manually after migration)
-- ------------------------------------------------------------

-- Count comparison (origin_path_segment should have fewer rows due to deduplication)
-- SELECT 'pathname_translation' as table_name, COUNT(*) as row_count FROM pathname_translation
-- UNION ALL
-- SELECT 'origin_path_segment', COUNT(*) FROM origin_path_segment;

-- Verify data integrity: All origin pairs should exist
-- SELECT COUNT(*) as missing_pairs
-- FROM pathname_translation pt
-- JOIN translated_path tp ON tp.id = pt.translated_path_id
-- JOIN translated_segment ts ON ts.id = pt.translated_segment_id
-- LEFT JOIN origin_path_segment ops
--     ON ops.origin_path_id = tp.origin_path_id
--     AND ops.origin_segment_id = ts.origin_segment_id
-- WHERE ops.id IS NULL;
-- Should return 0

-- Drop the old junction table after verification
-- DROP TABLE IF EXISTS pathname_translation;
