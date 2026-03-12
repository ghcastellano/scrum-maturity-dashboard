// Migration script: Verify tenant_id columns exist in Neon tables
// Run with: node server/scripts/migrate-tenant.js

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), 'server/.env') });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Missing DATABASE_URL in server/.env');
  process.exit(1);
}

const sql = neon(databaseUrl);

async function checkColumnExists(table, column) {
  try {
    const rows = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = ${table} AND column_name = ${column}
    `;
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function migrate() {
  console.log('Checking if tenant_id columns exist...\n');

  const tables = ['metrics_history', 'boards_cache', 'product_data_cache'];
  let allExist = true;

  for (const table of tables) {
    const hasTenant = await checkColumnExists(table, 'tenant_id');
    console.log(`${table}.tenant_id: ${hasTenant ? 'EXISTS' : 'MISSING'}`);
    if (!hasTenant) allExist = false;
  }

  if (allExist) {
    console.log('\nAll tenant_id columns already exist. No migration needed.');
    return;
  }

  console.log('\n⚠ Some tenant_id columns are MISSING. Adding them now...\n');

  for (const table of tables) {
    const hasTenant = await checkColumnExists(table, 'tenant_id');
    if (!hasTenant) {
      await sql(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id TEXT`);
      console.log(`✓ Added tenant_id to ${table}`);

      // Tag existing records as Indeed (original tenant)
      await sql(`UPDATE ${table} SET tenant_id = 'indeed.atlassian.net' WHERE tenant_id IS NULL`);
      console.log(`  → Tagged existing rows in ${table} as indeed.atlassian.net`);
    }
  }

  // Ensure indexes exist
  await sql`CREATE INDEX IF NOT EXISTS idx_metrics_history_tenant ON metrics_history (tenant_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_metrics_history_tenant_board ON metrics_history (tenant_id, board_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_boards_cache_tenant ON boards_cache (tenant_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_product_data_cache_tenant ON product_data_cache (tenant_id)`;
  console.log('\n✓ All indexes verified');

  console.log('\n✅ Migration complete!');
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
