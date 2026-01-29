/**
 * LLM API usage tracking
 * Records daily rollup of token usage and costs per website per feature
 */

import { pool } from './pool.js'
import type { LlmUsageRecord } from './types.js'

/**
 * Record LLM API usage for daily rollup.
 * Non-blocking - errors logged but not thrown.
 */
export async function recordLlmUsage(records: LlmUsageRecord[]): Promise<void> {
	const valid = records.filter((r) => r.promptTokens > 0 || r.completionTokens > 0)
	if (valid.length === 0) return

	try {
		await pool.query(
			`INSERT INTO website_llm_usage (website_id, feature, usage_date, prompt_tokens, completion_tokens, total_cost, api_calls)
       SELECT
         unnest($1::int[]),
         unnest($2::text[]),
         CURRENT_DATE,
         unnest($3::int[]),
         unnest($4::int[]),
         unnest($5::numeric[]),
         unnest($6::int[])
       ON CONFLICT (website_id, feature, usage_date)
       DO UPDATE SET
         prompt_tokens = website_llm_usage.prompt_tokens + EXCLUDED.prompt_tokens,
         completion_tokens = website_llm_usage.completion_tokens + EXCLUDED.completion_tokens,
         total_cost = website_llm_usage.total_cost + EXCLUDED.total_cost,
         api_calls = website_llm_usage.api_calls + EXCLUDED.api_calls,
         updated_at = NOW()`,
			[
				valid.map((r) => r.websiteId),
				valid.map((r) => r.feature),
				valid.map((r) => r.promptTokens),
				valid.map((r) => r.completionTokens),
				valid.map((r) => r.cost),
				valid.map((r) => r.apiCalls),
			]
		)
	} catch (error) {
		console.error('Failed to record LLM usage:', error)
	}
}
