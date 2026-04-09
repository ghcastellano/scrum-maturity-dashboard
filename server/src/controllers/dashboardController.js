import axios from 'axios';
import JiraService from '../services/jiraService.js';
import MetricsService from '../services/metricsService.js';
import cacheService from '../services/cacheService.js';
import database from '../services/database.js';
import TenantService from '../services/tenantService.js';
import { waitUntil } from '@vercel/functions';

// Cache for auto-detected story points fields per tenant (avoids repeated API calls)
const storyPointsFieldCache = new Map();

class DashboardController {
  constructor() {
    this.metricsService = new MetricsService();
  }

  // Extract tenant ID from request
  _getTenantId(req) {
    return TenantService.extractFromRequest(req);
  }

  // Get or auto-detect story points field for a tenant
  async _getStoryPointsField(jiraService, tenantId) {
    if (!tenantId) return 'customfield_10061';

    // Check cache first
    if (storyPointsFieldCache.has(tenantId)) {
      return storyPointsFieldCache.get(tenantId);
    }

    // Known tenants
    if (tenantId === 'indeed.atlassian.net') {
      storyPointsFieldCache.set(tenantId, 'customfield_10061');
      return 'customfield_10061';
    }

    // Auto-detect for unknown tenants
    const fieldId = await jiraService.detectStoryPointsField();
    storyPointsFieldCache.set(tenantId, fieldId);
    return fieldId;
  }

  // Initialize Jira connection (lightweight — validates credentials only)
  async testConnection(req, res) {
    try {
      const { jiraUrl, email, apiToken } = req.body;
      const tenantId = TenantService.extractTenantId(jiraUrl);
      const locale = TenantService.detectLocale(tenantId);

      const jiraService = new JiraService(jiraUrl, email, apiToken);
      const user = await jiraService.getCurrentUser();

      res.json({
        success: true,
        message: 'Connection successful',
        tenantId,
        locale,
        displayName: user?.displayName || null
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get available boards/teams (tenant-scoped)
  // Returns cached boards immediately when available, or triggers a background
  // fetch from Jira and returns { loading: true } so the frontend can poll.
  async getBoards(req, res) {
    try {
      const { jiraUrl, email, apiToken, forceRefresh = false } = req.body;
      const tenantId = this._getTenantId(req);

      // Check database cache first (tenant-scoped)
      if (!forceRefresh) {
        const cachedBoards = await database.getCachedBoards(24 * 3600 * 1000, tenantId);
        if (cachedBoards) {
          return res.json({
            success: true,
            boards: cachedBoards,
            cached: true,
            tenantId,
            message: 'Boards loaded from database cache'
          });
        }
      }

      // No cache — fetch from Jira in background to avoid serverless timeout
      console.log(`📡 Triggering background fetch of boards from Jira (tenant: ${tenantId})...`);
      const jiraService = new JiraService(jiraUrl, email, apiToken);

      // Background fetch: uses waitUntil on Vercel so the work continues after response
      const fetchPromise = jiraService.getBoards()
        .then(async (boards) => {
          const formattedBoards = boards.map(board => ({
            id: board.id,
            name: board.name,
            type: board.type
          }));
          await database.saveBoards(formattedBoards, tenantId);
          console.log(`✅ Background fetch complete: ${formattedBoards.length} boards saved (tenant: ${tenantId})`);
        })
        .catch((err) => {
          console.error(`❌ Background board fetch failed (tenant: ${tenantId}):`, err.message);
        });

      // On Vercel, waitUntil keeps the function alive after the response is sent
      if (process.env.VERCEL) {
        waitUntil(fetchPromise);
      }

      // Return immediately — frontend will poll /api/jira/boards/cached
      res.json({
        success: true,
        boards: [],
        loading: true,
        tenantId,
        message: 'Fetching boards from Jira in background. Poll /api/jira/boards/cached for results.'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get available sprints for a board
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

  // Get team metrics (tenant-scoped)
  async getTeamMetrics(req, res) {
    try {
      const { jiraUrl, email, apiToken, boardId, sprintCount = 6, sprintIds, forceRefresh = false } = req.body;
      const tenantId = this._getTenantId(req);

      console.log(`\n🎯 getTeamMetrics called with:`);
      console.log(`  Board ID: ${boardId} (type: ${typeof boardId})`);
      console.log(`  Sprint Count: ${sprintCount}`);
      console.log(`  Sprint IDs: ${sprintIds ? sprintIds.join(', ') : 'auto (most recent)'}`);
      console.log(`  Force Refresh: ${forceRefresh}`);
      console.log(`  Tenant: ${tenantId}`);

      // Check cache first (tenant-scoped, unless force refresh)
      if (!forceRefresh) {
        const cacheKey = cacheService.generateKey(boardId, 'team-metrics', tenantId);
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

      // Auto-detect story points field for this tenant
      const storyPointsField = await this._getStoryPointsField(jiraService, tenantId);
      this.metricsService.setStoryPointsField(storyPointsField);

      // Get board name early (needed for sprint filtering)
      const board = await jiraService.getBoard(boardId);
      const boardName = board?.name || `Board ${boardId}`;

      // Get sprints
      const allSprints = await jiraService.getSprints(boardId, 'closed');

      // Filter sprints to match the board's naming convention
      const boardKey = boardName.replace(/\s*Scrum\s*Board\s*/i, '').trim().toUpperCase();
      const filteredSprints = allSprints.filter(sprint => {
        const sprintNameUpper = sprint.name.toUpperCase();
        const prefixMatch = sprint.name.match(/^([A-Za-z]+)/);
        if (prefixMatch) {
          const sprintPrefix = prefixMatch[1].toUpperCase();
          return boardKey.includes(sprintPrefix) || sprintPrefix.includes(boardKey);
        }
        return sprintNameUpper.includes(boardKey);
      });

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
        recentSprints.sort((a, b) => {
          const dateA = a.startDate ? new Date(a.startDate) : new Date(0);
          const dateB = b.startDate ? new Date(b.startDate) : new Date(0);
          return dateA - dateB;
        });
      } else {
        recentSprints = matchedSprints.slice(-sprintCount);
      }

      console.log(`\n📋 Board ${boardId} (${boardName}) - Analyzing ${recentSprints.length} sprints:`);
      recentSprints.forEach((s, idx) => {
        console.log(`  ${idx + 1}. ${s.name} (${s.startDate?.split('T')[0]} to ${s.endDate?.split('T')[0]})`);
      });

      // Pre-fetch ALL sprint issues + backlog + future sprints in parallel
      console.log(`  ⚡ Fetching all sprint issues + backlog + future sprints in parallel...`);
      const sprintIssuesMap = new Map();
      let backlogIssuesResult = [];
      let futureSprintItems = { count: 0, sprints: [] };

      const fetchPromises = recentSprints.map(async (sprint) => {
        const issues = await jiraService.getSprintIssues(sprint.id, boardId);
        sprintIssuesMap.set(sprint.id, issues);
      });
      fetchPromises.push(
        jiraService.getBacklogIssues(boardId)
          .then(issues => { backlogIssuesResult = issues; })
          .catch(err => { console.warn('  ⚠ Could not fetch backlog:', err.message); })
      );
      // Fetch future + active sprints to count pre-assigned items
      fetchPromises.push(
        (async () => {
          try {
            const [futureSprints, activeSprints] = await Promise.all([
              jiraService.getSprints(boardId, 'future').catch(() => []),
              jiraService.getSprints(boardId, 'active').catch(() => [])
            ]);
            const upcomingSprints = [...activeSprints, ...futureSprints];
            let totalItems = 0;
            let totalPoints = 0;
            const sprintDetails = [];
            const storyPointsField = jiraService.storyPointsField || 'customfield_10061';
            for (const sprint of upcomingSprints.slice(0, 5)) {
              try {
                // Use agile API directly (not getSprintIssues which calls Sprint Report API)
                const resp = await jiraService.agileApi.get(`/board/${boardId}/sprint/${sprint.id}/issue`, {
                  params: { maxResults: 1000, fields: `summary,issuetype,status,assignee,${storyPointsField}` }
                });
                const allIssues = resp.data.issues || [];
                const parentIssues = allIssues.filter(i => !i.fields?.issuetype?.subtask);
                const sprintPoints = parentIssues.reduce((sum, i) => sum + (i.fields?.[storyPointsField] || 0), 0);
                totalItems += parentIssues.length;
                totalPoints += sprintPoints;
                const issueList = parentIssues.map(i => ({
                  key: i.key,
                  summary: i.fields?.summary || '',
                  type: i.fields?.issuetype?.name || 'Unknown',
                  status: i.fields?.status?.name || 'Unknown',
                  points: i.fields?.[storyPointsField] || 0,
                  assignee: i.fields?.assignee?.displayName || 'Unassigned'
                }));
                sprintDetails.push({
                  name: sprint.name,
                  itemCount: parentIssues.length,
                  storyPoints: sprintPoints,
                  state: sprint.state,
                  issues: issueList
                });
              } catch (e) {
                console.warn(`  ⚠ Could not fetch sprint ${sprint.name}:`, e.message);
              }
            }
            // Fetch average velocity from Jira Velocity Chart API
            let avgVelocity = null;
            try {
              const velResp = await axios.get(
                `${jiraService.baseUrl}/rest/greenhopper/1.0/rapid/charts/velocity`,
                { params: { rapidViewId: boardId }, headers: { 'Authorization': `Basic ${jiraService.auth}`, 'Accept': 'application/json' } }
              );
              const velEntries = Object.values(velResp.data?.velocityStatEntries || {});
              if (velEntries.length > 0) {
                const completedVals = velEntries.map(e => e.completed?.value || 0);
                avgVelocity = Math.round((completedVals.reduce((a, b) => a + b, 0) / completedVals.length) * 10) / 10;
              }
            } catch (e) { console.warn('  ⚠ Could not fetch velocity:', e.message); }
            futureSprintItems = { count: totalItems, totalPoints, sprints: sprintDetails, avgVelocity };
            console.log(`  Future/active sprints: ${upcomingSprints.length} sprints, ${totalItems} items, ${totalPoints}pts, avgVelocity=${avgVelocity}`);
          } catch (err) {
            console.warn('  ⚠ Could not fetch future sprints:', err.message);
          }
        })()
      );
      await Promise.all(fetchPromises);
      console.log(`  ✓ All data fetched in parallel`);

      // Process each sprint
      const sprintMetrics = [];

      for (let i = 0; i < recentSprints.length; i++) {
        const sprint = recentSprints[i];
        const issues = sprintIssuesMap.get(sprint.id);

        // Log sample issues on first sprint
        if (i === 0 && issues.length > 0) {
          console.log(`\n📝 Sample Issues from first sprint (${sprint.name}):`);
          issues.slice(0, 3).forEach((issue, idx) => {
            console.log(`\n${idx + 1}. ${issue.key} - ${issue.fields.summary}`);
            const customFields = [];
            Object.keys(issue.fields).forEach(fieldKey => {
              if (fieldKey.startsWith('customfield_')) {
                const value = issue.fields[fieldKey];
                if (value !== null && value !== undefined) {
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

        const nextSprint = recentSprints[i + 1];
        const nextSprintIssues = nextSprint ? sprintIssuesMap.get(nextSprint.id) : [];

        const sprintGoalResult = this.metricsService.calculateSprintGoalAttainment(sprint, issues);
        const rolloverResult = this.metricsService.calculateRolloverRate(issues, nextSprintIssues, sprint.name, sprint);
        const sprintHitRate = this.metricsService.calculateSprintHitRate(issues, sprint.completeDate || sprint.endDate);
        const midSprintAdditions = this.metricsService.calculateMidSprintAdditions(issues, sprint.startDate);
        const defectDistribution = this.metricsService.calculateDefectDistribution(issues);

        // Use Sprint Report data for accurate planned/committed/completed points
        const reportData = issues._sprintReportData;
        const plannedPoints = reportData?.plannedPoints ?? sprintGoalResult.committedPoints;
        const committedPoints = reportData?.committedPoints ?? sprintGoalResult.committedPoints;
        const completedPoints = reportData?.completedPoints ?? sprintGoalResult.completedPoints;

        // Sprint Hit Rate = committed vs completed (story-points based)
        const sprintHitRatePoints = committedPoints > 0 ? (completedPoints / committedPoints) * 100 : 0;

        sprintMetrics.push({
          sprintId: sprint.id,
          sprintName: sprint.name,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          sprintGoalAttainment: sprintGoalResult.percentage,
          plannedPoints,
          committedPoints,
          completedPoints,
          sprintHitRatePoints,
          rolloverRate: rolloverResult.rate,
          rolloverIssues: rolloverResult.issues,
          rolloverReasonBreakdown: rolloverResult.reasonBreakdown,
          sprintHitRate,
          midSprintAdditions,
          defectDistribution,
          totalIssues: issues.filter(i => !i.fields.issuetype.subtask).length
        });
      }

      // Backlog health
      console.log(`\n🔍 Processing Backlog Health for board ${boardId}:`);

      let backlogHealth = { score: 0, details: {} };

      try {
        console.log(`  Found ${backlogIssuesResult.length} backlog issues`);
        backlogHealth = this.metricsService.calculateBacklogHealth(backlogIssuesResult);
        // Attach future sprint item data to backlog health
        backlogHealth.futureSprintItems = futureSprintItems;
      } catch (err) {
        console.warn('  ❌ Could not calculate backlog health:', err.message);
      }

      // Aggregate metrics
      const aggregated = this.metricsService.aggregateSprintMetrics(sprintMetrics);

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

      // Flow & Quality metrics (Pillar 2)
      const flowQuality = this.metricsService.calculateFlowQuality(
        sprintIssuesMap, sprintMetrics, recentSprints
      );

      // Prepare response data
      const responseData = {
        sprintMetrics,
        aggregated,
        backlogHealth,
        maturityLevel,
        flowQuality,
        boardId,
        boardName,
        sprintsAnalyzed: sprintMetrics.length,
        tenantId
      };

      // Cache the data (tenant-scoped)
      const cacheKey = cacheService.generateKey(boardId, 'team-metrics', tenantId);
      cacheService.set(cacheKey, responseData);

      // Save to database (tenant-scoped)
      try {
        await database.saveMetrics(
          boardId,
          boardName,
          sprintCount,
          responseData,
          maturityLevel.level,
          tenantId
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

  // Diagnostic endpoint to find story points field
  async diagnostics(req, res) {
    try {
      const { jiraUrl, email, apiToken, boardId } = req.body;

      const jiraService = new JiraService(jiraUrl, email, apiToken);

      // Find story points field candidates
      const storyPointsCandidates = await jiraService.findStoryPointsField();

      // Auto-detect the best match
      const autoDetected = await jiraService.detectStoryPointsField();

      // Get a sample sprint and issue
      const sprints = await jiraService.getSprints(boardId, 'closed');
      let sampleIssue = null;

      if (sprints.length > 0) {
        sampleIssue = await jiraService.getSampleIssue(sprints[0].id);
      }

      res.json({
        success: true,
        diagnostics: {
          autoDetectedField: autoDetected,
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

}

export default DashboardController;
