# Database Language Code Migration

## Task

Migrate database language codes from ISO 639-1 (`es`, `fr`) to BCP 47 regional codes (`es-mx`, `fr-fr`).

## Why

The `@pantolingo/lang` package now uses regional BCP 47 codes. Currently:
- Display functions normalize legacy codes (e.g., `getLanguageName('es')` → "Spanish (Mexico)")
- Database still stores legacy codes (`es`, `fr`)
- New records should use regional codes for consistency

## Affected Tables

| Table | Column | Current Value | New Value |
|-------|--------|---------------|-----------|
| `origin` | `origin_lang` | `en` | `en-us` (or keep as-is) |
| `host` | `target_lang` | `es`, `fr` | `es-mx`, `fr-fr` |
| `translated_segment` | `lang` | `es`, `fr` | `es-mx`, `fr-fr` |
| `translated_path` | `lang` | `es`, `fr` | `es-mx`, `fr-fr` |

## Migration SQL

```sql
-- Backup first!
-- Run in a transaction

BEGIN;

-- Update host.target_lang
UPDATE host SET target_lang = 'es-mx' WHERE target_lang = 'es';
UPDATE host SET target_lang = 'fr-fr' WHERE target_lang = 'fr';

-- Update translated_segment.lang
UPDATE translated_segment SET lang = 'es-mx' WHERE lang = 'es';
UPDATE translated_segment SET lang = 'fr-fr' WHERE lang = 'fr';

-- Update translated_path.lang
UPDATE translated_path SET lang = 'es-mx' WHERE lang = 'es';
UPDATE translated_path SET lang = 'fr-fr' WHERE lang = 'fr';

-- Verify counts
SELECT 'host' as table_name, target_lang, COUNT(*) FROM host GROUP BY target_lang;
SELECT 'translated_segment' as table_name, lang, COUNT(*) FROM translated_segment GROUP BY lang;
SELECT 'translated_path' as table_name, lang, COUNT(*) FROM translated_path GROUP BY lang;

COMMIT;
```

## Post-Migration

After migration is complete and verified:

1. Remove `LEGACY_CODE_MAP` from [data.ts](../packages/lang/src/data.ts#L18)
2. Simplify `normalizeLangCode()` in [info.ts](../packages/lang/src/info.ts#L26)
3. Update any hardcoded language codes in the codebase

## Dependencies

- `@pantolingo/lang` package must be deployed first
- Test display functions work with new codes before migration
- Coordinate with any running translate proxy instances

## Risks

- Existing cached translations won't match new codes until cache expires
- Any external integrations expecting `es`/`fr` will need updates
