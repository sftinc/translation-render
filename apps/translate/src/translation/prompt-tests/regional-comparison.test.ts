/**
 * Regional variant comparison tests
 * Tests that translations differ appropriately between regional variants (e.g., es-mx vs es-es)
 *
 * Run: pnpm test apps/translate/src/translation/prompt-tests/regional-comparison.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { translate } from './utils/translate-client.js'
import { SEGMENT_PROMPT } from './prompts/segment-prompt-v1.js'

interface RegionalTestCase {
	name: string
	description: string
	input: string
	style?: 'literal' | 'balanced' | 'natural'
	regionA: string
	regionB: string
	/** Whether we expect the outputs to differ */
	expectDifferent: boolean
}

const REGIONAL_TEST_CASES: RegionalTestCase[] = [
	{
		name: 'cart-es-mx-vs-es-es',
		description: 'Cart terminology differs: carrito (MX) vs cesta (ES)',
		input: 'Add to cart',
		regionA: 'es-mx',
		regionB: 'es-es',
		expectDifferent: true,
	},
	{
		name: 'computer-es-mx-vs-es-es',
		description: 'Computer terminology differs: computadora (MX) vs ordenador (ES)',
		input: 'Your computer',
		regionA: 'es-mx',
		regionB: 'es-es',
		expectDifferent: true,
	},
	{
		name: 'cell-phone-es-mx-vs-es-es',
		description: 'Cell phone differs: celular (MX) vs móvil (ES)',
		input: 'Enter your cell phone number',
		regionA: 'es-mx',
		regionB: 'es-es',
		expectDifferent: true,
	},
	{
		name: 'car-es-mx-vs-es-es',
		description: 'Car differs: carro (MX) vs coche (ES)',
		input: 'Your car details',
		regionA: 'es-mx',
		regionB: 'es-es',
		expectDifferent: true,
	},
	{
		name: 'driver-license-es-mx-vs-es-es',
		description: 'Driver license differs: licencia de conducir (MX) vs carnet de conducir (ES)',
		input: "Driver's license",
		regionA: 'es-mx',
		regionB: 'es-es',
		expectDifferent: true,
	},
	{
		name: 'email-es-mx-vs-es-es',
		description: 'Verb differs: revisa (MX) vs comprueba (ES)',
		input: 'Check your email',
		regionA: 'es-mx',
		regionB: 'es-es',
		expectDifferent: true,
	},
	{
		name: 'literal-style-cart',
		description: 'Literal style should still respect regional vocabulary',
		input: 'Your item has been added to cart',
		style: 'literal',
		regionA: 'es-mx',
		regionB: 'es-es',
		expectDifferent: true,
	},
]

describe('Regional Variant Comparison', () => {
	beforeAll(() => {
		console.log('\n🌎 Running regional comparison tests (temperature=0)\n')
	})

	for (const testCase of REGIONAL_TEST_CASES) {
		it(`[${testCase.name}] ${testCase.description}`, async () => {
			// Run both regional variants in parallel
			const [resultA, resultB] = await Promise.all([
				translate({
					type: 'segment',
					sourceLanguageCode: 'en-us',
					targetLanguageCode: testCase.regionA,
					text: testCase.input,
					style: testCase.style ?? 'balanced',
					prompt: SEGMENT_PROMPT,
				}),
				translate({
					type: 'segment',
					sourceLanguageCode: 'en-us',
					targetLanguageCode: testCase.regionB,
					text: testCase.input,
					style: testCase.style ?? 'balanced',
					prompt: SEGMENT_PROMPT,
				}),
			])

			// Log results
			console.log(`  Input:        "${testCase.input}"`)
			console.log(`  ${testCase.regionA}:  "${resultA.output}"`)
			console.log(`  ${testCase.regionB}:  "${resultB.output}"`)

			const areDifferent = resultA.output !== resultB.output
			const matchIcon = areDifferent === testCase.expectDifferent ? '✓' : '✗'
			console.log(
				`  Different:    ${areDifferent} (expected: ${testCase.expectDifferent}) ${matchIcon}\n`
			)

			if (testCase.expectDifferent) {
				expect(
					resultA.output,
					`Expected ${testCase.regionA} and ${testCase.regionB} to produce different translations`
				).not.toBe(resultB.output)
			} else {
				expect(
					resultA.output,
					`Expected ${testCase.regionA} and ${testCase.regionB} to produce same translation`
				).toBe(resultB.output)
			}
		})
	}
})
