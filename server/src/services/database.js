import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

class DatabaseService {
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      console.warn('⚠ DATABASE_URL not configured. Database will not work.');
      this.sql = null;
      return;
    }

    this.sql = neon(databaseUrl);
    // In-memory locks to prevent concurrent read-modify-write on the same board
    this._updateLocks = new Map();
    console.log('✓ Database initialized');
  }

  _tenantWhere(tenantId, startIdx = 1) {
    if (!tenantId) return { clause: '', params: [] };
    const originalTenant = 'indeed.atlassian.net';
    if (tenantId === originalTenant) {
      return {
        clause: ` AND (tenant_id = $${startIdx} OR tenant_id IS NULL)`,
        params: [tenantId]
      };
    }
    return {
      clause: ` AND tenant_id = $${startIdx}`,
      params: [tenantId]
    };
  }

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

  async saveMetrics(boardId, boardName, sprintCount, metricsData, maturityLevel, tenantId = null) {
    if (!this.sql) return null;

    try {
      const rows = await this.sql`
        INSERT INTO metrics_history (board_id, board_name, sprint_count, metrics_data, maturity_level, tenant_id)
        VALUES (${boardId}, ${boardName}, ${sprintCount}, ${JSON.stringify(metricsData)}, ${maturityLevel}, ${tenantId})
        RETURNING id
      `;

      console.log(`✓ Metrics saved for board ${boardName} (ID: ${boardId}, tenant: ${tenantId || 'default'})`);
      await this._pruneOldEntries(boardId, 100, tenantId);
      return rows[0]?.id || null;
    } catch (err) {
      console.error('Failed to save metrics:', err.message);
      return null;
    }
  }

  async _pruneOldEntries(boardId, keepCount, tenantId = null) {
    try {
      const tenant = this._tenantWhere(tenantId, 2);
      const rows = await this.sql.query(
        `SELECT id FROM metrics_history WHERE board_id = $1${tenant.clause} ORDER BY calculated_at DESC`,
        [boardId, ...tenant.params]
      );

      if (rows.length > keepCount) {
        const idsToDelete = rows.slice(keepCount).map(e => e.id);
        await this.sql`DELETE FROM metrics_history WHERE id = ANY(${idsToDelete})`;
      }
    } catch (err) {
      console.warn('Failed to prune old entries:', err.message);
    }
  }

  async getLatestMetrics(boardId, tenantId = null) {
    if (!this.sql) return null;

    try {
      const tenant = this._tenantWhere(tenantId, 2);
      const rows = await this.sql.query(
        `SELECT * FROM metrics_history WHERE board_id = $1${tenant.clause} ORDER BY calculated_at DESC LIMIT 1`,
        [boardId, ...tenant.params]
      );
      return rows[0] || null;
    } catch (err) {
      console.warn('Failed to get latest metrics:', err.message);
      return null;
    }
  }

  async getMetricsHistory(boardId, limit = 30, tenantId = null) {
    if (!this.sql) return [];

    try {
      const tenant = this._tenantWhere(tenantId, 3);
      const rows = await this.sql.query(
        `SELECT id, board_id, board_name, calculated_at, sprint_count, maturity_level
         FROM metrics_history WHERE board_id = $1${tenant.clause}
         ORDER BY calculated_at DESC LIMIT $2`,
        [boardId, limit, ...tenant.params]
      );
      return rows;
    } catch (err) {
      console.warn('Failed to get metrics history:', err.message);
      return [];
    }
  }

  async getMetricsById(id, tenantId = null) {
    if (!this.sql) return null;

    try {
      const tenant = this._tenantWhere(tenantId, 2);
      const rows = await this.sql.query(
        `SELECT * FROM metrics_history WHERE id = $1${tenant.clause} LIMIT 1`,
        [id, ...tenant.params]
      );
      return rows[0] || null;
    } catch (err) {
      console.warn('Failed to get metrics by id:', err.message);
      return null;
    }
  }

  async getAllBoardsWithMetrics(tenantId = null) {
    if (!this.sql) return [];

    try {
      const tenant = this._tenantWhere(tenantId, 1);
      const rows = await this.sql.query(
        `SELECT board_id, board_name, calculated_at FROM metrics_history
         WHERE 1=1${tenant.clause} ORDER BY calculated_at DESC`,
        [...tenant.params]
      );

      const boardMap = new Map();
      for (const row of rows) {
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

  async getAllBoardsWithLatestMetrics(tenantId = null) {
    if (!this.sql) return [];

    try {
      const tenant = this._tenantWhere(tenantId, 1);
      const rows = await this.sql.query(
        `SELECT * FROM metrics_history WHERE 1=1${tenant.clause} ORDER BY calculated_at DESC`,
        [...tenant.params]
      );

      const boardMap = new Map();
      for (const row of rows) {
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

  async saveBoards(boards, tenantId = null) {
    if (!this.sql) return;

    try {
      if (tenantId) {
        await this.sql`DELETE FROM boards_cache WHERE tenant_id = ${tenantId}`;
      } else {
        await this.sql`DELETE FROM boards_cache WHERE tenant_id IS NULL`;
      }

      await this.sql`
        INSERT INTO boards_cache (boards_data, tenant_id)
        VALUES (${JSON.stringify(boards)}, ${tenantId})
      `;
      console.log(`✓ Boards list saved to database (${boards.length} boards, tenant: ${tenantId || 'default'})`);
    } catch (err) {
      console.error('Failed to save boards:', err.message);
    }
  }

  async getCachedBoards(maxAgeMs = 3600 * 1000, tenantId = null) {
    if (!this.sql) return null;

    try {
      const tenant = this._tenantWhere(tenantId, 1);
      const rows = await this.sql.query(
        `SELECT * FROM boards_cache WHERE 1=1${tenant.clause} ORDER BY updated_at DESC LIMIT 1`,
        [...tenant.params]
      );

      if (rows.length === 0) return null;

      const record = rows[0];
      const updatedAt = new Date(record.updated_at).getTime();
      if (Date.now() - updatedAt > maxAgeMs) {
        console.log(`✗ Boards cache expired (tenant: ${tenantId || 'default'})`);
        return null;
      }

      console.log(`✅ Boards loaded from database cache (tenant: ${tenantId || 'default'})`);
      return record.boards_data;
    } catch (err) {
      console.warn('Failed to get cached boards:', err.message);
      return null;
    }
  }

  async _mergeIntoLatest(boardId, dataKey, data, retries = 3, tenantId = null) {
    if (!this.sql) return false;

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
          await this.sql`
            UPDATE metrics_history SET metrics_data = ${JSON.stringify(updatedData)} WHERE id = ${latest.id}
          `;
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

  async deleteBoardMetrics(boardId, tenantId = null) {
    if (!this.sql) return 0;

    try {
      const tenant = this._tenantWhere(tenantId, 2);
      const rows = await this.sql.query(
        `DELETE FROM metrics_history WHERE board_id = $1${tenant.clause} RETURNING id`,
        [boardId, ...tenant.params]
      );

      const removed = rows.length;
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
    if (!this.sql) return false;

    const boardKey = Array.isArray(boardIds) ? boardIds.sort().join('-') : String(boardIds);
    const tenantPrefix = tenantId ? `${tenantId}_` : '';
    const storageKey = `${tenantPrefix}product_${dataType}_${boardKey}`;

    try {
      await this.sql`
        INSERT INTO product_data_cache (cache_key, board_ids, data_type, data, tenant_id, updated_at)
        VALUES (${storageKey}, ${boardKey}, ${dataType}, ${JSON.stringify(data)}, ${tenantId}, now())
        ON CONFLICT (cache_key) DO UPDATE SET
          data = EXCLUDED.data,
          tenant_id = EXCLUDED.tenant_id,
          updated_at = now()
      `;
      console.log(`✓ Product ${dataType} saved for boards [${boardKey}]`);
      return true;
    } catch (err) {
      console.warn(`Failed to save product ${dataType}:`, err.message);
      return false;
    }
  }

  async getProductData(boardIds, dataType, maxAgeMs = 30 * 60 * 1000, tenantId = null) {
    if (!this.sql) return null;

    const boardKey = Array.isArray(boardIds) ? boardIds.sort().join('-') : String(boardIds);
    const tenantPrefix = tenantId ? `${tenantId}_` : '';
    const storageKey = `${tenantPrefix}product_${dataType}_${boardKey}`;

    try {
      const rows = await this.sql`
        SELECT * FROM product_data_cache WHERE cache_key = ${storageKey} LIMIT 1
      `;
      if (rows.length === 0) return null;

      const record = rows[0];
      const updatedAt = new Date(record.updated_at).getTime();
      const age = Date.now() - updatedAt;
      if (maxAgeMs > 0 && age > maxAgeMs) {
        return { data: record.data, stale: true, age: Math.round(age / 60000) };
      }
      return { data: record.data, stale: false, age: Math.round(age / 60000) };
    } catch (err) {
      console.warn(`Failed to get product ${dataType}:`, err.message);
      return null;
    }
  }

  async getAllProductData(boardIds, tenantId = null) {
    if (!this.sql) return null;

    const boardKey = Array.isArray(boardIds) ? boardIds.sort().join('-') : String(boardIds);

    try {
      const tenant = this._tenantWhere(tenantId, 2);
      const rows = await this.sql.query(
        `SELECT * FROM product_data_cache WHERE board_ids = $1${tenant.clause}`,
        [boardKey, ...tenant.params]
      );

      if (rows.length === 0) return null;

      const result = {};
      for (const row of rows) {
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
    if (!this.sql) return 0;

    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const rows = await this.sql`
        DELETE FROM metrics_history WHERE calculated_at < ${cutoff} RETURNING id
      `;

      const removed = rows.length;
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
