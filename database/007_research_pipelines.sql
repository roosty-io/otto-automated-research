-- Research Pipeline Tables
-- Tracks research pipeline execution and configuration

-- Pipeline execution state
CREATE TABLE IF NOT EXISTS research_pipelines (
  id SERIAL PRIMARY KEY,
  pipeline_id VARCHAR(64) UNIQUE NOT NULL,

  -- Current state
  stage VARCHAR(20) NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,

  -- Metrics
  products_found INTEGER NOT NULL DEFAULT 0,
  products_sourced INTEGER NOT NULL DEFAULT 0,
  products_normalized INTEGER NOT NULL DEFAULT 0,
  skus_generated INTEGER NOT NULL DEFAULT 0,

  -- Error tracking
  errors JSONB DEFAULT '[]',

  -- Job references
  job_ids TEXT[] DEFAULT '{}',

  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,

  -- User context
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id VARCHAR(64)
);

-- Indexes for pipeline queries
CREATE INDEX IF NOT EXISTS idx_pipelines_stage ON research_pipelines(stage);
CREATE INDEX IF NOT EXISTS idx_pipelines_user ON research_pipelines(user_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_started ON research_pipelines(started_at DESC);

-- Pipeline configuration
CREATE TABLE IF NOT EXISTS pipeline_config (
  id SERIAL PRIMARY KEY,
  pipeline_id VARCHAR(64) UNIQUE NOT NULL REFERENCES research_pipelines(pipeline_id) ON DELETE CASCADE,

  -- Auto-processing flags
  auto_source BOOLEAN NOT NULL DEFAULT false,
  auto_normalize BOOLEAN NOT NULL DEFAULT false,
  auto_generate_skus BOOLEAN NOT NULL DEFAULT false,

  -- Search parameters (stored for reference)
  search_params JSONB,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Stage enum check
ALTER TABLE research_pipelines
  ADD CONSTRAINT check_pipeline_stage
  CHECK (stage IN ('queued', 'researching', 'sourcing', 'normalizing', 'generating', 'complete', 'error'));

-- Progress range check
ALTER TABLE research_pipelines
  ADD CONSTRAINT check_pipeline_progress
  CHECK (progress >= 0 AND progress <= 100);

-- Add comment
COMMENT ON TABLE research_pipelines IS 'Tracks research pipeline execution from ZIK research through SKU generation';
COMMENT ON TABLE pipeline_config IS 'Configuration for research pipeline auto-processing behavior';

-- RLS policies
ALTER TABLE research_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_config ENABLE ROW LEVEL SECURITY;

-- Users can view their own pipelines
CREATE POLICY "Users can view own pipelines" ON research_pipelines
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can manage all
CREATE POLICY "Service role full access to pipelines" ON research_pipelines
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to pipeline config" ON pipeline_config
  FOR ALL USING (auth.role() = 'service_role');
