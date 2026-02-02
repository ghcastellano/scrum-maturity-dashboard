import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import DashboardController from './controllers/dashboardController.js';

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
  const frontendPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(frontendPath));
}

// Initialize controller
const dashboardController = new DashboardController();

// API Routes
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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
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
