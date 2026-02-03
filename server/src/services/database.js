import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseService {
  constructor() {
    this.dataDir = path.join(__dirname, '../../data');
    this.dbPath = path.join(this.dataDir, 'metrics.json');
    this.data = this.load();
    console.log('✓ Database initialized:', this.dbPath);
  }

  load() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn('Failed to load database, starting fresh:', err.message);
    }
    return { metrics: [], boards: null, nextId: 1 };
  }

  save() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error('Failed to save database:', err.message);
    }
  }

  // Save calculated metrics
  saveMetrics(boardId, boardName, sprintCount, metricsData, maturityLevel) {
    const entry = {
      id: this.data.nextId++,
      board_id: boardId,
      board_name: boardName,
      calculated_at: new Date().toISOString(),
      sprint_count: sprintCount,
      metrics_data: metricsData,
      maturity_level: maturityLevel
    };

    this.data.metrics.push(entry);

    // Keep only last 100 entries per board
    const boardEntries = this.data.metrics.filter(m => m.board_id === boardId);
    if (boardEntries.length > 100) {
      const toRemove = boardEntries.slice(0, boardEntries.length - 100);
      this.data.metrics = this.data.metrics.filter(m => !toRemove.includes(m));
    }

    this.save();
    console.log(`✓ Metrics saved for board ${boardName} (ID: ${boardId})`);
    return entry.id;
  }

  // Get latest metrics for a board
  getLatestMetrics(boardId) {
    const entries = this.data.metrics
      .filter(m => m.board_id === boardId)
      .sort((a, b) => new Date(b.calculated_at) - new Date(a.calculated_at));

    return entries[0] || null;
  }

  // Get metrics history for a board
  getMetricsHistory(boardId, limit = 30) {
    return this.data.metrics
      .filter(m => m.board_id === boardId)
      .sort((a, b) => new Date(b.calculated_at) - new Date(a.calculated_at))
      .slice(0, limit)
      .map(({ metrics_data, ...rest }) => rest); // Exclude large data from list
  }

  // Get specific metrics by ID
  getMetricsById(id) {
    return this.data.metrics.find(m => m.id === id) || null;
  }

  // Get all boards with metrics
  getAllBoardsWithMetrics() {
    const boardMap = new Map();
    for (const m of this.data.metrics) {
      const existing = boardMap.get(m.board_id);
      if (!existing || new Date(m.calculated_at) > new Date(existing.last_calculated)) {
        boardMap.set(m.board_id, {
          board_id: m.board_id,
          board_name: m.board_name,
          last_calculated: m.calculated_at
        });
      }
    }
    return Array.from(boardMap.values())
      .sort((a, b) => new Date(b.last_calculated) - new Date(a.last_calculated));
  }

  // Get all boards with their latest metrics data included
  getAllBoardsWithLatestMetrics() {
    const boardMap = new Map();
    for (const m of this.data.metrics) {
      const existing = boardMap.get(m.board_id);
      if (!existing || new Date(m.calculated_at) > new Date(existing.calculated_at)) {
        boardMap.set(m.board_id, m);
      }
    }
    return Array.from(boardMap.values())
      .sort((a, b) => new Date(b.calculated_at) - new Date(a.calculated_at));
  }

  // Save boards list
  saveBoards(boards) {
    this.data.boards = {
      list: boards,
      updated_at: new Date().toISOString()
    };
    this.save();
    console.log(`✓ Boards list saved to database (${boards.length} boards)`);
  }

  // Get cached boards list (returns null if older than maxAge in ms)
  getCachedBoards(maxAgeMs = 3600 * 1000) {
    if (!this.data.boards) return null;

    const updatedAt = new Date(this.data.boards.updated_at).getTime();
    if (Date.now() - updatedAt > maxAgeMs) {
      console.log('✗ Boards cache expired in database');
      return null;
    }

    console.log('✅ Boards loaded from database cache');
    return this.data.boards.list;
  }

  // Clean old metrics (keep last 90 days)
  cleanOldMetrics() {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const before = this.data.metrics.length;
    this.data.metrics = this.data.metrics.filter(
      m => new Date(m.calculated_at) >= cutoff
    );
    const removed = before - this.data.metrics.length;
    if (removed > 0) {
      this.save();
      console.log(`✓ Cleaned ${removed} old metrics entries`);
    }
    return removed;
  }
}

export default new DatabaseService();
