import JiraService from './jiraService.js';
import cacheService from './cacheService.js';
import database from './database.js';
import TenantService from './tenantService.js';

// Cache for auto-detected story points fields per tenant
const storyPointsFieldCache = new Map();

class EpicMetricsService {
  constructor() {}

  // Get or auto-detect story points field for a tenant
  async _getStoryPointsField(jiraService, tenantId) {
    if (!tenantId) return 'customfield_10061';
    if (storyPointsFieldCache.has(tenantId)) return storyPointsFieldCache.get(tenantId);

    if (tenantId === 'indeed.atlassian.net') {
      storyPointsFieldCache.set(tenantId, 'customfield_10061');
      return 'customfield_10061';
    }

    const fieldId = await jiraService.detectStoryPointsField();
    storyPointsFieldCache.set(tenantId, fieldId);
    return fieldId;
  }

  // Get project keys from board IDs
  async _getProjectKeys(jiraService, boardIds) {
    const keys = new Set();
    for (const boardId of boardIds) {
      try {
        const key = await jiraService.getProjectKeyFromBoard(boardId);
        if (key) keys.add(key);
      } catch (err) {
        console.warn(`Could not get project key for board ${boardId}: ${err.message}`);
      }
    }
    return Array.from(keys);
  }

  // Calculate epic health & progress
  calculateEpicHealth(epic, children, storyPointsField) {
    const total = children.length;
    if (total === 0) {
      return {
        key: epic.key,
        summary: epic.fields.summary,
        status: epic.fields.status?.name || 'Unknown',
        statusCategory: epic.fields.status?.statusCategory?.key || 'undefined',
        priority: epic.fields.priority?.name || 'None',
        labels: epic.fields.labels || [],
        components: (epic.fields.components || []).map(c => c.name),
        fixVersions: (epic.fields.fixVersions || []).map(v => v.name),
        assignee: epic.fields.assignee?.displayName || null,
        created: epic.fields.created,
        updated: epic.fields.updated,
        dueDate: epic.fields.duedate || null,
        parent: epic.fields.parent ? { key: epic.fields.parent.key, summary: epic.fields.parent.fields?.summary } : null,
        totalChildren: 0,
        doneChildren: 0,
        inProgressChildren: 0,
        todoChildren: 0,
        progressPercent: 0,
        totalPoints: 0,
        donePoints: 0,
        pointsProgress: 0,
        health: 'empty',
        healthScore: 0
      };
    }

    let doneCount = 0, inProgressCount = 0, todoCount = 0;
    let totalPoints = 0, donePoints = 0;

    for (const child of children) {
      const category = child.fields.status?.statusCategory?.key || 'new';
      const pts = child.fields[storyPointsField] || 0;
      totalPoints += pts;

      if (category === 'done') {
        doneCount++;
        donePoints += pts;
      } else if (category === 'indeterminate') {
        inProgressCount++;
      } else {
        todoCount++;
      }
    }

    const progressPercent = Math.round((doneCount / total) * 100);
    const pointsProgress = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : progressPercent;

    // Health assessment
    let health = 'on-track';
    let healthScore = 100;

    const epicStatus = epic.fields.status?.statusCategory?.key || 'new';

    // Check if epic is done
    if (epicStatus === 'done') {
      health = 'done';
      healthScore = 100;
    } else {
      // Check due date risk
      if (epic.fields.duedate) {
        const dueDate = new Date(epic.fields.duedate);
        const now = new Date();
        const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

        if (daysUntilDue < 0 && progressPercent < 100) {
          health = 'overdue';
          healthScore = 20;
        } else if (daysUntilDue < 14 && progressPercent < 70) {
          health = 'at-risk';
          healthScore = 40;
        } else if (daysUntilDue < 30 && progressPercent < 50) {
          health = 'at-risk';
          healthScore = 50;
        }
      }

      // Check stalled (no in-progress items, not done)
      if (inProgressCount === 0 && doneCount < total && progressPercent < 100) {
        if (progressPercent > 0) {
          health = 'stalled';
          healthScore = Math.min(healthScore, 30);
        }
      }

      // Low progress weight
      if (progressPercent < 25 && epicStatus === 'indeterminate') {
        healthScore = Math.min(healthScore, 60);
      }
    }

    return {
      key: epic.key,
      summary: epic.fields.summary,
      status: epic.fields.status?.name || 'Unknown',
      statusCategory: epicStatus,
      priority: epic.fields.priority?.name || 'None',
      labels: epic.fields.labels || [],
      components: (epic.fields.components || []).map(c => c.name),
      fixVersions: (epic.fields.fixVersions || []).map(v => v.name),
      assignee: epic.fields.assignee?.displayName || null,
      created: epic.fields.created,
      updated: epic.fields.updated,
      dueDate: epic.fields.duedate || null,
      parent: epic.fields.parent ? { key: epic.fields.parent.key, summary: epic.fields.parent.fields?.summary } : null,
      totalChildren: total,
      doneChildren: doneCount,
      inProgressChildren: inProgressCount,
      todoChildren: todoCount,
      progressPercent,
      totalPoints,
      donePoints,
      pointsProgress,
      health,
      healthScore
    };
  }

  // Aggregate epic metrics for summary
  aggregateEpicMetrics(epicHealthList) {
    const total = epicHealthList.length;
    if (total === 0) return { total: 0 };

    const byHealth = { 'on-track': 0, 'at-risk': 0, 'overdue': 0, 'stalled': 0, 'done': 0, 'empty': 0 };
    const byStatus = {};
    let totalProgress = 0;
    let totalPointsProgress = 0;
    let totalChildren = 0;
    let totalDoneChildren = 0;

    for (const e of epicHealthList) {
      byHealth[e.health] = (byHealth[e.health] || 0) + 1;
      byStatus[e.status] = (byStatus[e.status] || 0) + 1;
      totalProgress += e.progressPercent;
      totalPointsProgress += e.pointsProgress;
      totalChildren += e.totalChildren;
      totalDoneChildren += e.doneChildren;
    }

    return {
      total,
      byHealth,
      byStatus,
      avgProgress: Math.round(totalProgress / total),
      avgPointsProgress: Math.round(totalPointsProgress / total),
      totalChildren,
      totalDoneChildren,
      overallChildProgress: totalChildren > 0 ? Math.round((totalDoneChildren / totalChildren) * 100) : 0
    };
  }

  // Main endpoint: Get epics with health data
  async getEpics(req, res) {
    try {
      const { jiraUrl, email, apiToken, boardIds, forceRefresh = false } = req.body;
      const tenantId = TenantService.extractFromRequest(req);
      const boardIdList = Array.isArray(boardIds) ? boardIds : [boardIds];

      // Check cache
      const cacheKey = cacheService.generateKey(boardIdList.sort().join('-'), 'product-epics', tenantId);
      if (!forceRefresh) {
        const cached = cacheService.get(cacheKey);
        if (cached) {
          return res.json({ success: true, data: cached, cached: true });
        }

        // Check DB cache
        const dbCached = await database.getProductData(boardIdList, 'epics', 30 * 60 * 1000, tenantId);
        if (dbCached && !dbCached.stale) {
          cacheService.set(cacheKey, dbCached.data);
          return res.json({ success: true, data: dbCached.data, cached: true, source: 'database' });
        }
      }

      console.log(`📡 Fetching epics from Jira (tenant: ${tenantId}, boards: ${boardIdList.join(',')})`);
      const jiraService = new JiraService(jiraUrl, email, apiToken);
      const storyPointsField = await this._getStoryPointsField(jiraService, tenantId);

      // Get project keys from boards
      const projectKeys = await this._getProjectKeys(jiraService, boardIdList);
      if (projectKeys.length === 0) {
        return res.json({ success: true, data: { epics: [], summary: { total: 0 }, initiatives: [] } });
      }

      // Fetch epics and initiatives in parallel
      const [epics, initiatives] = await Promise.all([
        jiraService.searchEpics(projectKeys),
        jiraService.searchInitiatives(projectKeys)
      ]);

      // Batch fetch children for all epics
      const epicKeys = epics.map(e => e.key);
      const childrenMap = await jiraService.batchGetEpicChildren(epicKeys);

      // Calculate health for each epic
      const epicHealthList = epics.map(epic => {
        const children = childrenMap.get(epic.key) || [];
        return this.calculateEpicHealth(epic, children, storyPointsField);
      });

      // Aggregate
      const summary = this.aggregateEpicMetrics(epicHealthList);

      // Format initiatives
      const initiativeList = initiatives.map(i => ({
        key: i.key,
        summary: i.fields.summary,
        status: i.fields.status?.name || 'Unknown',
        statusCategory: i.fields.status?.statusCategory?.key || 'new',
        priority: i.fields.priority?.name || 'None',
        assignee: i.fields.assignee?.displayName || null
      }));

      const responseData = {
        epics: epicHealthList,
        summary,
        initiatives: initiativeList,
        projectKeys,
        tenantId
      };

      // Cache
      cacheService.set(cacheKey, responseData);
      await database.saveProductData(boardIdList, 'epics', responseData, tenantId);

      res.json({ success: true, data: responseData, cached: false });
    } catch (error) {
      console.error('Error fetching epics:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Dependencies endpoint
  async getDependencies(req, res) {
    try {
      const { jiraUrl, email, apiToken, boardIds, forceRefresh = false } = req.body;
      const tenantId = TenantService.extractFromRequest(req);
      const boardIdList = Array.isArray(boardIds) ? boardIds : [boardIds];

      // Check cache
      const cacheKey = cacheService.generateKey(boardIdList.sort().join('-'), 'product-deps', tenantId);
      if (!forceRefresh) {
        const cached = cacheService.get(cacheKey);
        if (cached) {
          return res.json({ success: true, data: cached, cached: true });
        }
      }

      const jiraService = new JiraService(jiraUrl, email, apiToken);
      const projectKeys = await this._getProjectKeys(jiraService, boardIdList);

      if (projectKeys.length === 0) {
        return res.json({ success: true, data: { dependencies: [], summary: {} } });
      }

      const epics = await jiraService.searchEpics(projectKeys);
      const epicKeys = epics.map(e => e.key);
      const depMap = await jiraService.getEpicDependencies(epicKeys);

      // Convert Map to serializable array
      const dependencies = [];
      let totalBlocks = 0, totalBlockedBy = 0, totalRelates = 0;

      for (const [key, deps] of depMap.entries()) {
        if (deps.blocks.length > 0 || deps.blockedBy.length > 0 || deps.relatesTo.length > 0) {
          const epic = epics.find(e => e.key === key);
          dependencies.push({
            key,
            summary: epic?.fields?.summary || key,
            status: epic?.fields?.status?.name || 'Unknown',
            ...deps
          });
          totalBlocks += deps.blocks.length;
          totalBlockedBy += deps.blockedBy.length;
          totalRelates += deps.relatesTo.length;
        }
      }

      const responseData = {
        dependencies,
        summary: {
          epicsWithDeps: dependencies.length,
          totalEpics: epicKeys.length,
          totalBlocks,
          totalBlockedBy,
          totalRelates
        }
      };

      cacheService.set(cacheKey, responseData);
      await database.saveProductData(boardIdList, 'dependencies', responseData, tenantId);

      res.json({ success: true, data: responseData, cached: false });
    } catch (error) {
      console.error('Error fetching dependencies:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Discover custom fields for prioritization
  async discoverFields(req, res) {
    try {
      const { jiraUrl, email, apiToken } = req.body;
      const jiraService = new JiraService(jiraUrl, email, apiToken);
      const candidates = await jiraService.discoverCustomFields();

      res.json({ success: true, fields: candidates });
    } catch (error) {
      console.error('Error discovering fields:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

export default EpicMetricsService;
