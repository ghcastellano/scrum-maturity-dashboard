import JiraService from '../services/jiraService.js';
import MetricsService from '../services/metricsService.js';
import cacheService from '../services/cacheService.js';
import database from '../services/database.js';

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
      const { jiraUrl, email, apiToken, forceRefresh = false } = req.body;

      // Check database cache first (persists for all users, survives restarts)
      if (!forceRefresh) {
        const cachedBoards = await database.getCachedBoards(3600 * 1000); // 1 hour
        if (cachedBoards) {
          return res.json({
            success: true,
            boards: cachedBoards,
            cached: true,
            message: 'Boards loaded from database cache'
          });
        }
      }

      console.log('📡 Fetching boards from Jira API...');
      const jiraService = new JiraService(jiraUrl, email, apiToken);
      const boards = await jiraService.getBoards();

      const formattedBoards = boards.map(board => ({
        id: board.id,
        name: board.name,
        type: board.type
      }));

      // Save to database (persistent cache for all users)
      await database.saveBoards(formattedBoards);

      res.json({
        success: true,
        boards: formattedBoards,
        cached: false
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get available sprints for a board (filtered and deduplicated)
  async getSprints(req, res) {
    try {
      const { jiraUrl, email, apiToken, boardId } = req.body;
      const jiraService = new JiraService(jiraUrl, email, apiToken);

      // Get board name for sprint filtering
      const board = await jiraService.getBoard(boardId);
      const boardName = board?.name || `Board ${boardId}`;

      // Get all closed sprints (already deduplicated and sorted in jiraService)
      const allSprints = await jiraService.getSprints(boardId, 'closed');

      // Filter by board naming convention
      const boardKey = boardName.replace(/\s*Scrum\s*Board\s*/i, '').trim().toUpperCase();
      const filtered = allSprints.filter(sprint => {
        const sprintNameUpper = sprint.name.toUpperCase();
        const prefixMatch = sprint.name.match(/^([A-Za-z]+)/);
        if (prefixMatch) {
          const sprintPrefix = prefixMatch[1].toUpperCase();
          return boardKey.includes(sprintPrefix) || sprintPrefix.includes(boardKey);
        }
        // No letter prefix (e.g., "3Q25.S16RISE") - only keep if name contains board key
        return sprintNameUpper.includes(boardKey);
      });

      const sprints = (filtered.length > 0 ? filtered : allSprints).map(s => ({
        id: s.id,
        name: s.name,
        startDate: s.startDate,
        endDate: s.endDate,
        state: s.state
      }));

      res.json({ success: true, sprints, boardName });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get team metrics
  async getTeamMetrics(req, res) {
    try {
      const { jiraUrl, email, apiToken, boardId, sprintCount = 6, sprintIds, forceRefresh = false } = req.body;

      console.log(`\n🎯 getTeamMetrics called with:`);
      console.log(`  Board ID: ${boardId} (type: ${typeof boardId})`);
      console.log(`  Sprint Count: ${sprintCount}`);
      console.log(`  Sprint IDs: ${sprintIds ? sprintIds.join(', ') : 'auto (most recent)'}`);
      console.log(`  Force Refresh: ${forceRefresh}`);

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cacheKey = cacheService.generateKey(boardId, 'team-metrics');
        console.log(`  Cache Key: ${cacheKey}`);
        const cachedData = cacheService.get(cacheKey);

        if (cachedData) {
          console.log(`  ✅ Returning cached data for board ${boardId}`);
          return res.json({
            success: true,
            data: cachedData,
            cached: true,
            message: 'Data loaded from cache'
          });
        }
      }

      console.log(`  📡 Fetching fresh data from Jira for board ${boardId}`);
      const jiraService = new JiraService(jiraUrl, email, apiToken);

      // Get board name early (needed for sprint filtering)
      const board = await jiraService.getBoard(boardId);
      const boardName = board?.name || `Board ${boardId}`;

      // Get sprints
      const allSprints = await jiraService.getSprints(boardId, 'closed');

      // Filter sprints to match the board's naming convention
      // Extracts the board key (e.g., "STCPQ" from "STCPQ Scrum Board")
      // and keeps only sprints whose prefix is related to the board key
      const boardKey = boardName.replace(/\s*Scrum\s*Board\s*/i, '').trim().toUpperCase();
      const filteredSprints = allSprints.filter(sprint => {
        const sprintNameUpper = sprint.name.toUpperCase();
        const prefixMatch = sprint.name.match(/^([A-Za-z]+)/);
        if (prefixMatch) {
          const sprintPrefix = prefixMatch[1].toUpperCase();
          return boardKey.includes(sprintPrefix) || sprintPrefix.includes(boardKey);
        }
        // No letter prefix (e.g., "3Q25.S16RISE") - only keep if name contains board key
        return sprintNameUpper.includes(boardKey);
      });

      // Use filtered sprints if they exist, otherwise fall back to all sprints
      const matchedSprints = filteredSprints.length > 0 ? filteredSprints : allSprints;

      if (matchedSprints.length < allSprints.length) {
        console.log(`\n🔍 Sprint name filter: board key="${boardKey}", kept ${matchedSprints.length}/${allSprints.length} sprints`);
        const excluded = allSprints.filter(s => !matchedSprints.includes(s));
        if (excluded.length > 0) {
          console.log(`  Excluded sprints:`);
          excluded.slice(0, 5).forEach(s => console.log(`    - ${s.name}`));
          if (excluded.length > 5) console.log(`    ... and ${excluded.length - 5} more`);
        }
      }

      // If specific sprint IDs were provided, use those; otherwise take most recent N
      let recentSprints;
      if (sprintIds && sprintIds.length > 0) {
        const idSet = new Set(sprintIds);
        recentSprints = matchedSprints.filter(s => idSet.has(s.id));
        // Sort by endDate descending (most recent first) to maintain consistent order
        recentSprints.sort((a, b) => {
          const dateA = a.endDate ? new Date(a.endDate) : new Date(0);
          const dateB = b.endDate ? new Date(b.endDate) : new Date(0);
          return dateB - dateA;
        });
      } else {
        recentSprints = matchedSprints.slice(0, sprintCount);
      }

      console.log(`\n📋 Board ${boardId} (${boardName}) - Analyzing ${recentSprints.length} sprints:`);
      recentSprints.forEach((s, idx) => {
        console.log(`  ${idx + 1}. ${s.name} (${s.startDate?.split('T')[0]} to ${s.endDate?.split('T')[0]})`);
      });

      // Process each sprint
      const sprintMetrics = [];
      
      for (let i = 0; i < recentSprints.length; i++) {
        const sprint = recentSprints[i];
        const issues = await jiraService.getSprintIssues(sprint.id);

        // Log sample issues on first sprint to help identify story points field
        if (i === 0 && issues.length > 0) {
          console.log(`\n📝 Sample Issues from first sprint (${sprint.name}):`);
          issues.slice(0, 3).forEach((issue, idx) => {
            console.log(`\n${idx + 1}. ${issue.key} - ${issue.fields.summary}`);
            const customFields = [];
            Object.keys(issue.fields).forEach(fieldKey => {
              if (fieldKey.startsWith('customfield_')) {
                const value = issue.fields[fieldKey];
                if (value !== null && value !== undefined) {
                  // Show type and value
                  const valueStr = typeof value === 'object' ? JSON.stringify(value).substring(0, 50) : value;
                  customFields.push(`${fieldKey}=${valueStr}(${typeof value})`);
                }
              }
            });
            if (customFields.length > 0) {
              console.log(`   Fields: ${customFields.slice(0, 10).join(', ')}`);
            } else {
              console.log(`   No custom fields found!`);
            }
          });
        }

        // Get next sprint for rollover calculation
        const nextSprint = recentSprints[i - 1];
        let nextSprintIssues = [];
        if (nextSprint) {
          nextSprintIssues = await jiraService.getSprintIssues(nextSprint.id);
        }

        // Calculate metrics
        const sprintGoalAttainment = this.metricsService.calculateSprintGoalAttainment(sprint, issues);
        const rolloverResult = this.metricsService.calculateRolloverRate(issues, nextSprintIssues, sprint.name);
        const sprintHitRate = this.metricsService.calculateSprintHitRate(issues);
        const midSprintAdditions = this.metricsService.calculateMidSprintAdditions(issues, sprint.startDate);
        const defectDistribution = this.metricsService.calculateDefectDistribution(issues);

        sprintMetrics.push({
          sprintId: sprint.id,
          sprintName: sprint.name,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          sprintGoalAttainment,
          rolloverRate: rolloverResult.rate,
          rolloverIssues: rolloverResult.issues,
          rolloverReasonBreakdown: rolloverResult.reasonBreakdown,
          sprintHitRate,
          midSprintAdditions,
          defectDistribution,
          totalIssues: issues.length
        });
      }
      
      // Get current backlog health using Agile API backlog endpoint
      console.log(`\n🔍 Fetching Backlog Health for board ${boardId}:`);

      let backlogHealth = { score: 0, details: {} };

      try {
        console.log(`  Using Agile API /board/${boardId}/backlog endpoint`);
        const backlogIssues = await jiraService.getBacklogIssues(boardId);
        console.log(`  Found ${backlogIssues.length} backlog issues`);
        backlogHealth = this.metricsService.calculateBacklogHealth(backlogIssues);
      } catch (err) {
        console.warn('  ❌ Could not fetch backlog health:', err.message);
      }
      
      // Aggregate metrics
      const aggregated = this.metricsService.aggregateSprintMetrics(sprintMetrics);

      // Handle case where there are no sprints or aggregation fails
      if (!aggregated) {
        return res.status(400).json({
          success: false,
          message: 'No valid sprint data available for analysis. Please ensure the board has closed sprints with issues.'
        });
      }

      // Determine maturity level
      const maturityLevel = this.metricsService.determineMaturityLevel({
        rolloverRate: aggregated.avgRolloverRate || 0,
        sprintGoalAttainment: aggregated.avgSprintGoalAttainment || 0,
        backlogHealth,
        midSprintAdditions: aggregated.avgMidSprintAdditions || 0
      });

      // Prepare response data
      const responseData = {
        sprintMetrics,
        aggregated,
        backlogHealth,
        maturityLevel,
        boardId,
        boardName,
        sprintsAnalyzed: sprintMetrics.length
      };

      // Cache the data
      const cacheKey = cacheService.generateKey(boardId, 'team-metrics');
      cacheService.set(cacheKey, responseData);

      // Save to database for history
      try {
        await database.saveMetrics(
          boardId,
          boardName,
          sprintCount,
          responseData,
          maturityLevel.level
        );
      } catch (dbError) {
        console.warn('Failed to save metrics to database:', dbError.message);
      }

      res.json({
        success: true,
        data: responseData,
        cached: false,
        message: 'Data fetched from Jira API'
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
      const { jiraUrl, email, apiToken, boardId, sprintCount = 3, forceRefresh = false } = req.body;

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cacheKey = cacheService.generateKey(boardId, 'flow-metrics');
        const cachedData = cacheService.get(cacheKey);

        if (cachedData) {
          return res.json({
            success: true,
            data: cachedData,
            cached: true,
            message: 'Data loaded from cache'
          });
        }
      }

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

      // Prepare response data
      const responseData = {
        flowMetrics,
        summary
      };

      // Cache the data
      const cacheKey = cacheService.generateKey(boardId, 'flow-metrics');
      cacheService.set(cacheKey, responseData);

      // Save flow metrics to Supabase (merge into latest board record)
      try {
        await database.updateLatestWithFlow(boardId, responseData);
      } catch (dbError) {
        console.warn('Failed to save flow metrics to database:', dbError.message);
      }

      res.json({
        success: true,
        data: responseData,
        cached: false,
        message: 'Data fetched from Jira API'
      });

    } catch (error) {
      console.error('Error fetching flow metrics:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Diagnostic endpoint to find story points field
  async diagnostics(req, res) {
    try {
      const { jiraUrl, email, apiToken, boardId } = req.body;

      const jiraService = new JiraService(jiraUrl, email, apiToken);

      // Find story points field candidates
      const storyPointsCandidates = await jiraService.findStoryPointsField();

      // Get a sample sprint and issue
      const sprints = await jiraService.getSprints(boardId, 'closed');
      let sampleIssue = null;

      if (sprints.length > 0) {
        sampleIssue = await jiraService.getSampleIssue(sprints[0].id);
      }

      res.json({
        success: true,
        diagnostics: {
          storyPointsCandidates: storyPointsCandidates.map(f => ({
            id: f.id,
            name: f.name,
            type: f.schema?.type
          })),
          sampleIssueKey: sampleIssue?.key,
          sampleIssueCustomFields: sampleIssue ? Object.keys(sampleIssue.fields)
            .filter(k => k.startsWith('customfield_'))
            .reduce((acc, k) => {
              acc[k] = sampleIssue.fields[k];
              return acc;
            }, {}) : {}
        }
      });
    } catch (error) {
      console.error('Error running diagnostics:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // =====================
  // RELEASES / VERSIONS
  // =====================

  // Get releases/versions for a board's project
  async getReleases(req, res) {
    try {
      const { jiraUrl, email, apiToken, boardId } = req.body;
      const jiraService = new JiraService(jiraUrl, email, apiToken);

      // Get project key from board
      const projectKey = await jiraService.getProjectKeyFromBoard(boardId);
      console.log(`📦 Fetching releases for project ${projectKey} (board ${boardId})`);

      // Get all versions
      const versions = await jiraService.getProjectVersions(projectKey);

      // Filter out archived releases and format
      const releases = versions
        .filter(v => !v.archived) // Exclude archived/deleted releases
        .map(v => ({
          id: v.id,
          name: v.name,
          description: v.description || '',
          released: v.released || false,
          archived: v.archived || false,
          releaseDate: v.releaseDate || null,
          startDate: v.startDate || null,
          overdue: v.overdue || false,
          projectId: v.projectId
        }));

      // Sort: unreleased by date (closest first), then released by date (most recent first)
      // For released versions, only show the 10 most recent
      releases.sort((a, b) => {
        if (a.released !== b.released) return a.released ? 1 : -1;
        const dateA = a.releaseDate ? new Date(a.releaseDate) : new Date('9999-12-31');
        const dateB = b.releaseDate ? new Date(b.releaseDate) : new Date('9999-12-31');
        return a.released ? dateB - dateA : dateA - dateB;
      });

      // Limit released versions to 10 most recent
      const unreleased = releases.filter(r => !r.released);
      const released = releases.filter(r => r.released).slice(0, 10);
      const filteredReleases = [...unreleased, ...released];

      res.json({
        success: true,
        releases: filteredReleases,
        projectKey,
        message: `Found ${filteredReleases.length} releases (${unreleased.length} unreleased, ${released.length} released)`
      });
    } catch (error) {
      console.error('Error fetching releases:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get detailed release data
  async getReleaseDetails(req, res) {
    try {
      const { jiraUrl, email, apiToken, boardId, versionId, versionName, startDate } = req.body;
      const jiraService = new JiraService(jiraUrl, email, apiToken);

      // Get project key from board
      const projectKey = await jiraService.getProjectKeyFromBoard(boardId);
      console.log(`📦 Fetching release details for ${versionName} (project ${projectKey})`);

      const details = await jiraService.getReleaseDetails(projectKey, versionId, versionName, startDate);

      // Generate executive summary
      const executiveSummary = this.generateExecutiveSummary(details, versionName, startDate);

      res.json({
        success: true,
        details: {
          ...details,
          executiveSummary
        },
        projectKey,
        versionName
      });
    } catch (error) {
      console.error('Error fetching release details:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get release burndown data
  async getReleaseBurndown(req, res) {
    try {
      const { jiraUrl, email, apiToken, boardId, versionName, startDate, endDate } = req.body;
      const jiraService = new JiraService(jiraUrl, email, apiToken);

      const projectKey = await jiraService.getProjectKeyFromBoard(boardId);
      console.log(`📊 Fetching burndown for ${versionName} (project ${projectKey})`);

      const burndown = await jiraService.getVersionBurndown(projectKey, versionName, startDate, endDate);

      res.json({
        success: true,
        burndown,
        projectKey,
        versionName,
        // Include release date for chart annotation
        releaseDate: endDate ? new Date(endDate).toISOString().split('T')[0] : null
      });
    } catch (error) {
      console.error('Error fetching release burndown:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Helper: Generate executive summary for a release
  generateExecutiveSummary(details, versionName, startDate) {
    const { metrics, issues, addedAfterStart, removedIssues } = details;

    // Determine health status
    let healthStatus = 'On Track';
    let healthColor = 'green';
    const risks = [];

    if (metrics.completionPercentage < 50) {
      healthStatus = 'At Risk';
      healthColor = 'red';
      risks.push('Less than 50% of issues completed');
    } else if (metrics.completionPercentage < 75) {
      healthStatus = 'Needs Attention';
      healthColor = 'yellow';
    }

    if (addedAfterStart.length > metrics.totalIssues * 0.2) {
      risks.push(`Significant scope creep: ${addedAfterStart.length} items added after release start`);
      if (healthColor === 'green') {
        healthStatus = 'Needs Attention';
        healthColor = 'yellow';
      }
    }

    if (removedIssues.length > 5) {
      risks.push(`${removedIssues.length} items removed from release`);
    }

    // Count blocked items (items with blocking dependencies)
    const blockedItems = issues.filter(i =>
      i.dependencies.some(d => d.type === 'Blocks' && d.direction === 'inward')
    );
    if (blockedItems.length > 0) {
      risks.push(`${blockedItems.length} items have blocking dependencies`);
    }

    // Key statistics
    const byStatus = {
      done: issues.filter(i => i.statusCategory === 'done').length,
      inProgress: issues.filter(i => i.statusCategory === 'indeterminate').length,
      todo: issues.filter(i => i.statusCategory === 'new' || i.statusCategory === 'undefined').length
    };

    const byType = {};
    issues.forEach(i => {
      byType[i.type] = (byType[i.type] || 0) + 1;
    });

    return {
      releaseName: versionName,
      healthStatus,
      healthColor,
      completion: {
        issues: `${metrics.completedIssues}/${metrics.totalIssues} (${metrics.completionPercentage}%)`,
        storyPoints: `${metrics.completedStoryPoints}/${metrics.totalStoryPoints} (${metrics.storyPointsCompletion}%)`
      },
      scopeChanges: {
        addedAfterStart: addedAfterStart.length,
        removed: removedIssues.length,
        scopeCreep: metrics.totalIssues > 0 ? Math.round((addedAfterStart.length / metrics.totalIssues) * 100) : 0
      },
      breakdown: {
        byStatus,
        byType
      },
      risks,
      blockedItems: blockedItems.length
    };
  }
}

export default DashboardController;
