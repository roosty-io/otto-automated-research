-- PPME Drop All Objects
-- Run this BEFORE the migration if tables already exist
-- WARNING: This will delete all data!

-- Drop materialized views
DROP MATERIALIZED VIEW IF EXISTS mv_store_health CASCADE;

-- Drop views
DROP VIEW IF EXISTS v_store_capacity CASCADE;
DROP VIEW IF EXISTS v_listing_jobs_dashboard CASCADE;

-- Drop tables (in reverse dependency order)
DROP TABLE IF EXISTS listing_job_logs CASCADE;
DROP TABLE IF EXISTS listing_jobs CASCADE;
DROP TABLE IF EXISTS system_events CASCADE;
DROP TABLE IF EXISTS enforcement_actions CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS export_queue CASCADE;
DROP TABLE IF EXISTS export_batches CASCADE;
DROP TABLE IF EXISTS distribution_queue CASCADE;
DROP TABLE IF EXISTS store_sku_assignments CASCADE;
DROP TABLE IF EXISTS skus CASCADE;
DROP TABLE IF EXISTS patterns CASCADE;
DROP TABLE IF EXISTS normalized_products CASCADE;
DROP TABLE IF EXISTS raw_products CASCADE;
DROP TABLE IF EXISTS store_listing_budget CASCADE;
DROP TABLE IF EXISTS store_autods_config CASCADE;
DROP TABLE IF EXISTS stores CASCADE;
DROP TABLE IF EXISTS store_maturity_tiers CASCADE;
DROP TABLE IF EXISTS store_tiers CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS refresh_store_health CASCADE;
DROP FUNCTION IF EXISTS get_active_jobs CASCADE;
DROP FUNCTION IF EXISTS get_job_batch_size CASCADE;
DROP FUNCTION IF EXISTS create_managed_listing_job CASCADE;
DROP FUNCTION IF EXISTS create_onboarding_job CASCADE;
DROP FUNCTION IF EXISTS check_job_completion CASCADE;
DROP FUNCTION IF EXISTS update_all_store_ceilings CASCADE;
DROP FUNCTION IF EXISTS get_available_listing_slots CASCADE;
DROP FUNCTION IF EXISTS calculate_store_soft_ceiling CASCADE;
DROP FUNCTION IF EXISTS calculate_daily_listing_target CASCADE;
DROP FUNCTION IF EXISTS update_store_maturity CASCADE;
DROP FUNCTION IF EXISTS calculate_store_effective_limits CASCADE;
DROP FUNCTION IF EXISTS update_updated_at CASCADE;
DROP FUNCTION IF EXISTS update_store_listing_count CASCADE;
DROP FUNCTION IF EXISTS decrement_store_count CASCADE;
DROP FUNCTION IF EXISTS check_max_stores_per_sku CASCADE;

-- Drop types
DROP TYPE IF EXISTS listing_job_type CASCADE;
DROP TYPE IF EXISTS store_maturity CASCADE;
DROP TYPE IF EXISTS export_status CASCADE;
DROP TYPE IF EXISTS enforcement_action_type CASCADE;
DROP TYPE IF EXISTS job_status CASCADE;
DROP TYPE IF EXISTS sku_status CASCADE;
DROP TYPE IF EXISTS listing_status CASCADE;

-- Done!
SELECT 'All PPME objects dropped successfully' as status;
