import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import DashboardController from './controllers/dashboardController.js';
import database from './services/database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../public');
  app.use(express.static(frontendPath));
}

// Initialize controller
const dashboardController = new DashboardController();

// API Routes
// Get default Jira credentials (for team-wide access)
app.get('/api/credentials', (req, res) => {
  const jiraUrl = process.env.JIRA_URL;
  const jiraEmail = process.env.JIRA_EMAIL;
  const jiraToken = process.env.JIRA_API_TOKEN;

  // Only return credentials if all are configured
  if (jiraUrl && jiraEmail && jiraToken) {
    res.json({
      success: true,
      credentials: {
        jiraUrl,
        email: jiraEmail,
        apiToken: jiraToken
      }
    });
  } else {
    res.status(404).json({
      success: false,
      message: 'No default credentials configured'
    });
  }
});

app.post('/api/jira/test-connection', (req, res) =>
  dashboardController.testConnection(req, res)
);

app.post('/api/jira/boards', (req, res) => 
  dashboardController.getBoards(req, res)
);

app.post('/api/jira/sprints', (req, res) =>
  dashboardController.getSprints(req, res)
);

app.post('/api/metrics/team', (req, res) =>
  dashboardController.getTeamMetrics(req, res)
);

app.post('/api/diagnostics', (req, res) =>
  dashboardController.diagnostics(req, res)
);

// Cached boards endpoint (tenant-scoped via query param)
app.get('/api/jira/boards/cached', async (req, res) => {
  try {
    const tenantId = req.query.tenant || null;
    const cachedBoards = await database.getCachedBoards(24 * 3600 * 1000, tenantId);
    if (cachedBoards && cachedBoards.length > 0) {
      res.json({ success: true, boards: cachedBoards, source: 'cache' });
    } else {
      res.json({ success: false, boards: [], message: 'No cached boards available' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Metrics History endpoints (all tenant-scoped via query param)
app.get('/api/history/boards', async (req, res) => {
  try {
    const tenantId = req.query.tenant || null;
    const boards = await database.getAllBoardsWithMetrics(tenantId);
    res.json({ success: true, boards });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/history/all-latest', async (req, res) => {
  try {
    const tenantId = req.query.tenant || null;
    const allMetrics = await database.getAllBoardsWithLatestMetrics(tenantId);
    res.json({ success: true, boards: allMetrics });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/history/board/:boardId', async (req, res) => {
  try {
    const { boardId } = req.params;
    const tenantId = req.query.tenant || null;
    const history = await database.getMetricsHistory(parseInt(boardId), 30, tenantId);
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/history/metrics/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.query.tenant || null;
    const metrics = await database.getMetricsById(parseInt(id), tenantId);
    if (metrics) {
      res.json({ success: true, data: metrics });
    } else {
      res.status(404).json({ success: false, message: 'Metrics not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/history/board/:boardId', async (req, res) => {
  try {
    const { boardId } = req.params;
    const tenantId = req.query.tenant || null;
    const removed = await database.deleteBoardMetrics(parseInt(boardId), tenantId);
    res.json({ success: true, removed });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Diagnostic: raw sprint report data from Jira GreenHopper API
app.post('/api/debug/sprint-report', async (req, res) => {
  try {
    const { jiraUrl, email, apiToken, boardId, sprintId } = req.body;
    const JiraService = (await import('./services/jiraService.js')).default;
    const jira = new JiraService(jiraUrl, email, apiToken);
    const reportData = await jira.getSprintReportData(boardId, sprintId);
    res.json({ success: true, data: reportData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Prune all boards to keep only the latest report per board
app.post('/api/admin/prune-all', async (req, res) => {
  try {
    const tenantId = req.body.tenant || null;
    const boards = await database.getAllBoardsWithMetrics(tenantId);
    let totalRemoved = 0;
    for (const board of boards) {
      const tenant = database._tenantWhere(tenantId, 2);
      const rows = await database.sql.query(
        `SELECT id FROM metrics_history WHERE board_id = $1${tenant.clause} ORDER BY calculated_at DESC`,
        [board.board_id, ...tenant.params]
      );
      if (rows.length > 1) {
        const idsToDelete = rows.slice(1).map(e => e.id);
        await database.sql`DELETE FROM metrics_history WHERE id = ANY(${idsToDelete})`;
        totalRemoved += idsToDelete.length;
        console.log(`✓ Pruned ${idsToDelete.length} old reports for board ${board.board_name}`);
      }
    }
    res.json({ success: true, message: `Pruned ${totalRemoved} old reports across ${boards.length} boards` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Only listen when running locally (not on Vercel serverless)
if (!process.env.VERCEL) {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on 0.0.0.0:${PORT}`);
    console.log(`📊 Scrum Maturity Dashboard API ready`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Allow up to 2 minutes for heavy cross-board queries
  server.timeout = 120000;
  server.keepAliveTimeout = 120000;
}

export default app;
