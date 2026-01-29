/**
 * Pathname prompt tests
 * Validates pathname translation prompt behavior with 10 test cases
 *
 * Run: pnpm test apps/translate/src/translation/prompt-tests/pathname-prompt.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { PATHNAME_TEST_CASES, type PathnameTestCase } from './fixtures/pathname-test-cases.js'
import { translate, type TranslateResult } from './utils/translate-client.js'
import {
	validatePlaceholdersPreserved,
	validatePathStructure,
	validateAsciiSafe,
	validateTrailingSlash,
	validateTokensUnchanged,
	validateTranslated,
	validateUnchanged,
} from './utils/validators.js'
import { PATHNAME_PROMPT } from './prompts/pathname-prompt-v1.js'

// Test configuration
const SOURCE_LANG = 'en-us'
const TARGET_LANG = 'es-mx'

describe('Pathname Prompt Tests', () => {
	beforeAll(() => {
		console.log(`\n🧪 Running pathname tests (temperature=0)\n`)
	})

	for (const testCase of PATHNAME_TEST_CASES) {
		it(`[${testCase.name}] ${testCase.description}`, async () => {
			// Get translation result
			const result = await translate({
				type: 'pathname',
				sourceLanguageCode: SOURCE_LANG,
				targetLanguageCode: TARGET_LANG,
				text: testCase.input,
				prompt: PATHNAME_PROMPT,
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
function runValidators(testCase: PathnameTestCase, result: TranslateResult): void {
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

			case 'pathStructure': {
				const check = validatePathStructure(testCase.input, result.output)
				expect(
					check.valid,
					`Path structure errors: ${check.errors.join(', ')}`
				).toBe(true)
				break
			}

			case 'asciiSafe': {
				const check = validateAsciiSafe(result.output)
				expect(
					check.valid,
					`Invalid characters found: ${check.invalidChars.join(', ')}`
				).toBe(true)
				break
			}

			case 'trailingSlash': {
				const check = validateTrailingSlash(testCase.input, result.output)
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

			case 'segmentCount': {
				const segments = result.output.split('/').filter((s) => s !== '')
				expect(
					segments.length,
					`Expected ${validator.count} segments, got ${segments.length}`
				).toBe(validator.count)
				break
			}

			case 'notEqual': {
				expect(
					result.output,
					`Output should not equal "${validator.other}"`
				).not.toBe(validator.other)
				break
			}

			default:
				// TypeScript exhaustiveness check
				const _exhaustive: never = validator
				throw new Error(`Unknown validator type: ${JSON.stringify(_exhaustive)}`)
		}
	}
}
