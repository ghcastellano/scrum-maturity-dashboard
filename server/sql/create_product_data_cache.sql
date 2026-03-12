-- Create the product_data_cache table for Product Management data persistence
-- Run this in Neon SQL Editor or via psql

CREATE TABLE IF NOT EXISTS product_data_cache (
  id BIGSERIAL PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  board_ids TEXT NOT NULL,
  data_type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_product_cache_key ON product_data_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_product_board_ids ON product_data_cache(board_ids);

-- Enable Row Level Security (optional, disable for server-to-server access)
-- ALTER TABLE product_data_cache ENABLE ROW LEVEL SECURITY;
