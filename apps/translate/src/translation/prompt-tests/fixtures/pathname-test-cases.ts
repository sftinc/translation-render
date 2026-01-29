/**
 * Pathname test case definitions
 * 10 test cases for validating pathname translation prompts
 */

export interface PathnameTestCase {
	name: string
	description: string
	input: string
	validators: PathnameValidator[]
	/** Expected mock output for dry-run mode validation */
	mockOutput: string
}

export type PathnameValidator =
	| { type: 'translated' }
	| { type: 'unchanged' }
	| { type: 'placeholdersPreserved' }
	| { type: 'pathStructure' }
	| { type: 'asciiSafe' }
	| { type: 'trailingSlash' }
	| { type: 'tokensUnchanged'; tokens: string[] }
	| { type: 'segmentCount'; count: number }
	| { type: 'notEqual'; other: string }

export const PATHNAME_TEST_CASES: PathnameTestCase[] = [
	{
		name: 'basic-pathname',
		description: 'Basic pathname should be translated with structure preserved',
		input: '/products',
		validators: [{ type: 'translated' }, { type: 'pathStructure' }],
		mockOutput: '/productos',
	},
	{
		name: 'numeric-placeholder',
		description: 'Numeric placeholders [N1] should be preserved in pathnames',
		input: '/item/[N1]/details',
		validators: [
			{ type: 'placeholdersPreserved' },
			{ type: 'pathStructure' },
			{ type: 'tokensUnchanged', tokens: ['[N1]'] },
		],
		mockOutput: '/articulo/[N1]/detalles',
	},
	{
		name: 'url-structure',
		description: 'URL structure with multiple segments should preserve count',
		input: '/shop/items',
		validators: [
			{ type: 'pathStructure' },
			{ type: 'segmentCount', count: 2 },
		],
		mockOutput: '/tienda/articulos',
	},
	{
		name: 'ascii-safe',
		description: 'Output should contain only ASCII-safe characters',
		input: '/cafe/menu',
		validators: [
			{ type: 'pathStructure' },
			{ type: 'asciiSafe' },
		],
		mockOutput: '/cafe/menu',
	},
	{
		name: 'auth-login',
		description: 'Login pathname should translate to appropriate login term',
		input: '/login',
		validators: [
			{ type: 'translated' },
			{ type: 'pathStructure' },
			{ type: 'asciiSafe' },
		],
		mockOutput: '/iniciar-sesion',
	},
	{
		name: 'auth-signup',
		description: 'Signup should translate differently from login',
		input: '/signup',
		validators: [
			{ type: 'translated' },
			{ type: 'pathStructure' },
			{ type: 'asciiSafe' },
			// Signup should not equal login translation
			{ type: 'notEqual', other: '/iniciar-sesion' },
		],
		mockOutput: '/registrarse',
	},
	{
		name: 'technical-tokens',
		description: 'Technical tokens like api, v2 should remain unchanged',
		input: '/api/v2/user',
		validators: [
			{ type: 'pathStructure' },
			{ type: 'tokensUnchanged', tokens: ['api', 'v2'] },
		],
		mockOutput: '/api/v2/usuario',
	},
	{
		name: 'multiple-segments',
		description: 'Multiple segments should all be translated',
		input: '/help/article/update-email',
		validators: [
			{ type: 'translated' },
			{ type: 'pathStructure' },
			{ type: 'segmentCount', count: 3 },
		],
		mockOutput: '/ayuda/articulo/actualizar-correo',
	},
	{
		name: 'trailing-slash',
		description: 'Trailing slash should be preserved when present',
		input: '/products/',
		validators: [
			{ type: 'pathStructure' },
			{ type: 'trailingSlash' },
		],
		mockOutput: '/productos/',
	},
	{
		name: 'placeholder-only',
		description: 'Pathname with only placeholders should return unchanged',
		input: '/[S1]/[N1]',
		validators: [
			{ type: 'unchanged' },
			{ type: 'placeholdersPreserved' },
		],
		mockOutput: '/[S1]/[N1]',
	},
	{
		name: 'brand-placeholder',
		description: 'Pathname with brand name and placeholder should return unchanged',
		input: '/ebay/[N1]',
		validators: [
			{ type: 'unchanged' },
			{ type: 'placeholdersPreserved' },
			{ type: 'pathStructure' },
		],
		mockOutput: '/ebay/[N1]',
	},
]
