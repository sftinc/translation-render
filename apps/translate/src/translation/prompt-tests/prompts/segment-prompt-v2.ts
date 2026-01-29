/**
 * Segment translation prompt v2 - condensed version
 * Same meaning as v1, fewer tokens
 */

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
