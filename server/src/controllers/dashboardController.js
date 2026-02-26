import JiraService from '../services/jiraService.js';
import MetricsService from '../services/metricsService.js';
import cacheService from '../services/cacheService.js';
import database from '../services/database.js';

class DashboardController {
  constructor() {
    this.metricsService = new MetricsService();
  }

  // Initialize Jira connection (lightweight — validates credentials only)
  async testConnection(req, res) {
    try {
      const { jiraUrl, email, apiToken } = req.body;

      const jiraService = new JiraService(jiraUrl, email, apiToken);
      await jiraService.getCurrentUser();

      res.json({
        success: true,
        message: 'Connection successful'
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
      // 24-hour TTL since boards rarely change
      if (!forceRefresh) {
        const cachedBoards = await database.getCachedBoards(24 * 3600 * 1000); // 24 hours
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
      // matchedSprints is already in chronological order (oldest first)
      let recentSprints;
      if (sprintIds && sprintIds.length > 0) {
        const idSet = new Set(sprintIds);
        recentSprints = matchedSprints.filter(s => idSet.has(s.id));
        // Keep chronological order (oldest first)
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

      // Pre-fetch ALL sprint issues + backlog in parallel (major speedup)
      console.log(`  ⚡ Fetching all sprint issues + backlog in parallel...`);
      const sprintIssuesMap = new Map();
      let backlogIssuesResult = [];

      const fetchPromises = recentSprints.map(async (sprint) => {
        const issues = await jiraService.getSprintIssues(sprint.id, boardId);
        sprintIssuesMap.set(sprint.id, issues);
      });
      fetchPromises.push(
        jiraService.getBacklogIssues(boardId)
          .then(issues => { backlogIssuesResult = issues; })
          .catch(err => { console.warn('  ⚠ Could not fetch backlog:', err.message); })
      );
      await Promise.all(fetchPromises);
      console.log(`  ✓ All data fetched in parallel`);

      // Process each sprint (all data already in memory)
      const sprintMetrics = [];

      for (let i = 0; i < recentSprints.length; i++) {
        const sprint = recentSprints[i];
        const issues = sprintIssuesMap.get(sprint.id);

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

        // Get next sprint for rollover calculation (already pre-fetched)
        // In chronological order, next sprint is i + 1
        const nextSprint = recentSprints[i + 1];
        const nextSprintIssues = nextSprint ? sprintIssuesMap.get(nextSprint.id) : [];

        // Calculate metrics
        const sprintGoalAttainment = this.metricsService.calculateSprintGoalAttainment(sprint, issues);
        const rolloverResult = this.metricsService.calculateRolloverRate(issues, nextSprintIssues, sprint.name);
        const sprintHitRate = this.metricsService.calculateSprintHitRate(issues, sprint.completeDate || sprint.endDate);
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
          totalIssues: issues.filter(i => !i.fields.issuetype.subtask).length
        });
      }

      // Backlog health (already pre-fetched in parallel above)
      console.log(`\n🔍 Processing Backlog Health for board ${boardId}:`);

      let backlogHealth = { score: 0, details: {} };

      try {
        console.log(`  Found ${backlogIssuesResult.length} backlog issues`);
        backlogHealth = this.metricsService.calculateBacklogHealth(backlogIssuesResult);
      } catch (err) {
        console.warn('  ❌ Could not calculate backlog health:', err.message);
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
      const { jiraUrl, email, apiToken, boardId, sprintCount = 6, forceRefresh = false, sprintIds = null } = req.body;

      // Check cache first (unless force refresh or custom sprint IDs)
      if (!forceRefresh && !sprintIds) {
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

      // Get board name for sprint filtering (same logic as getTeamMetrics)
      const board = await jiraService.getBoard(boardId);
      const boardName = board?.name || `Board ${boardId}`;
      const boardKey = boardName.replace(/\s*Scrum\s*Board\s*/i, '').trim().toUpperCase();

      const allSprints = await jiraService.getSprints(boardId, 'closed');

      // Filter sprints by board naming convention
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

      // If specific sprint IDs were provided, use those; otherwise take most recent N
      // matchedSprints is already in chronological order (oldest first)
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

      console.log(`\n📊 Flow Metrics for board ${boardId} (${boardName}) - ${recentSprints.length} sprints:`);
      recentSprints.forEach((s, idx) => {
        console.log(`  ${idx + 1}. ${s.name} (${s.startDate?.split('T')[0]} to ${s.endDate?.split('T')[0]})`);
      });
      
      const flowMetrics = {
        cycleTimeByType: {},
        leadTimeByType: {}
      };

      // Step 1: Pre-fetch ALL sprint issues in parallel
      console.log(`  ⚡ Fetching all sprint issues in parallel...`);
      const sprintIssuesMap = new Map();
      await Promise.all(recentSprints.map(async (sprint) => {
        const issues = await jiraService.getSprintIssues(sprint.id, boardId);
        sprintIssuesMap.set(sprint.id, issues);
      }));

      // Step 2: Collect unique non-subtask issue keys across all sprints
      const seenIssueKeys = new Set();
      const uniqueIssues = [];
      for (const sprint of recentSprints) {
        for (const issue of sprintIssuesMap.get(sprint.id)) {
          if (issue.fields.issuetype.subtask) continue;
          if (seenIssueKeys.has(issue.key)) continue;
          seenIssueKeys.add(issue.key);
          uniqueIssues.push(issue);
        }
      }

      // Step 3: Batch fetch ALL changelogs in parallel (instead of 1 API call per issue)
      console.log(`  ⚡ Batch fetching changelogs for ${uniqueIssues.length} issues...`);
      const changelogMap = await jiraService.batchGetIssueChangelogs(
        uniqueIssues.map(i => i.key)
      );

      // Step 4: Process metrics from pre-fetched data (no API calls)
      const scatterData = [];

      for (const issue of uniqueIssues) {
        const issueType = issue.fields.issuetype.name;
        const changelog = changelogMap.get(issue.key) || [];

        const cycleTime = this.metricsService.calculateCycleTime(issue, changelog);
        const leadTime = this.metricsService.calculateLeadTime(issue);

        if (cycleTime) {
          if (!flowMetrics.cycleTimeByType[issueType]) flowMetrics.cycleTimeByType[issueType] = [];
          flowMetrics.cycleTimeByType[issueType].push(cycleTime);
        }

        if (leadTime) {
          if (!flowMetrics.leadTimeByType[issueType]) flowMetrics.leadTimeByType[issueType] = [];
          flowMetrics.leadTimeByType[issueType].push(leadTime);
        }

        // Add to scatter data if issue is resolved
        if (cycleTime && issue.fields.resolutiondate) {
          scatterData.push({
            key: issue.key,
            summary: issue.fields.summary || '',
            type: issueType,
            completionDate: issue.fields.resolutiondate.split('T')[0],
            cycleTime: Math.round(cycleTime * 10) / 10
          });
        }
      }

      // Sort scatter data by completion date
      scatterData.sort((a, b) => a.completionDate.localeCompare(b.completionDate));

      // Calculate percentiles for cycle time (like Actionable Agile Metrics)
      const allCycleTimes = scatterData.map(d => d.cycleTime).sort((a, b) => a - b);
      const percentile = (arr, p) => {
        if (arr.length === 0) return 0;
        const idx = Math.ceil(arr.length * p / 100) - 1;
        return arr[Math.max(0, idx)];
      };

      // Calculate averages
      const calculateAvg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

      // Build averages dynamically for all discovered issue types
      const avgCycleTime = {};
      for (const [type, times] of Object.entries(flowMetrics.cycleTimeByType)) {
        avgCycleTime[type] = calculateAvg(times);
      }
      const avgLeadTime = {};
      for (const [type, times] of Object.entries(flowMetrics.leadTimeByType)) {
        avgLeadTime[type] = calculateAvg(times);
      }

      const summary = {
        avgCycleTime,
        avgLeadTime,
        percentiles: {
          p50: percentile(allCycleTimes, 50),
          p70: percentile(allCycleTimes, 70),
          p85: percentile(allCycleTimes, 85),
          p95: percentile(allCycleTimes, 95)
        },
        totalItems: scatterData.length
      };

      // Prepare response data
      const responseData = {
        flowMetrics,
        scatterData,
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
  // CAPACITY MANAGEMENT
  // =====================

  async getCapacityMetrics(req, res) {
    try {
      const { jiraUrl, email, apiToken, boardId, sprintCount = 6, forceRefresh = false, sprintIds = null } = req.body;

      // Check cache first
      if (!forceRefresh && !sprintIds) {
        const cacheKey = cacheService.generateKey(boardId, 'capacity-metrics');
        const cachedData = cacheService.get(cacheKey);
        if (cachedData) {
          return res.json({ success: true, data: cachedData, cached: true });
        }
      }

      const jiraService = new JiraService(jiraUrl, email, apiToken);

      // Get board name for sprint filtering (same logic as getTeamMetrics)
      const board = await jiraService.getBoard(boardId);
      const boardName = board?.name || `Board ${boardId}`;
      const boardKey = boardName.replace(/\s*Scrum\s*Board\s*/i, '').trim().toUpperCase();

      // Fetch closed and active sprints in parallel
      const [allSprints, activeSprints] = await Promise.all([
        jiraService.getSprints(boardId, 'closed'),
        jiraService.getSprints(boardId, 'active')
      ]);

      // Filter sprints by board naming convention
      const filterByBoard = (sprints) => {
        const filtered = sprints.filter(sprint => {
          const sprintNameUpper = sprint.name.toUpperCase();
          const prefixMatch = sprint.name.match(/^([A-Za-z]+)/);
          if (prefixMatch) {
            const sprintPrefix = prefixMatch[1].toUpperCase();
            return boardKey.includes(sprintPrefix) || sprintPrefix.includes(boardKey);
          }
          return sprintNameUpper.includes(boardKey);
        });
        return filtered.length > 0 ? filtered : sprints;
      };

      const matchedSprints = filterByBoard(allSprints);
      const matchedActiveSprints = filterByBoard(activeSprints);

      // matchedSprints is already in chronological order (oldest first)
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

      // Append active sprint(s) if not already included (at the end = chronological)
      const activeSprintToInclude = matchedActiveSprints.length > 0 ? matchedActiveSprints[0] : null;
      if (activeSprintToInclude && !recentSprints.some(s => s.id === activeSprintToInclude.id)) {
        recentSprints.push(activeSprintToInclude);
      }

      console.log(`\n📊 Capacity Metrics for board ${boardId} (${boardName}) - ${recentSprints.length} sprints (${activeSprintToInclude ? 'incl. active' : 'no active'})`);

      // Pre-fetch ALL sprint issues in parallel (major speedup)
      console.log(`  ⚡ Fetching all sprint issues in parallel...`);
      const sprintIssuesMap = new Map();
      await Promise.all(recentSprints.map(async (sprint) => {
        const issues = await jiraService.getSprintIssues(sprint.id, boardId);
        sprintIssuesMap.set(sprint.id, issues);
      }));
      console.log(`  ✓ All sprint issues fetched in parallel`);

      const storyPointsField = 'customfield_10061';
      const sprintCapacity = [];
      const assigneeMap = {};
      // Track issues globally to avoid double-counting in work distribution
      const seenIssueKeysGlobal = new Set();
      // Track which sprints each issue appears in (for carryover detection)
      const issueSprintMap = new Map();

      for (const sprint of recentSprints) {
        const issues = sprintIssuesMap.get(sprint.id);
        const isActive = activeSprintToInclude && sprint.id === activeSprintToInclude.id;
        // For active sprints use current time; for closed use completeDate
        const sprintEnd = isActive ? new Date() : new Date(sprint.completeDate || sprint.endDate);

        let committedPoints = 0;
        let completedPoints = 0;
        let totalIssues = 0;
        let completedIssues = 0;
        const sprintAssignees = new Set();
        const sprintIssueDetails = [];
        // Build status→category map for changelog-based completion check
        const statusCategoryMap = MetricsService.buildStatusCategoryMap(issues);

        for (const issue of issues) {
          // Skip sub-tasks to avoid double-counting story points with their parent
          if (issue.fields.issuetype.subtask) continue;

          const points = issue.fields[storyPointsField] || 0;
          const assignee = issue.fields.assignee?.displayName || 'Unassigned';
          const issueType = issue.fields.issuetype.name;

          // Check if issue was in "done" status at sprint close time (changelog snapshot)
          // This matches Jira Sprint Report behavior instead of using resolutionDate
          const isDone = MetricsService.wasCompletedAtTime(issue, sprintEnd, statusCategoryMap);

          totalIssues++;
          committedPoints += points;
          if (isDone) {
            completedPoints += points;
            completedIssues++;
          }

          sprintAssignees.add(assignee);

          // Collect issue details for the expandable sprint view
          sprintIssueDetails.push({
            key: issue.key,
            summary: issue.fields.summary,
            issueType,
            points,
            status: issue.fields.status.name,
            statusCategory: issue.fields.status.statusCategory.key,
            resolutionDate: issue.fields.resolutiondate || null,
            completedInSprint: isDone,
            assignee
          });

          // Track which sprints this issue appears in
          if (!issueSprintMap.has(issue.key)) issueSprintMap.set(issue.key, []);
          issueSprintMap.get(issue.key).push(sprint.id);

          // Track per-assignee data (deduplicated across sprints)
          if (!seenIssueKeysGlobal.has(issue.key)) {
            seenIssueKeysGlobal.add(issue.key);
            if (!assigneeMap[assignee]) {
              assigneeMap[assignee] = { committed: 0, completed: 0, issuesAssigned: 0, issuesCompleted: 0, types: {} };
            }
            assigneeMap[assignee].committed += points;
            if (isDone) {
              assigneeMap[assignee].completed += points;
              assigneeMap[assignee].issuesCompleted++;
            }
            assigneeMap[assignee].issuesAssigned++;
            assigneeMap[assignee].types[issueType] = (assigneeMap[assignee].types[issueType] || 0) + 1;
          }
        }

        sprintCapacity.push({
          sprintId: sprint.id,
          sprintName: sprint.name,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          isActive: !!isActive,
          committedPoints,
          completedPoints,
          totalIssues,
          completedIssues,
          teamSize: sprintAssignees.size,
          velocity: completedPoints,
          throughput: completedIssues,
          issues: sprintIssueDetails
        });
      }

      // Annotate carryover status: issue appeared in more than one sprint
      for (const sc of sprintCapacity) {
        for (const issue of sc.issues) {
          const sprintIds = issueSprintMap.get(issue.key) || [];
          issue.isCarryover = sprintIds.length > 1;
          issue.sprintCount = sprintIds.length;
        }
      }

      // Calculate aggregated capacity metrics
      const velocities = sprintCapacity.map(s => s.velocity);
      const throughputs = sprintCapacity.map(s => s.throughput);
      const teamSizes = sprintCapacity.map(s => s.teamSize);
      const commitments = sprintCapacity.map(s => s.committedPoints);

      const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const stdDev = arr => {
        if (arr.length < 2) return 0;
        const mean = avg(arr);
        return Math.sqrt(arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (arr.length - 1));
      };

      // Work distribution by assignee (sorted by completed points)
      const workDistribution = Object.entries(assigneeMap)
        .map(([name, data]) => ({
          name,
          committed: data.committed,
          completed: data.completed,
          issuesAssigned: data.issuesAssigned,
          issuesCompleted: data.issuesCompleted,
          types: data.types
        }))
        .sort((a, b) => b.completed - a.completed);

      // Focus factor: completed / committed ratio per sprint
      const focusFactors = sprintCapacity.map(s =>
        s.committedPoints > 0 ? (s.completedPoints / s.committedPoints) * 100 : 0
      );

      const summary = {
        avgVelocity: avg(velocities),
        velocityStdDev: stdDev(velocities),
        avgThroughput: avg(throughputs),
        throughputStdDev: stdDev(throughputs),
        avgTeamSize: avg(teamSizes),
        avgCommitment: avg(commitments),
        avgFocusFactor: avg(focusFactors),
        velocityTrend: (() => {
          if (velocities.length < 2) return 0;
          // Compare average of recent half vs older half for a smoother trend
          // velocities are in chronological order (oldest first)
          const mid = Math.floor(velocities.length / 2);
          const olderHalf = velocities.slice(0, mid);
          const recentHalf = velocities.slice(mid);
          const avgRecent = avg(recentHalf);
          const avgOlder = avg(olderHalf);
          return Math.round((avgRecent - avgOlder) * 10) / 10;
        })(),
        sprintsAnalyzed: sprintCapacity.length
      };

      const responseData = {
        sprintCapacity, // already in chronological order (oldest first)
        workDistribution,
        summary
      };

      // Cache
      const cacheKey = cacheService.generateKey(boardId, 'capacity-metrics');
      cacheService.set(cacheKey, responseData);

      // Save to Supabase
      try {
        await database.updateLatestWithCapacity(boardId, responseData);
      } catch (dbError) {
        console.warn('Failed to save capacity metrics to database:', dbError.message);
      }

      res.json({ success: true, data: responseData, cached: false });
    } catch (error) {
      console.error('Error fetching capacity metrics:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

}

export default DashboardController;
