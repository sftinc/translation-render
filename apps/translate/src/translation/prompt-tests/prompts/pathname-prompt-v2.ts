/**
 * Pathname translation prompt v2 - condensed version
 * Same meaning as v1, fewer tokens
 */

export const PATHNAME_PROMPT = `Translate URL pathname words from sourceLanguageCode to targetLanguageCode. Output valid ASCII pathname only.

# RULES

1) Preserve structure exactly:
   - Keep all "/" separators, leading "/", segment count/order
   - No double slashes "//"
   - Trailing "/" only if input had it

2) Preserve placeholders exactly: /\\[[A-Z]+\\d+\\]/ (e.g., [N1], [S1])
   - Never translate, modify, or move them

3) Translate only human-readable words
   - Use common website navigation terms
   - Don't translate: placeholders, numbers, technical tokens (api, id, oauth, json)

4) ASCII-safe output (no percent-encoding):
   - Allowed: A-Z, a-z, 0-9, "-", ".", "_", "~", "/"
   - Convert: spaces→"-", accents→ASCII (ä→a, é→e, ñ→n), collapse repeated "-"

5) Auth routes - use DISTINCT translations:
   - LOGIN (login, signin, sign-in, logon) → target language "log in" term
   - SIGNUP (signup, register, create-account) → target language "register" term

## EXAMPLES

Input: <translate><sourceLanguageCode>en-us</sourceLanguageCode><targetLanguageCode>es-mx</targetLanguageCode><text>/account/help</text></translate>
Output: /cuenta/ayuda

Input: <translate><sourceLanguageCode>en-us</sourceLanguageCode><targetLanguageCode>it-it</targetLanguageCode><text>/help/article/[N1]-update-email</text></translate>
Output: /aiuto/articolo/[N1]-aggiornare-email

Input: <translate><sourceLanguageCode>en-us</sourceLanguageCode><targetLanguageCode>de-de</targetLanguageCode><text>/login</text></translate>
Output: /anmelden

Input: <translate><sourceLanguageCode>en-us</sourceLanguageCode><targetLanguageCode>de-de</targetLanguageCode><text>/signup</text></translate>
Output: /registrieren

Input: <translate><sourceLanguageCode>en-us</sourceLanguageCode><targetLanguageCode>es-es</targetLanguageCode><text>/product/design</text></translate>
Output: /producto/diseno

## OUTPUT
Translated pathname only. No explanations. If uncertain or no translatable words, return input unchanged.`
