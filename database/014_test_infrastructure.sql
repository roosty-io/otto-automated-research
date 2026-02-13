-- Test Infrastructure Tables
-- Support for controlled testing of research pipelines

-- Add missing columns to research_pipelines
ALTER TABLE research_pipelines
  ADD COLUMN IF NOT EXISTS cassini_metrics JSONB DEFAULT NULL;

-- Add store_id and test_mode to pipeline_config
ALTER TABLE pipeline_config
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS test_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cassini_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cassini_min_score INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS cassini_prioritize BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS cassini_optimize_titles BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS cassini_target_trp BOOLEAN DEFAULT false;

-- Update pipeline stage constraint to include cassini_optimizing
ALTER TABLE research_pipelines
  DROP CONSTRAINT IF EXISTS check_pipeline_stage;

ALTER TABLE research_pipelines
  ADD CONSTRAINT check_pipeline_stage
  CHECK (stage IN ('queued', 'researching', 'sourcing', 'normalizing', 'cassini_optimizing', 'generating', 'complete', 'error'));

-- Test runs table
CREATE TABLE IF NOT EXISTS test_runs (
  id SERIAL PRIMARY KEY,
  test_id VARCHAR(64) UNIQUE NOT NULL,
  pipeline_id VARCHAR(64) NOT NULL REFERENCES research_pipelines(pipeline_id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,

  -- Test configuration
  config JSONB NOT NULL,

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'started',

  -- Results (populated on completion)
  results JSONB,
  errors JSONB,

  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Constraints
  CONSTRAINT check_test_status CHECK (status IN ('started', 'running', 'completed', 'failed'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_test_runs_pipeline ON test_runs(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_store ON test_runs(store_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_status ON test_runs(status);
CREATE INDEX IF NOT EXISTS idx_test_runs_started ON test_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_config_store ON pipeline_config(store_id);

-- Comments
COMMENT ON TABLE test_runs IS 'Tracks test executions of the research pipeline for validation';
COMMENT ON COLUMN test_runs.config IS 'Test configuration: category, maxProducts, stages, priceRange, etc.';
COMMENT ON COLUMN test_runs.results IS 'Test results: totalProducts, qualifiedProducts, skusCreated, avgCassiniScore, pricingStats';

-- RLS
ALTER TABLE test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to test_runs" ON test_runs
  FOR ALL USING (auth.role() = 'service_role');
