// Migration script: Add tenant_id column to Supabase tables
// Run with: node server/scripts/migrate-tenant.js

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), 'server/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY in server/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumnExists(table, column) {
  const { error } = await supabase
    .from(table)
    .select(column)
    .limit(1);

  return !error;
}

async function migrate() {
  console.log('Checking if tenant_id columns exist...\n');

  // Check metrics_history
  const metricsHasTenant = await checkColumnExists('metrics_history', 'tenant_id');
  console.log(`metrics_history.tenant_id: ${metricsHasTenant ? 'EXISTS' : 'MISSING'}`);

  // Check boards_cache
  const boardsHasTenant = await checkColumnExists('boards_cache', 'tenant_id');
  console.log(`boards_cache.tenant_id: ${boardsHasTenant ? 'EXISTS' : 'MISSING'}`);

  if (metricsHasTenant && boardsHasTenant) {
    console.log('\nAll tenant_id columns already exist. No migration needed.');
    console.log('\nTo add the columns manually, run this SQL in the Supabase SQL Editor:');
    console.log('  https://supabase.com/dashboard/project/aobryreauhebmpibynai/sql/new\n');
    return;
  }

  console.log('\n⚠ tenant_id columns are MISSING from your database.');
  console.log('\nPlease run the following SQL in the Supabase SQL Editor:');
  console.log('  https://supabase.com/dashboard/project/aobryreauhebmpibynai/sql/new\n');
  console.log('--- SQL START ---');
  console.log(`
-- Add tenant_id to metrics_history
ALTER TABLE metrics_history ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE metrics_history SET tenant_id = 'indeed.atlassian.net' WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_metrics_history_tenant ON metrics_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_metrics_history_tenant_board ON metrics_history (tenant_id, board_id);

-- Add tenant_id to boards_cache
ALTER TABLE boards_cache ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE boards_cache SET tenant_id = 'indeed.atlassian.net' WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_boards_cache_tenant ON boards_cache (tenant_id);
  `);
  console.log('--- SQL END ---\n');

  // Try to work without migration (backward compatible)
  console.log('The app will work WITHOUT the migration (backward compatible mode),');
  console.log('but data from different companies will NOT be isolated until migration runs.');
}

migrate().catch(err => {
  console.error('Migration check failed:', err.message);
  process.exit(1);
});
