-- Migration: Add tenant_id column to all tables for multi-tenant isolation
-- tenant_id stores the Jira hostname (e.g., 'indeed.atlassian.net', 'uolinc.atlassian.net')

-- 1. Add tenant_id to metrics_history
ALTER TABLE metrics_history ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Set default tenant for existing data (Indeed)
UPDATE metrics_history SET tenant_id = 'indeed.atlassian.net' WHERE tenant_id IS NULL;

-- Create index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_metrics_history_tenant ON metrics_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_metrics_history_tenant_board ON metrics_history (tenant_id, board_id);

-- 2. Add tenant_id to boards_cache
ALTER TABLE boards_cache ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Set default tenant for existing data
UPDATE boards_cache SET tenant_id = 'indeed.atlassian.net' WHERE tenant_id IS NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_boards_cache_tenant ON boards_cache (tenant_id);

-- 3. Add tenant_id to product_data_cache (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'product_data_cache') THEN
    ALTER TABLE product_data_cache ADD COLUMN IF NOT EXISTS tenant_id TEXT;
    UPDATE product_data_cache SET tenant_id = 'indeed.atlassian.net' WHERE tenant_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_product_data_cache_tenant ON product_data_cache (tenant_id);
  END IF;
END $$;
