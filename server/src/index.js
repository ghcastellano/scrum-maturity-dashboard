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
app.use(express.json());

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

app.post('/api/metrics/team', (req, res) => 
  dashboardController.getTeamMetrics(req, res)
);

app.post('/api/metrics/flow', (req, res) =>
  dashboardController.getFlowMetrics(req, res)
);

app.post('/api/diagnostics', (req, res) =>
  dashboardController.diagnostics(req, res)
);

// Metrics History endpoints
app.get('/api/history/boards', (req, res) => {
  try {
    const boards = database.getAllBoardsWithMetrics();
    res.json({ success: true, boards });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/history/board/:boardId', (req, res) => {
  try {
    const { boardId } = req.params;
    const history = database.getMetricsHistory(parseInt(boardId), 30);
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/history/metrics/:id', (req, res) => {
  try {
    const { id } = req.params;
    const metrics = database.getMetricsById(parseInt(id));
    if (metrics) {
      res.json({ success: true, data: metrics });
    } else {
      res.status(404).json({ success: false, message: 'Metrics not found' });
    }
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

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Scrum Maturity Dashboard API ready`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
