# BCP 47 Regional Language Codes

## Task

Convert `@pantolingo/lang` from ISO 639-1 codes to regional BCP 47 codes with backwards compatibility.

## Why

- Regional codes enable locale-specific translations (es-mx vs es-es)
- Flag emojis can be derived from region suffix
- Better alignment with web standards (html lang attribute)
- More precise targeting for translation quality

## Implementation

### Changes Made

1. **Updated `LanguageData` interface** ([data.ts:6](../packages/lang/src/data.ts#L6))
   - Removed `countries` field (region now embedded in code)
   - Added `flag` field for emoji flags

2. **Added `LEGACY_CODE_MAP`** ([data.ts:18](../packages/lang/src/data.ts#L18))
   - Maps `es` → `es-mx`, `fr` → `fr-fr`
   - Marked `@deprecated` for future removal

3. **Expanded `LANGUAGE_DATA`** ([data.ts:27](../packages/lang/src/data.ts#L27))
   - From 41 simple codes to ~120 regional codes
   - Sorted alphabetically
   - Chinese kept as `zh-hans`/`zh-hant` (script codes)

4. **Added normalization functions** ([info.ts](../packages/lang/src/info.ts))
   - `normalizeLangCode()` - Converts legacy to regional
   - `isLegacyCode()` - Checks if code is deprecated
   - `countryCodeToFlag()` - Converts country code to emoji
   - `getFlag()` - Gets flag for any language code

5. **Updated `getLanguageInfo()`** ([info.ts:105](../packages/lang/src/info.ts#L105))
   - Normalizes input codes
   - Returns flag in response

6. **Updated RTL detection** ([lookup.ts:37](../packages/lang/src/lookup.ts#L37))
   - `isRtlLanguage()` handles both regional and base codes

7. **Added region lookup** ([lookup.ts:67](../packages/lang/src/lookup.ts#L67))
   - `getLanguagesForRegion()` - Get languages for a country

8. **Deprecated old functions** ([lookup.ts:78](../packages/lang/src/lookup.ts#L78))
   - `getLanguagesForCountry()` - Alias for getLanguagesForRegion
   - `getCountriesForLanguage()` - Returns empty array

## Usage Examples

```typescript
import { getLanguageName, getFlag, normalizeLangCode, isRtlLanguage } from '@pantolingo/lang'

// Legacy codes still work (display only)
normalizeLangCode('es')     // 'es-mx'
getLanguageName('es')       // 'Spanish (Mexico)'
getFlag('es')               // '🇲🇽'

// Regional codes
getLanguageName('es-es')    // 'Spanish (Spain)'
getFlag('fr-ca')            // '🇨🇦'

// RTL detection
isRtlLanguage('ar')         // true (base code)
isRtlLanguage('ar-sa')      // true (regional)
```

## Important Notes

- `LEGACY_CODE_MAP` is for **display normalization only**
- Database still stores `es`, `fr` - queries are unchanged
- See `todo_db-lang-migration.md` for future database migration

## Files Modified

- [packages/lang/src/data.ts](../packages/lang/src/data.ts)
- [packages/lang/src/info.ts](../packages/lang/src/info.ts)
- [packages/lang/src/lookup.ts](../packages/lang/src/lookup.ts)
- [packages/lang/src/index.ts](../packages/lang/src/index.ts)
