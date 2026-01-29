-- =============================================================================
-- Migration: Rename Logging/Stats Tables
-- =============================================================================
-- Run this SQL AFTER the code changes are deployed.
-- The code must be updated first because it references the new table names.
--
-- Tables renamed:
--   website_audit_log → log_activity (event log)
--   website_llm_usage → stats_llm_usage (daily rollup)
--   website_path_view → stats_page_view (daily rollup)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. RENAME TABLES
-- =============================================================================

ALTER TABLE website_audit_log RENAME TO log_activity;
ALTER TABLE website_llm_usage RENAME TO stats_llm_usage;
ALTER TABLE website_path_view RENAME TO stats_page_view;

-- =============================================================================
-- 2. RENAME SEQUENCES (only log_activity has one)
-- =============================================================================

ALTER SEQUENCE website_audit_log_id_seq RENAME TO log_activity_id_seq;
ALTER SEQUENCE log_activity_id_seq OWNED BY log_activity.id;

-- =============================================================================
-- 3. RENAME PRIMARY KEY CONSTRAINTS
-- =============================================================================

ALTER TABLE log_activity RENAME CONSTRAINT website_audit_log_pkey TO log_activity_pkey;
ALTER TABLE stats_llm_usage RENAME CONSTRAINT website_llm_usage_pkey TO stats_llm_usage_pkey;
ALTER TABLE stats_page_view RENAME CONSTRAINT website_path_view_pkey TO stats_page_view_pkey;

-- =============================================================================
-- 4. RENAME INDEXES
-- =============================================================================

ALTER INDEX idx_website_audit_log_website_created RENAME TO idx_log_activity_website_created;
ALTER INDEX idx_website_path_view_date RENAME TO idx_stats_page_view_date;

-- =============================================================================
-- 5. RENAME FOREIGN KEY CONSTRAINTS
-- =============================================================================

ALTER TABLE log_activity RENAME CONSTRAINT website_audit_log_account_id_fkey TO log_activity_account_id_fkey;
ALTER TABLE log_activity RENAME CONSTRAINT website_audit_log_website_id_fkey TO log_activity_website_id_fkey;
ALTER TABLE stats_llm_usage RENAME CONSTRAINT website_llm_usage_website_id_fkey TO stats_llm_usage_website_id_fkey;
ALTER TABLE stats_page_view RENAME CONSTRAINT website_path_view_website_path_id_fkey TO stats_page_view_website_path_id_fkey;

-- =============================================================================
-- 6. RENAME TRIGGERS
-- =============================================================================

ALTER TRIGGER update_website_llm_usage_updated_at ON stats_llm_usage RENAME TO update_stats_llm_usage_updated_at;
ALTER TRIGGER website_path_view_updated_at ON stats_page_view RENAME TO stats_page_view_updated_at;

-- =============================================================================
-- 7. RENAME NOT NULL CONSTRAINTS
-- =============================================================================

-- log_activity (constraints had website_activity_ prefix)
ALTER TABLE log_activity RENAME CONSTRAINT website_activity_details_not_null TO log_activity_details_not_null;
ALTER TABLE log_activity RENAME CONSTRAINT website_activity_id_not_null TO log_activity_id_not_null;
ALTER TABLE log_activity RENAME CONSTRAINT website_activity_type_not_null TO log_activity_type_not_null;
ALTER TABLE log_activity RENAME CONSTRAINT website_activity_website_id_not_null TO log_activity_website_id_not_null;

-- stats_llm_usage
ALTER TABLE stats_llm_usage RENAME CONSTRAINT website_llm_usage_api_calls_not_null TO stats_llm_usage_api_calls_not_null;
ALTER TABLE stats_llm_usage RENAME CONSTRAINT website_llm_usage_completion_tokens_not_null TO stats_llm_usage_completion_tokens_not_null;
ALTER TABLE stats_llm_usage RENAME CONSTRAINT website_llm_usage_feature_not_null TO stats_llm_usage_feature_not_null;
ALTER TABLE stats_llm_usage RENAME CONSTRAINT website_llm_usage_prompt_tokens_not_null TO stats_llm_usage_prompt_tokens_not_null;
ALTER TABLE stats_llm_usage RENAME CONSTRAINT website_llm_usage_total_cost_not_null TO stats_llm_usage_total_cost_not_null;
ALTER TABLE stats_llm_usage RENAME CONSTRAINT website_llm_usage_usage_date_not_null TO stats_llm_usage_usage_date_not_null;
ALTER TABLE stats_llm_usage RENAME CONSTRAINT website_llm_usage_website_id_not_null TO stats_llm_usage_website_id_not_null;

-- stats_page_view (constraints had origin_path_view_ prefix)
ALTER TABLE stats_page_view RENAME CONSTRAINT origin_path_view_lang_not_null TO stats_page_view_lang_not_null;
ALTER TABLE stats_page_view RENAME CONSTRAINT origin_path_view_origin_path_id_not_null TO stats_page_view_website_path_id_not_null;
ALTER TABLE stats_page_view RENAME CONSTRAINT origin_path_view_view_date_not_null TO stats_page_view_view_date_not_null;

COMMIT;
