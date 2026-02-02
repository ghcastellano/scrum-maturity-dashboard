import JiraService from '../services/jiraService.js';
import MetricsService from '../services/metricsService.js';

class DashboardController {
  constructor() {
    this.metricsService = new MetricsService();
  }

  // Initialize Jira connection
  async testConnection(req, res) {
    try {
      const { jiraUrl, email, apiToken } = req.body;
      
      const jiraService = new JiraService(jiraUrl, email, apiToken);
      const boards = await jiraService.getBoards();
      
      res.json({
        success: true,
        message: 'Connection successful',
        boardCount: boards.length
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get available boards/teams
  async getBoards(req, res) {
    try {
      const { jiraUrl, email, apiToken } = req.body;
      
      const jiraService = new JiraService(jiraUrl, email, apiToken);
      const boards = await jiraService.getBoards();
      
      res.json({
        success: true,
        boards: boards.map(board => ({
          id: board.id,
          name: board.name,
          type: board.type
        }))
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get team metrics
  async getTeamMetrics(req, res) {
    try {
      const { jiraUrl, email, apiToken, boardId, sprintCount = 6 } = req.body;
      
      const jiraService = new JiraService(jiraUrl, email, apiToken);
      
      // Get sprints
      const sprints = await jiraService.getSprints(boardId, 'closed');
      const recentSprints = sprints.slice(0, sprintCount);
      
      // Process each sprint
      const sprintMetrics = [];
      
      for (let i = 0; i < recentSprints.length; i++) {
        const sprint = recentSprints[i];
        const issues = await jiraService.getSprintIssues(sprint.id);
        
        // Get next sprint for rollover calculation
        const nextSprint = recentSprints[i - 1];
        let nextSprintIssues = [];
        if (nextSprint) {
          nextSprintIssues = await jiraService.getSprintIssues(nextSprint.id);
        }
        
        // Calculate metrics
        const sprintGoalAttainment = this.metricsService.calculateSprintGoalAttainment(sprint, issues);
        const rolloverRate = this.metricsService.calculateRolloverRate(issues, nextSprintIssues);
        const sprintHitRate = this.metricsService.calculateSprintHitRate(issues);
        const midSprintAdditions = this.metricsService.calculateMidSprintAdditions(issues, sprint.startDate);
        const defectDistribution = this.metricsService.calculateDefectDistribution(issues);
        
        sprintMetrics.push({
          sprintId: sprint.id,
          sprintName: sprint.name,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          sprintGoalAttainment,
          rolloverRate,
          sprintHitRate,
          midSprintAdditions,
          defectDistribution,
          totalIssues: issues.length
        });
      }
      
      // Get current backlog health
      // NOTE: board JQL function is deprecated and returns 410
      // Using project-based query instead for backlog health
      const boardConfig = await jiraService.getBoardConfiguration(boardId);
      const projectKey = boardConfig.location?.projectKey || null;

      let backlogHealth = { score: 0, details: {} };

      if (projectKey) {
        try {
          const backlogIssues = await jiraService.searchIssues(
            `project = "${projectKey}" AND status != Done AND sprint is EMPTY`,
            ['summary', 'description', 'customfield_10016', 'fixVersions'],
            500
          );
          backlogHealth = this.metricsService.calculateBacklogHealth(backlogIssues);
        } catch (err) {
          console.warn('Could not fetch backlog health:', err.message);
        }
      }
      
      // Aggregate metrics
      const aggregated = this.metricsService.aggregateSprintMetrics(sprintMetrics);
      
      // Determine maturity level
      const maturityLevel = this.metricsService.determineMaturityLevel({
        rolloverRate: aggregated.avgRolloverRate,
        sprintGoalAttainment: aggregated.avgSprintGoalAttainment,
        backlogHealth,
        midSprintAdditions: aggregated.avgMidSprintAdditions
      });
      
      res.json({
        success: true,
        data: {
          sprintMetrics,
          aggregated,
          backlogHealth,
          maturityLevel,
          boardId,
          sprintsAnalyzed: sprintMetrics.length
        }
      });
      
    } catch (error) {
      console.error('Error fetching team metrics:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get detailed flow metrics (cycle time, lead time)
  async getFlowMetrics(req, res) {
    try {
      const { jiraUrl, email, apiToken, boardId, sprintCount = 3 } = req.body;
      
      const jiraService = new JiraService(jiraUrl, email, apiToken);
      const sprints = await jiraService.getSprints(boardId, 'closed');
      const recentSprints = sprints.slice(0, sprintCount);
      
      const flowMetrics = {
        cycleTimeByType: { Story: [], Bug: [], Task: [] },
        leadTimeByType: { Story: [], Bug: [], Task: [] }
      };
      
      for (const sprint of recentSprints) {
        const issues = await jiraService.getSprintIssues(sprint.id);
        
        for (const issue of issues) {
          const issueType = issue.fields.issuetype.name;
          
          try {
            const changelog = await jiraService.getIssueChangelog(issue.key);
            const cycleTime = this.metricsService.calculateCycleTime(issue, changelog);
            const leadTime = this.metricsService.calculateLeadTime(issue);
            
            if (cycleTime && flowMetrics.cycleTimeByType[issueType]) {
              flowMetrics.cycleTimeByType[issueType].push(cycleTime);
            }
            
            if (leadTime && flowMetrics.leadTimeByType[issueType]) {
              flowMetrics.leadTimeByType[issueType].push(leadTime);
            }
          } catch (err) {
            console.warn(`Could not fetch changelog for ${issue.key}`);
          }
        }
      }
      
      // Calculate averages
      const calculateAvg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      
      const summary = {
        avgCycleTime: {
          Story: calculateAvg(flowMetrics.cycleTimeByType.Story),
          Bug: calculateAvg(flowMetrics.cycleTimeByType.Bug),
          Task: calculateAvg(flowMetrics.cycleTimeByType.Task)
        },
        avgLeadTime: {
          Story: calculateAvg(flowMetrics.leadTimeByType.Story),
          Bug: calculateAvg(flowMetrics.leadTimeByType.Bug),
          Task: calculateAvg(flowMetrics.leadTimeByType.Task)
        }
      };
      
      res.json({
        success: true,
        data: {
          flowMetrics,
          summary
        }
      });
      
    } catch (error) {
      console.error('Error fetching flow metrics:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

export default DashboardController;
