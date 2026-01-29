/**
 * Segment prompt tests
 * Validates segment translation prompt behavior with 10 test cases
 *
 * Run: pnpm test apps/translate/src/translation/prompt-tests/segment-prompt.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { SEGMENT_TEST_CASES, type SegmentTestCase } from './fixtures/segment-test-cases.js'
import { translate, type TranslateResult } from './utils/translate-client.js'
import {
	validatePlaceholdersPreserved,
	validatePairedPlaceholders,
	validateAllCaps,
	validateTokensUnchanged,
	validateTranslated,
	validateUnchanged,
} from './utils/validators.js'
import { SEGMENT_PROMPT } from './prompts/segment-prompt-v1.js'

// Test configuration
const SOURCE_LANG = 'en-us'
const TARGET_LANG = 'es-mx'

describe('Segment Prompt Tests', () => {
	beforeAll(() => {
		console.log(`\n🧪 Running segment tests (temperature=0)\n`)
	})

	for (const testCase of SEGMENT_TEST_CASES) {
		it(`[${testCase.name}] ${testCase.description}`, async () => {
			// Get translation result
			const result = await translate({
				type: 'segment',
				sourceLanguageCode: SOURCE_LANG,
				targetLanguageCode: TARGET_LANG,
				text: testCase.input,
				style: testCase.style ?? 'balanced',
				prompt: SEGMENT_PROMPT,
			})

			// Log input/output for visibility
			console.log(`  Input:  "${testCase.input}"`)
			console.log(`  Output: "${result.output}"`)

			// Run all validators for this test case
			runValidators(testCase, result)
		})
	}
})

/**
 * Run all validators for a test case
 */
function runValidators(testCase: SegmentTestCase, result: TranslateResult): void {
	for (const validator of testCase.validators) {
		switch (validator.type) {
			case 'translated': {
				const check = validateTranslated(testCase.input, result.output)
				expect(check.valid, check.reason).toBe(true)
				break
			}

			case 'unchanged': {
				const check = validateUnchanged(testCase.input, result.output)
				expect(check.valid, check.reason).toBe(true)
				break
			}

			case 'placeholdersPreserved': {
				const check = validatePlaceholdersPreserved(testCase.input, result.output)
				expect(
					check.valid,
					`Placeholder validation failed. Missing: [${check.missing.join(', ')}], Extra: [${check.extra.join(', ')}]`
				).toBe(true)
				break
			}

			case 'pairedPlaceholders': {
				const check = validatePairedPlaceholders(result.output)
				expect(
					check.valid,
					`Unpaired placeholders: ${check.unpaired.join(', ')}`
				).toBe(true)
				break
			}

			case 'allCaps': {
				const check = validateAllCaps(result.output)
				expect(check.valid, check.reason).toBe(true)
				break
			}

			case 'tokensUnchanged': {
				const check = validateTokensUnchanged(validator.tokens, result.output)
				expect(
					check.valid,
					`Missing tokens: ${check.missing.join(', ')}`
				).toBe(true)
				break
			}

			case 'contains': {
				expect(result.output).toContain(validator.text)
				break
			}

			default:
				// TypeScript exhaustiveness check
				const _exhaustive: never = validator
				throw new Error(`Unknown validator type: ${JSON.stringify(_exhaustive)}`)
		}
	}
}
