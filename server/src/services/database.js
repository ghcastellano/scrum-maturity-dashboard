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
    console.log('✓ Supabase database initialized');
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

  // Save calculated metrics
  async saveMetrics(boardId, boardName, sprintCount, metricsData, maturityLevel) {
    if (!this.client) return null;

    try {
      const { data, error } = await this.client
        .from('metrics_history')
        .insert({
          board_id: boardId,
          board_name: boardName,
          sprint_count: sprintCount,
          metrics_data: metricsData,
          maturity_level: maturityLevel
        })
        .select('id')
        .single();

      if (error) throw error;

      console.log(`✓ Metrics saved for board ${boardName} (ID: ${boardId})`);

      // Keep only last 100 entries per board
      await this._pruneOldEntries(boardId, 100);

      return data.id;
    } catch (err) {
      console.error('Failed to save metrics:', err.message);
      return null;
    }
  }

  // Keep only the latest N entries per board
  async _pruneOldEntries(boardId, keepCount) {
    try {
      const { data: entries } = await this.client
        .from('metrics_history')
        .select('id')
        .eq('board_id', boardId)
        .order('calculated_at', { ascending: false });

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

  // Get latest metrics for a board
  async getLatestMetrics(boardId) {
    if (!this.client) return null;

    try {
      const { data, error } = await this.client
        .from('metrics_history')
        .select('*')
        .eq('board_id', boardId)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (err) {
      console.warn('Failed to get latest metrics:', err.message);
      return null;
    }
  }

  // Get metrics history for a board (without metrics_data to reduce payload)
  async getMetricsHistory(boardId, limit = 30) {
    if (!this.client) return [];

    try {
      const { data, error } = await this.client
        .from('metrics_history')
        .select('id, board_id, board_name, calculated_at, sprint_count, maturity_level')
        .eq('board_id', boardId)
        .order('calculated_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('Failed to get metrics history:', err.message);
      return [];
    }
  }

  // Get specific metrics by ID
  async getMetricsById(id) {
    if (!this.client) return null;

    try {
      const { data, error } = await this.client
        .from('metrics_history')
        .select('*')
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (err) {
      console.warn('Failed to get metrics by id:', err.message);
      return null;
    }
  }

  // Get all boards that have metrics (without metrics_data)
  async getAllBoardsWithMetrics() {
    if (!this.client) return [];

    try {
      // Get distinct boards with their latest calculated_at
      const { data, error } = await this.client
        .from('metrics_history')
        .select('board_id, board_name, calculated_at')
        .order('calculated_at', { ascending: false });

      if (error) throw error;

      // Deduplicate: keep only the latest entry per board
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

  // Get all boards with their latest metrics data included
  async getAllBoardsWithLatestMetrics() {
    if (!this.client) return [];

    try {
      // Get all metrics ordered by date desc
      const { data, error } = await this.client
        .from('metrics_history')
        .select('*')
        .order('calculated_at', { ascending: false });

      if (error) throw error;

      // Deduplicate: keep only the latest entry per board
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

  // Save boards list (cache)
  async saveBoards(boards) {
    if (!this.client) return;

    try {
      // Delete old cache entries
      await this.client.from('boards_cache').delete().neq('id', 0);

      // Insert new cache
      const { error } = await this.client
        .from('boards_cache')
        .insert({ boards_data: boards });

      if (error) throw error;
      console.log(`✓ Boards list saved to database (${boards.length} boards)`);
    } catch (err) {
      console.error('Failed to save boards:', err.message);
    }
  }

  // Get cached boards list (returns null if older than maxAge)
  async getCachedBoards(maxAgeMs = 3600 * 1000) {
    if (!this.client) return null;

    try {
      const { data, error } = await this.client
        .from('boards_cache')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;

      const updatedAt = new Date(data.updated_at).getTime();
      if (Date.now() - updatedAt > maxAgeMs) {
        console.log('✗ Boards cache expired');
        return null;
      }

      console.log('✅ Boards loaded from Supabase cache');
      return data.boards_data;
    } catch (err) {
      console.warn('Failed to get cached boards:', err.message);
      return null;
    }
  }

  // Generic locked merge: read latest record, add/overwrite a key, write back
  // The lock ensures concurrent calls for the same board don't overwrite each other
  async _mergeIntoLatest(boardId, dataKey, data, retries = 3) {
    if (!this.client) return false;

    return this._withLock(boardId, async () => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const latest = await this.getLatestMetrics(boardId);
          if (!latest) {
            if (attempt < retries) {
              // Record might not exist yet (team metrics still saving) — wait and retry
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

  // Update latest metrics record with flow data
  async updateLatestWithFlow(boardId, flowData) {
    return this._mergeIntoLatest(boardId, 'flowMetrics', flowData);
  }

  // Update latest metrics record with releases data
  async updateLatestWithReleases(boardId, releasesData) {
    return this._mergeIntoLatest(boardId, 'releasesData', releasesData);
  }

  // Update latest metrics record with capacity data
  async updateLatestWithCapacity(boardId, capacityData) {
    return this._mergeIntoLatest(boardId, 'capacityData', capacityData);
  }

  // Delete all metrics for a board
  async deleteBoardMetrics(boardId) {
    if (!this.client) return 0;

    try {
      const { data, error } = await this.client
        .from('metrics_history')
        .delete()
        .eq('board_id', boardId)
        .select('id');

      if (error) throw error;

      const removed = data?.length || 0;
      console.log(`✓ Deleted ${removed} metrics entries for board ${boardId}`);
      return removed;
    } catch (err) {
      console.error('Failed to delete board metrics:', err.message);
      return 0;
    }
  }

  // Clean old metrics (keep last 90 days)
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
