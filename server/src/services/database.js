import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

class DatabaseService {
  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('⚠ Supabase credentials not configured. Database will not work.');
      this.client = null;
      return;
    }

    this.client = createClient(supabaseUrl, supabaseKey);
    // In-memory locks to prevent concurrent read-modify-write on the same board
    this._updateLocks = new Map();
    // Whether tenant_id column exists (auto-detected on first query)
    this._tenantColumnReady = null;
    console.log('✓ Supabase database initialized');
  }

  // Check if tenant_id column exists in metrics_history
  async _checkTenantColumn() {
    if (this._tenantColumnReady !== null) return this._tenantColumnReady;
    if (!this.client) return false;

    try {
      const { error } = await this.client
        .from('metrics_history')
        .select('tenant_id')
        .limit(1);

      this._tenantColumnReady = !error;
      if (!this._tenantColumnReady) {
        console.warn('⚠ tenant_id column not found. Run migration: server/sql/add_tenant_id.sql');
      }
      return this._tenantColumnReady;
    } catch {
      this._tenantColumnReady = false;
      return false;
    }
  }

  // Apply tenant filter to a query (only if column exists)
  // Only includes NULL tenant_id records for the original tenant (indeed.atlassian.net)
  // to prevent data leaking across tenants
  async _applyTenantFilter(query, tenantId) {
    const hasTenant = await this._checkTenantColumn();
    if (hasTenant && tenantId) {
      // Old data has NULL tenant_id and belongs to Indeed (the original tenant).
      // Only include NULL records for Indeed; other tenants see only their own data.
      const originalTenant = 'indeed.atlassian.net';
      if (tenantId === originalTenant) {
        return query.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
      }
      return query.eq('tenant_id', tenantId);
    }
    return query;
  }

  // Acquire a per-board lock to serialize JSONB merges
  async _withLock(boardId, fn) {
    const key = String(boardId);
    while (this._updateLocks.get(key)) {
      await new Promise(r => setTimeout(r, 50));
    }
    this._updateLocks.set(key, true);
    try {
      return await fn();
    } finally {
      this._updateLocks.delete(key);
    }
  }

  // Save calculated metrics (tenant-scoped)
  async saveMetrics(boardId, boardName, sprintCount, metricsData, maturityLevel, tenantId = null) {
    if (!this.client) return null;

    try {
      const record = {
        board_id: boardId,
        board_name: boardName,
        sprint_count: sprintCount,
        metrics_data: metricsData,
        maturity_level: maturityLevel
      };
      const hasTenant = await this._checkTenantColumn();
      if (hasTenant && tenantId) record.tenant_id = tenantId;

      const { data, error } = await this.client
        .from('metrics_history')
        .insert(record)
        .select('id')
        .single();

      if (error) throw error;

      console.log(`✓ Metrics saved for board ${boardName} (ID: ${boardId}, tenant: ${tenantId || 'default'})`);

      await this._pruneOldEntries(boardId, 100, tenantId);

      return data.id;
    } catch (err) {
      console.error('Failed to save metrics:', err.message);
      return null;
    }
  }

  // Keep only the latest N entries per board (tenant-scoped)
  async _pruneOldEntries(boardId, keepCount, tenantId = null) {
    try {
      let query = this.client
        .from('metrics_history')
        .select('id')
        .eq('board_id', boardId)
        .order('calculated_at', { ascending: false });

      query = await this._applyTenantFilter(query, tenantId);

      const { data: entries } = await query;

      if (entries && entries.length > keepCount) {
        const idsToDelete = entries.slice(keepCount).map(e => e.id);
        await this.client
          .from('metrics_history')
          .delete()
          .in('id', idsToDelete);
      }
    } catch (err) {
      console.warn('Failed to prune old entries:', err.message);
    }
  }

  // Get latest metrics for a board (tenant-scoped)
  async getLatestMetrics(boardId, tenantId = null) {
    if (!this.client) return null;

    try {
      let query = this.client
        .from('metrics_history')
        .select('*')
        .eq('board_id', boardId)
        .order('calculated_at', { ascending: false })
        .limit(1);

      query = await this._applyTenantFilter(query, tenantId);

      const { data, error } = await query.single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (err) {
      console.warn('Failed to get latest metrics:', err.message);
      return null;
    }
  }

  // Get metrics history for a board (tenant-scoped)
  async getMetricsHistory(boardId, limit = 30, tenantId = null) {
    if (!this.client) return [];

    try {
      let query = this.client
        .from('metrics_history')
        .select('id, board_id, board_name, calculated_at, sprint_count, maturity_level')
        .eq('board_id', boardId)
        .order('calculated_at', { ascending: false })
        .limit(limit);

      query = await this._applyTenantFilter(query, tenantId);

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('Failed to get metrics history:', err.message);
      return [];
    }
  }

  // Get specific metrics by ID (tenant-scoped for safety)
  async getMetricsById(id, tenantId = null) {
    if (!this.client) return null;

    try {
      let query = this.client
        .from('metrics_history')
        .select('*')
        .eq('id', id);

      query = await this._applyTenantFilter(query, tenantId);

      const { data, error } = await query.single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (err) {
      console.warn('Failed to get metrics by id:', err.message);
      return null;
    }
  }

  // Get all boards that have metrics (tenant-scoped)
  async getAllBoardsWithMetrics(tenantId = null) {
    if (!this.client) return [];

    try {
      let query = this.client
        .from('metrics_history')
        .select('board_id, board_name, calculated_at')
        .order('calculated_at', { ascending: false });

      query = await this._applyTenantFilter(query, tenantId);

      const { data, error } = await query;

      if (error) throw error;

      const boardMap = new Map();
      for (const row of (data || [])) {
        if (!boardMap.has(row.board_id)) {
          boardMap.set(row.board_id, {
            board_id: row.board_id,
            board_name: row.board_name,
            last_calculated: row.calculated_at
          });
        }
      }

      return Array.from(boardMap.values());
    } catch (err) {
      console.warn('Failed to get all boards:', err.message);
      return [];
    }
  }

  // Get all boards with their latest metrics data included (tenant-scoped)
  async getAllBoardsWithLatestMetrics(tenantId = null) {
    if (!this.client) return [];

    try {
      let query = this.client
        .from('metrics_history')
        .select('*')
        .order('calculated_at', { ascending: false });

      query = await this._applyTenantFilter(query, tenantId);

      const { data, error } = await query;

      if (error) throw error;

      const boardMap = new Map();
      for (const row of (data || [])) {
        if (!boardMap.has(row.board_id)) {
          boardMap.set(row.board_id, row);
        }
      }

      return Array.from(boardMap.values());
    } catch (err) {
      console.warn('Failed to get all boards with metrics:', err.message);
      return [];
    }
  }

  // Save boards list (cache) - tenant-scoped
  async saveBoards(boards, tenantId = null) {
    if (!this.client) return;

    try {
      const hasTenant = await this._checkTenantColumn();

      // Delete old cache entries
      if (hasTenant && tenantId) {
        await this.client.from('boards_cache').delete().eq('tenant_id', tenantId);
      } else {
        await this.client.from('boards_cache').delete().neq('id', 0);
      }

      // Insert new cache
      const record = { boards_data: boards };
      if (hasTenant && tenantId) record.tenant_id = tenantId;

      const { error } = await this.client
        .from('boards_cache')
        .insert(record);

      if (error) throw error;
      console.log(`✓ Boards list saved to database (${boards.length} boards, tenant: ${tenantId || 'default'})`);
    } catch (err) {
      console.error('Failed to save boards:', err.message);
    }
  }

  // Get cached boards list (tenant-scoped)
  async getCachedBoards(maxAgeMs = 3600 * 1000, tenantId = null) {
    if (!this.client) return null;

    try {
      let query = this.client
        .from('boards_cache')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1);

      const hasTenant = await this._checkTenantColumn();
      if (hasTenant && tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query.single();

      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;

      const updatedAt = new Date(data.updated_at).getTime();
      if (Date.now() - updatedAt > maxAgeMs) {
        console.log(`✗ Boards cache expired (tenant: ${tenantId || 'default'})`);
        return null;
      }

      console.log(`✅ Boards loaded from Supabase cache (tenant: ${tenantId || 'default'})`);
      return data.boards_data;
    } catch (err) {
      console.warn('Failed to get cached boards:', err.message);
      return null;
    }
  }

  // Generic locked merge
  async _mergeIntoLatest(boardId, dataKey, data, retries = 3, tenantId = null) {
    if (!this.client) return false;

    return this._withLock(boardId, async () => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const latest = await this.getLatestMetrics(boardId, tenantId);
          if (!latest) {
            if (attempt < retries) {
              console.log(`⏳ No record for board ${boardId} yet, retrying in 2s... (${attempt}/${retries})`);
              await new Promise(r => setTimeout(r, 2000));
              continue;
            }
            console.warn(`✗ No record found for board ${boardId} after ${retries} attempts`);
            return false;
          }

          const updatedData = { ...latest.metrics_data, [dataKey]: data };
          const { error } = await this.client
            .from('metrics_history')
            .update({ metrics_data: updatedData })
            .eq('id', latest.id);

          if (error) throw error;
          console.log(`✓ ${dataKey} saved for board ${boardId}`);
          return true;
        } catch (err) {
          if (attempt < retries) {
            console.warn(`Retry ${attempt}/${retries} for ${dataKey} on board ${boardId}: ${err.message}`);
            await new Promise(r => setTimeout(r, 1000));
          } else {
            console.warn(`Failed to save ${dataKey} for board ${boardId}:`, err.message);
            return false;
          }
        }
      }
      return false;
    });
  }

  async updateLatestWithFlow(boardId, flowData, tenantId = null) {
    return this._mergeIntoLatest(boardId, 'flowMetrics', flowData, 3, tenantId);
  }

  async updateLatestWithReleases(boardId, releasesData, tenantId = null) {
    return this._mergeIntoLatest(boardId, 'releasesData', releasesData, 3, tenantId);
  }

  async updateLatestWithCapacity(boardId, capacityData, tenantId = null) {
    return this._mergeIntoLatest(boardId, 'capacityData', capacityData, 3, tenantId);
  }

  // Delete all metrics for a board (tenant-scoped)
  async deleteBoardMetrics(boardId, tenantId = null) {
    if (!this.client) return 0;

    try {
      let query = this.client
        .from('metrics_history')
        .delete()
        .eq('board_id', boardId);

      query = await this._applyTenantFilter(query, tenantId);

      const { data, error } = await query.select('id');

      if (error) throw error;

      const removed = data?.length || 0;
      console.log(`✓ Deleted ${removed} metrics entries for board ${boardId}`);
      return removed;
    } catch (err) {
      console.error('Failed to delete board metrics:', err.message);
      return 0;
    }
  }

  // ==============================
  // PRODUCT MANAGEMENT DATA
  // ==============================

  async saveProductData(boardIds, dataType, data, tenantId = null) {
    if (!this.client) return false;

    const boardKey = Array.isArray(boardIds) ? boardIds.sort().join('-') : String(boardIds);
    const tenantPrefix = tenantId ? `${tenantId}_` : '';
    const storageKey = `${tenantPrefix}product_${dataType}_${boardKey}`;

    try {
      const record = {
        cache_key: storageKey,
        board_ids: boardKey,
        data_type: dataType,
        data: data,
        updated_at: new Date().toISOString()
      };
      const hasTenant = await this._checkTenantColumn();
      if (hasTenant && tenantId) record.tenant_id = tenantId;

      const { error } = await this.client
        .from('product_data_cache')
        .upsert(record, { onConflict: 'cache_key' });

      if (error) throw error;
      console.log(`✓ Product ${dataType} saved for boards [${boardKey}]`);
      return true;
    } catch (err) {
      console.warn(`Failed to save product ${dataType}:`, err.message);
      return false;
    }
  }

  async getProductData(boardIds, dataType, maxAgeMs = 30 * 60 * 1000, tenantId = null) {
    if (!this.client) return null;

    const boardKey = Array.isArray(boardIds) ? boardIds.sort().join('-') : String(boardIds);
    const tenantPrefix = tenantId ? `${tenantId}_` : '';
    const storageKey = `${tenantPrefix}product_${dataType}_${boardKey}`;

    try {
      const { data, error } = await this.client
        .from('product_data_cache')
        .select('*')
        .eq('cache_key', storageKey)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;

      const updatedAt = new Date(data.updated_at).getTime();
      const age = Date.now() - updatedAt;
      if (maxAgeMs > 0 && age > maxAgeMs) {
        return { data: data.data, stale: true, age: Math.round(age / 60000) };
      }

      return { data: data.data, stale: false, age: Math.round(age / 60000) };
    } catch (err) {
      console.warn(`Failed to get product ${dataType}:`, err.message);
      return null;
    }
  }

  async getAllProductData(boardIds, tenantId = null) {
    if (!this.client) return null;

    const boardKey = Array.isArray(boardIds) ? boardIds.sort().join('-') : String(boardIds);

    try {
      let query = this.client
        .from('product_data_cache')
        .select('*')
        .eq('board_ids', boardKey);

      query = await this._applyTenantFilter(query, tenantId);

      const { data, error } = await query;

      if (error) throw error;
      if (!data || data.length === 0) return null;

      const result = {};
      for (const row of data) {
        result[row.data_type] = {
          data: row.data,
          updatedAt: row.updated_at,
          age: Math.round((Date.now() - new Date(row.updated_at).getTime()) / 60000)
        };
      }
      return result;
    } catch (err) {
      console.warn('Failed to get all product data:', err.message);
      return null;
    }
  }

  async cleanOldMetrics() {
    if (!this.client) return 0;

    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await this.client
        .from('metrics_history')
        .delete()
        .lt('calculated_at', cutoff)
        .select('id');

      if (error) throw error;

      const removed = data?.length || 0;
      if (removed > 0) {
        console.log(`✓ Cleaned ${removed} old metrics entries`);
      }
      return removed;
    } catch (err) {
      console.warn('Failed to clean old metrics:', err.message);
      return 0;
    }
  }
}

export default new DatabaseService();
