// One-time migration script: Copy all data from Supabase to Neon
// Run with: node server/scripts/migrate-supabase-to-neon.js

import { createClient } from '@supabase/supabase-js';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), 'server/.env') });

// Supabase source (hardcoded since removed from .env)
const SUPABASE_URL = 'https://aobryreauhebmpibynai.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvYnJ5cmVhdWhlYm1waWJ5bmFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMzIxNzEsImV4cCI6MjA4NTcwODE3MX0.0NXOyR2O0BFKBUcjFNmglZLp9yjrFf3JYoJ-hY3rUcw';

// Neon destination
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in server/.env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const sql = neon(DATABASE_URL);

async function migrateTable(tableName, selectColumns = '*') {
  console.log(`\n--- Migrating ${tableName} ---`);

  // Read all data from Supabase
  const { data, error } = await supabase
    .from(tableName)
    .select(selectColumns)
    .order('id', { ascending: true });

  if (error) {
    console.error(`  ✗ Failed to read from Supabase: ${error.message}`);
    return 0;
  }

  if (!data || data.length === 0) {
    console.log(`  (no data to migrate)`);
    return 0;
  }

  console.log(`  Found ${data.length} rows in Supabase`);

  let inserted = 0;

  for (const row of data) {
    try {
      if (tableName === 'metrics_history') {
        await sql`
          INSERT INTO metrics_history (board_id, board_name, sprint_count, metrics_data, maturity_level, tenant_id, calculated_at)
          VALUES (${row.board_id}, ${row.board_name}, ${row.sprint_count}, ${JSON.stringify(row.metrics_data)}, ${row.maturity_level}, ${row.tenant_id || null}, ${row.calculated_at})
        `;
      } else if (tableName === 'boards_cache') {
        await sql`
          INSERT INTO boards_cache (boards_data, tenant_id, updated_at)
          VALUES (${JSON.stringify(row.boards_data)}, ${row.tenant_id || null}, ${row.updated_at})
        `;
      } else if (tableName === 'product_data_cache') {
        await sql`
          INSERT INTO product_data_cache (cache_key, board_ids, data_type, data, tenant_id, updated_at, created_at)
          VALUES (${row.cache_key}, ${row.board_ids}, ${row.data_type}, ${JSON.stringify(row.data)}, ${row.tenant_id || null}, ${row.updated_at}, ${row.created_at})
          ON CONFLICT (cache_key) DO UPDATE SET
            data = EXCLUDED.data,
            tenant_id = EXCLUDED.tenant_id,
            updated_at = EXCLUDED.updated_at
        `;
      }
      inserted++;
    } catch (err) {
      console.error(`  ✗ Failed to insert row ${row.id}: ${err.message}`);
    }
  }

  console.log(`  ✓ Migrated ${inserted}/${data.length} rows`);
  return inserted;
}

async function main() {
  console.log('=== Supabase → Neon Migration ===\n');
  console.log(`Source: ${SUPABASE_URL}`);
  console.log(`Destination: Neon (${DATABASE_URL.split('@')[1]?.split('/')[0] || 'configured'})`);

  let totalMigrated = 0;

  // Migrate each table
  totalMigrated += await migrateTable('metrics_history');
  totalMigrated += await migrateTable('boards_cache');

  // product_data_cache may not have tenant_id in Supabase
  try {
    totalMigrated += await migrateTable('product_data_cache');
  } catch (err) {
    console.log('\n  Trying product_data_cache without tenant_id...');
    const { data } = await supabase
      .from('product_data_cache')
      .select('cache_key, board_ids, data_type, data, updated_at, created_at')
      .order('id', { ascending: true });

    if (data && data.length > 0) {
      let inserted = 0;
      for (const row of data) {
        try {
          await sql`
            INSERT INTO product_data_cache (cache_key, board_ids, data_type, data, updated_at, created_at)
            VALUES (${row.cache_key}, ${row.board_ids}, ${row.data_type}, ${JSON.stringify(row.data)}, ${row.updated_at}, ${row.created_at})
            ON CONFLICT (cache_key) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
          `;
          inserted++;
        } catch (e) {
          console.error(`  ✗ Failed: ${e.message}`);
        }
      }
      console.log(`  ✓ Migrated ${inserted}/${data.length} rows`);
      totalMigrated += inserted;
    }
  }

  console.log(`\n=== Migration complete! Total rows migrated: ${totalMigrated} ===`);
}

main().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
