-- ============================================================
-- CLEANUP: Remove orphan segments not linked to any path
-- ============================================================
--
-- Deletes origin_segment rows that are not in origin_path_segment.
-- Due to ON DELETE CASCADE, this also removes their translated_segment rows.
-- These segments will be re-translated on next page visit.
--
-- Run with: psql $POSTGRES_DB_URL -f cleanup-orphan-segments.sql
-- ============================================================

-- Preview: Count orphan segments before deletion
SELECT 'Orphan origin_segments to delete' as description, COUNT(*) as count
FROM origin_segment os
WHERE NOT EXISTS (
    SELECT 1 FROM origin_path_segment ops
    WHERE ops.origin_segment_id = os.id
);

-- Preview: Count orphan translated_segments (will cascade delete)
SELECT 'Orphan translated_segments (cascade)' as description, COUNT(*) as count
FROM translated_segment ts
WHERE NOT EXISTS (
    SELECT 1 FROM origin_path_segment ops
    WHERE ops.origin_segment_id = ts.origin_segment_id
);


-- ------------------------------------------------------------
-- CLEANUP (run after verification - DO NOT run automatically)
-- ------------------------------------------------------------

-- ALTER TABLE pathname_translation_old RENAME TO _old_pathname_translation_v1;
-- ALTER TABLE translation RENAME TO _old_translation;
-- ALTER TABLE pathname RENAME TO _old_pathname;

-- ALTER TABLE pathname_translation RENAME TO _old_pathname_translation;

-- DROP TABLE IF EXISTS _old_pathname_translation_v1;
-- DROP TABLE IF EXISTS _old_translation;
-- DROP TABLE IF EXISTS _old_pathname;

-- DROP TABLE IF EXISTS _old_pathname_translation;
