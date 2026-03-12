-- Neon PostgreSQL Schema
-- Run this once to create all tables for Scrum Maturity + Product Management dashboards

-- 1. Metrics History (scrum metrics per board)
CREATE TABLE IF NOT EXISTS metrics_history (
  id BIGSERIAL PRIMARY KEY,
  board_id INTEGER NOT NULL,
  board_name TEXT,
  sprint_count INTEGER,
  metrics_data JSONB NOT NULL DEFAULT '{}',
  maturity_level TEXT,
  tenant_id TEXT,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metrics_history_tenant ON metrics_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_metrics_history_tenant_board ON metrics_history (tenant_id, board_id);
CREATE INDEX IF NOT EXISTS idx_metrics_history_calculated ON metrics_history (calculated_at DESC);

-- 2. Boards Cache (cached list of Jira boards per tenant)
CREATE TABLE IF NOT EXISTS boards_cache (
  id BIGSERIAL PRIMARY KEY,
  boards_data JSONB NOT NULL DEFAULT '[]',
  tenant_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_boards_cache_tenant ON boards_cache (tenant_id);

-- 3. Product Data Cache (epic intelligence, prioritization, portfolio data)
CREATE TABLE IF NOT EXISTS product_data_cache (
  id BIGSERIAL PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  board_ids TEXT NOT NULL,
  data_type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  tenant_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_cache_key ON product_data_cache (cache_key);
CREATE INDEX IF NOT EXISTS idx_product_board_ids ON product_data_cache (board_ids);
CREATE INDEX IF NOT EXISTS idx_product_data_cache_tenant ON product_data_cache (tenant_id);
