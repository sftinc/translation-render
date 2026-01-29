/**
 * Side-by-side prompt comparison tests
 * Compares current prompts vs v2 prompts and writes results to JSON files
 *
 * Run: pnpm test apps/translate/src/translation/prompt-tests/compare-prompts.test.ts
 *
 * Results are written to: apps/translate/src/translation/prompt-tests/results/
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve } from 'path'
import { SEGMENT_TEST_CASES } from './fixtures/segment-test-cases.js'
import { PATHNAME_TEST_CASES } from './fixtures/pathname-test-cases.js'
import { translate } from './utils/translate-client.js'
import { SEGMENT_PROMPT } from './prompts/segment-prompt-v1.js'
import { SEGMENT_PROMPT as SEGMENT_PROMPT_V2 } from './prompts/segment-prompt-v2.js'
import { PATHNAME_PROMPT } from './prompts/pathname-prompt-v1.js'
import { PATHNAME_PROMPT as PATHNAME_PROMPT_V2 } from './prompts/pathname-prompt-v2.js'

// Test configuration
const SOURCE_LANG = 'en-us'
const TARGET_LANG = 'es-mx'

// Results storage
interface TestResult {
	name: string
	description: string
	input: string
	style?: string
	expectedMock: string
	v1Output: string
	v2Output: string
	v1MatchesExpected: boolean
	v2MatchesExpected: boolean
	v1EqualsV2: boolean
}

interface ComparisonResults {
	timestamp: string
	sourceLanguage: string
	targetLanguage: string
	mode: 'live' | 'mock'
	segments: TestResult[]
	pathnames: TestResult[]
	summary: {
		segmentsTotal: number
		segmentsV1MatchExpected: number
		segmentsV2MatchExpected: number
		segmentsV1EqualsV2: number
		pathnamesTotal: number
		pathnamesV1MatchExpected: number
		pathnamesV2MatchExpected: number
		pathnamesV1EqualsV2: number
	}
}

const results: ComparisonResults = {
	timestamp: new Date().toISOString(),
	sourceLanguage: SOURCE_LANG,
	targetLanguage: TARGET_LANG,
	mode: 'live',
	segments: [],
	pathnames: [],
	summary: {
		segmentsTotal: 0,
		segmentsV1MatchExpected: 0,
		segmentsV2MatchExpected: 0,
		segmentsV1EqualsV2: 0,
		pathnamesTotal: 0,
		pathnamesV1MatchExpected: 0,
		pathnamesV2MatchExpected: 0,
		pathnamesV1EqualsV2: 0,
	},
}

describe('Prompt Comparison', () => {
	beforeAll(() => {
		console.log('\n🔬 Running side-by-side prompt comparison (temperature=0)\n')
	})

	afterAll(() => {

		// Calculate summary
		results.summary.segmentsTotal = results.segments.length
		results.summary.segmentsV1MatchExpected = results.segments.filter(r => r.v1MatchesExpected).length
		results.summary.segmentsV2MatchExpected = results.segments.filter(r => r.v2MatchesExpected).length
		results.summary.segmentsV1EqualsV2 = results.segments.filter(r => r.v1EqualsV2).length
		results.summary.pathnamesTotal = results.pathnames.length
		results.summary.pathnamesV1MatchExpected = results.pathnames.filter(r => r.v1MatchesExpected).length
		results.summary.pathnamesV2MatchExpected = results.pathnames.filter(r => r.v2MatchesExpected).length
		results.summary.pathnamesV1EqualsV2 = results.pathnames.filter(r => r.v1EqualsV2).length

		// Write results to file
		const resultsDir = resolve(process.cwd(), 'apps/translate/src/translation/prompt-tests/results')
		if (!existsSync(resultsDir)) {
			mkdirSync(resultsDir, { recursive: true })
		}

		const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
		const filename = `comparison-${timestamp}.json`
		const filepath = resolve(resultsDir, filename)

		writeFileSync(filepath, JSON.stringify(results, null, 2))
		console.log(`\n📄 Results written to: ${filepath}`)

		// Print summary
		console.log('\n📊 Summary:')
		console.log(`   Segments: ${results.summary.segmentsV1EqualsV2}/${results.summary.segmentsTotal} v1=v2`)
		console.log(`   Pathnames: ${results.summary.pathnamesV1EqualsV2}/${results.summary.pathnamesTotal} v1=v2`)
	})

	describe('Segment Prompts', () => {
		for (const testCase of SEGMENT_TEST_CASES) {
			it(`[${testCase.name}] ${testCase.input}`, async () => {
				// Run both prompts in parallel
				const [v1Result, v2Result] = await Promise.all([
					translate({
						type: 'segment',
						sourceLanguageCode: SOURCE_LANG,
						targetLanguageCode: TARGET_LANG,
						text: testCase.input,
						style: testCase.style ?? 'balanced',
						prompt: SEGMENT_PROMPT,
					}),
					translate({
						type: 'segment',
						sourceLanguageCode: SOURCE_LANG,
						targetLanguageCode: TARGET_LANG,
						text: testCase.input,
						style: testCase.style ?? 'balanced',
						prompt: SEGMENT_PROMPT_V2,
					}),
				])

				const testResult: TestResult = {
					name: testCase.name,
					description: testCase.description,
					input: testCase.input,
					style: testCase.style ?? 'balanced',
					expectedMock: testCase.mockOutput,
					v1Output: v1Result.output,
					v2Output: v2Result.output,
					v1MatchesExpected: v1Result.output === testCase.mockOutput,
					v2MatchesExpected: v2Result.output === testCase.mockOutput,
					v1EqualsV2: v1Result.output === v2Result.output,
				}

				results.segments.push(testResult)

				// Log comparison
				const match = testResult.v1EqualsV2 ? '✓' : '≠'
				console.log(`  Input:    "${testCase.input}"`)
				console.log(`  Expected: "${testCase.mockOutput}"`)
				console.log(`  v1:       "${v1Result.output}"${testResult.v1MatchesExpected ? ' ✓' : ''}`)
				console.log(`  v2:       "${v2Result.output}"${testResult.v2MatchesExpected ? ' ✓' : ''}  ${match}`)
				console.log('')

				expect(v1Result.output.length).toBeGreaterThan(0)
				expect(v2Result.output.length).toBeGreaterThan(0)
			})
		}
	})

	describe('Pathname Prompts', () => {
		for (const testCase of PATHNAME_TEST_CASES) {
			it(`[${testCase.name}] ${testCase.input}`, async () => {
				// Run both prompts in parallel
				const [v1Result, v2Result] = await Promise.all([
					translate({
						type: 'pathname',
						sourceLanguageCode: SOURCE_LANG,
						targetLanguageCode: TARGET_LANG,
						text: testCase.input,
						prompt: PATHNAME_PROMPT,
					}),
					translate({
						type: 'pathname',
						sourceLanguageCode: SOURCE_LANG,
						targetLanguageCode: TARGET_LANG,
						text: testCase.input,
						prompt: PATHNAME_PROMPT_V2,
					}),
				])

				const testResult: TestResult = {
					name: testCase.name,
					description: testCase.description,
					input: testCase.input,
					expectedMock: testCase.mockOutput,
					v1Output: v1Result.output,
					v2Output: v2Result.output,
					v1MatchesExpected: v1Result.output === testCase.mockOutput,
					v2MatchesExpected: v2Result.output === testCase.mockOutput,
					v1EqualsV2: v1Result.output === v2Result.output,
				}

				results.pathnames.push(testResult)

				// Log comparison
				const match = testResult.v1EqualsV2 ? '✓' : '≠'
				console.log(`  Input:    "${testCase.input}"`)
				console.log(`  Expected: "${testCase.mockOutput}"`)
				console.log(`  v1:       "${v1Result.output}"${testResult.v1MatchesExpected ? ' ✓' : ''}`)
				console.log(`  v2:       "${v2Result.output}"${testResult.v2MatchesExpected ? ' ✓' : ''}  ${match}`)
				console.log('')

				expect(v1Result.output.length).toBeGreaterThan(0)
				expect(v2Result.output.length).toBeGreaterThan(0)
			})
		}
	})
})
