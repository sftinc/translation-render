# RTL Integration for Translate App

## Task

Integrate `isRtlLanguage()` from `@pantolingo/lang` into the translate app's DOM metadata module.

## Why

The translate app currently sets `lang` attribute on the `<html>` element ([dom-metadata.ts:26](../apps/translate/src/fetch/dom-metadata.ts#L26)) but does **not** set `dir="rtl"` for right-to-left languages.

Without this, pages translated to Arabic, Hebrew, Persian, or Urdu will display incorrectly - text alignment, layout direction, and UI elements will be wrong.

## Implementation

In `apps/translate/src/fetch/dom-metadata.ts`, update `updateHtmlLang()` to also set the `dir` attribute:

```typescript
import { isRtlLanguage } from '@pantolingo/lang'

function updateHtmlLang(document: any, targetLang: string): boolean {
  const htmlElement = document.documentElement || document.querySelector('html')

  if (!htmlElement) {
    console.warn('[Lang Metadata] No <html> element found')
    return false
  }

  const currentLang = htmlElement.getAttribute('lang')

  // Update lang attribute
  if (!currentLang || currentLang !== targetLang) {
    htmlElement.setAttribute('lang', targetLang)
  }

  // Set dir attribute for RTL languages
  const dir = isRtlLanguage(targetLang) ? 'rtl' : 'ltr'
  htmlElement.setAttribute('dir', dir)

  return true
}
```

## Dependencies

- Requires `@pantolingo/lang` package to be created first
- Add `@pantolingo/lang` to `apps/translate/package.json`

## RTL Languages (from lang package)

- `ar` - Arabic
- `he` - Hebrew
- `fa` - Persian
- `ur` - Urdu
