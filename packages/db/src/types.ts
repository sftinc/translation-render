/**
 * TypeScript type definitions for the database package
 */

// LLM usage tracking types

/** LLM feature type - add new values when features are built (e.g., 'ai_review') */
export type LlmFeature = 'segment_translation' | 'path_translation'

/** Token usage from a single LLM API call */
export interface TokenUsage {
	promptTokens: number
	completionTokens: number
	cost: number // USD
}

/** Record for batch upserting LLM usage data */
export interface LlmUsageRecord {
	websiteId: number
	feature: LlmFeature
	promptTokens: number
	completionTokens: number
	cost: number
	apiCalls: number
}
