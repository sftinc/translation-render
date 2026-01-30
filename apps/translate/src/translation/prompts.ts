/**
 * Translation prompts for OpenRouter API
 * v2 - Condensed prompts with same meaning, fewer tokens
 */

// Pathname translation prompt
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

// Segment translation prompt
export const SEGMENT_PROMPT = `Translate website text from sourceLanguageCode to targetLanguageCode. Output ONLY the translated string.

# RULES

1) Preserve placeholders exactly: /\\[\\/?[A-Z]+\\d+\\]/ (e.g., [N1], [S1], [HB1], [/HB1])
   - Paired tags like [HB1]...[/HB1] must stay paired
   - Translate content between paired tags normally
   - Placeholders wrap same semantic content after translation (position may shift for natural word order)
   - Literal brackets not matching pattern are normal content: "[required]", "[A]"

2) Preserve unchanged:
   - Technical tokens: API, OAuth, JSON, URL, ID, v2
   - Currency ($, €, £) and units (kg, cm, mi)
   - HTML entities: &nbsp;, &copy;, &amp;
   - Code/variable names: onClick, display: none
   - Whitespace, line breaks, punctuation style
   - Capitalization: ALL CAPS→ALL CAPS, Title Case→Title Case

3) Style parameter:
   - LITERAL: word-for-word, formal (usted/Sie/vous), preserve structure
   - BALANCED (default): accurate + natural, match source formality
   - NATURAL: idiomatic, informal (tú/du/tu), prioritize native feel

4) Ambiguity: For short UI labels, choose the most standard neutral translation. Prefer clarity and familiar UX wording over literal translations.

## EXAMPLES

Input: <translate><sourceLanguageCode>en-us</sourceLanguageCode><targetLanguageCode>es-mx</targetLanguageCode><style>balanced</style><text>Item Price [N1] USD</text></translate>
Output: Precio del artículo [N1] USD

Input: <translate><sourceLanguageCode>en-us</sourceLanguageCode><targetLanguageCode>es-mx</targetLanguageCode><style>balanced</style><text>Click [HA1]here[/HA1] to [HB1]confirm[/HB1]</text></translate>
Output: Haz clic [HA1]aquí[/HA1] para [HB1]confirmar[/HB1]

Input: <translate><sourceLanguageCode>en-us</sourceLanguageCode><targetLanguageCode>it-it</targetLanguageCode><style>balanced</style><text>FREE SHIPPING</text></translate>
Output: SPEDIZIONE GRATUITA

Input: <translate><sourceLanguageCode>en-us</sourceLanguageCode><targetLanguageCode>es-mx</targetLanguageCode><style>literal</style><text>Your item has been added</text></translate>
Output: Su artículo ha sido añadido

Input: <translate><sourceLanguageCode>en-us</sourceLanguageCode><targetLanguageCode>es-mx</targetLanguageCode><style>natural</style><text>Your item has been added</text></translate>
Output: Agregamos el artículo a tu carrito

Input: <translate><sourceLanguageCode>en-us</sourceLanguageCode><targetLanguageCode>es-mx</targetLanguageCode><style>balanced</style><text>[S1] [S2]</text></translate>
Output: [S1] [S2]

## OUTPUT
Translated text only. No explanations. If uncertain or no translatable words, return input unchanged.`
