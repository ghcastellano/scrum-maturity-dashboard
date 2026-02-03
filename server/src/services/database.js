import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseService {
  constructor() {
    // Create database in server directory
    const dbPath = path.join(__dirname, '../../data/metrics.db');
    this.db = new Database(dbPath);
    this.initTables();
    console.log('✓ Database initialized:', dbPath);
  }

  initTables() {
    // Create metrics history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metrics_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_id INTEGER NOT NULL,
        board_name TEXT NOT NULL,
        calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sprint_count INTEGER NOT NULL,
        metrics_data TEXT NOT NULL,
        maturity_level INTEGER NOT NULL,
        UNIQUE(board_id, calculated_at)
      );

      CREATE INDEX IF NOT EXISTS idx_board_date
      ON metrics_history(board_id, calculated_at DESC);
    `);
  }

  // Save calculated metrics
  saveMetrics(boardId, boardName, sprintCount, metricsData, maturityLevel) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO metrics_history
      (board_id, board_name, sprint_count, metrics_data, maturity_level)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      boardId,
      boardName,
      sprintCount,
      JSON.stringify(metricsData),
      maturityLevel
    );

    console.log(`✓ Metrics saved for board ${boardName} (ID: ${boardId})`);
    return result.lastInsertRowid;
  }

  // Get latest metrics for a board
  getLatestMetrics(boardId) {
    const stmt = this.db.prepare(`
      SELECT * FROM metrics_history
      WHERE board_id = ?
      ORDER BY calculated_at DESC
      LIMIT 1
    `);

    const row = stmt.get(boardId);
    if (row) {
      return {
        ...row,
        metrics_data: JSON.parse(row.metrics_data)
      };
    }
    return null;
  }

  // Get metrics history for a board
  getMetricsHistory(boardId, limit = 30) {
    const stmt = this.db.prepare(`
      SELECT
        id,
        board_id,
        board_name,
        calculated_at,
        sprint_count,
        maturity_level
      FROM metrics_history
      WHERE board_id = ?
      ORDER BY calculated_at DESC
      LIMIT ?
    `);

    return stmt.all(boardId, limit);
  }

  // Get specific metrics by ID
  getMetricsById(id) {
    const stmt = this.db.prepare(`
      SELECT * FROM metrics_history
      WHERE id = ?
    `);

    const row = stmt.get(id);
    if (row) {
      return {
        ...row,
        metrics_data: JSON.parse(row.metrics_data)
      };
    }
    return null;
  }

  // Get all boards with metrics
  getAllBoardsWithMetrics() {
    const stmt = this.db.prepare(`
      SELECT DISTINCT
        board_id,
        board_name,
        MAX(calculated_at) as last_calculated
      FROM metrics_history
      GROUP BY board_id, board_name
      ORDER BY last_calculated DESC
    `);

    return stmt.all();
  }

  // Clean old metrics (keep last 90 days)
  cleanOldMetrics() {
    const stmt = this.db.prepare(`
      DELETE FROM metrics_history
      WHERE calculated_at < datetime('now', '-90 days')
    `);

    const result = stmt.run();
    if (result.changes > 0) {
      console.log(`✓ Cleaned ${result.changes} old metrics entries`);
    }
    return result.changes;
  }
}

export default new DatabaseService();
