/**
 * Segment test case definitions
 * 10 test cases for validating segment translation prompts
 */

export interface SegmentTestCase {
	name: string
	description: string
	input: string
	style?: 'literal' | 'balanced' | 'natural'
	validators: SegmentValidator[]
	/** Expected mock output for dry-run mode validation */
	mockOutput: string
}

export type SegmentValidator =
	| { type: 'translated' }
	| { type: 'unchanged' }
	| { type: 'placeholdersPreserved' }
	| { type: 'pairedPlaceholders' }
	| { type: 'allCaps' }
	| { type: 'tokensUnchanged'; tokens: string[] }
	| { type: 'contains'; text: string }

export const SEGMENT_TEST_CASES: SegmentTestCase[] = [
	{
		name: 'basic-translation',
		description: 'Basic text should be translated',
		input: 'Add to Cart',
		validators: [{ type: 'translated' }],
		mockOutput: 'Agregar al carrito',
	},
	{
		name: 'numeric-placeholder',
		description: 'Numeric placeholders [N1] should be preserved',
		input: 'Price: [N1] USD',
		validators: [
			{ type: 'placeholdersPreserved' },
			{ type: 'tokensUnchanged', tokens: ['[N1]', 'USD'] },
		],
		mockOutput: 'Precio: [N1] USD',
	},
	{
		name: 'skip-word-placeholder',
		description: 'Skip word placeholders [S1] should be preserved',
		input: 'Welcome to [S1]',
		validators: [
			{ type: 'translated' },
			{ type: 'placeholdersPreserved' },
		],
		mockOutput: 'Bienvenido a [S1]',
	},
	{
		name: 'paired-placeholder',
		description: 'Paired placeholders [HA1]...[/HA1] should remain paired',
		input: 'Click [HA1]here[/HA1]',
		validators: [
			{ type: 'placeholdersPreserved' },
			{ type: 'pairedPlaceholders' },
		],
		mockOutput: 'Haz clic [HA1]aquí[/HA1]',
	},
	{
		name: 'all-caps',
		description: 'ALL CAPS input should produce ALL CAPS output',
		input: 'FREE SHIPPING',
		validators: [{ type: 'translated' }, { type: 'allCaps' }],
		mockOutput: 'ENVÍO GRATIS',
	},
	{
		name: 'html-entity',
		description: 'HTML entities like &nbsp; should be preserved',
		input: 'Terms&nbsp;apply',
		validators: [
			{ type: 'translated' },
			{ type: 'tokensUnchanged', tokens: ['&nbsp;'] },
		],
		mockOutput: 'Términos&nbsp;aplican',
	},
	{
		name: 'style-literal',
		description: 'Literal style should use formal register',
		input: 'Your item has been added',
		style: 'literal',
		validators: [{ type: 'translated' }],
		mockOutput: 'Su artículo ha sido añadido',
	},
	{
		name: 'technical-tokens',
		description: 'Technical tokens like API, OAuth should remain unchanged',
		input: 'Use the API with OAuth',
		validators: [
			{ type: 'translated' },
			{ type: 'tokensUnchanged', tokens: ['API', 'OAuth'] },
		],
		mockOutput: 'Usa la API con OAuth',
	},
	{
		name: 'placeholder-only',
		description: 'Input with only brand + placeholder should return unchanged',
		input: 'eBay [S1]',
		validators: [{ type: 'unchanged' }],
		mockOutput: 'eBay [S1]',
	},
	{
		name: 'mixed-placeholders',
		description: 'Multiple different placeholder types should all be preserved',
		input: 'Contact [E1] about [N1]',
		validators: [
			{ type: 'placeholdersPreserved' },
			{ type: 'tokensUnchanged', tokens: ['[E1]', '[N1]'] },
		],
		mockOutput: 'Contacta [E1] sobre [N1]',
	},
]
