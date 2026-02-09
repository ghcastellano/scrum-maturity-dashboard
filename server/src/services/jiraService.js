import axios from 'axios';

class JiraService {
  constructor(baseUrl, email, apiToken) {
    this.baseUrl = baseUrl;
    this.auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

    // Agile API for boards and sprints
    this.agileApi = axios.create({
      baseURL: `${baseUrl}/rest/agile/1.0`,
      headers: {
        'Authorization': `Basic ${this.auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    // Standard API for issues and fields
    this.api = axios.create({
      baseURL: `${baseUrl}/rest/api/3`,
      headers: {
        'Authorization': `Basic ${this.auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  }

  // Get all boards (paginated to fetch all)
  async getBoards() {
    try {
      let allBoards = [];
      let startAt = 0;
      const maxResults = 50; // Jira API standard limit per page
      let totalBoards = 0;
      let fetchedThisRound = 0;

      // Fetch all boards with pagination
      do {
        const response = await this.agileApi.get('/board', {
          params: {
            type: 'scrum',
            startAt,
            maxResults
          }
        });

        fetchedThisRound = response.data.values ? response.data.values.length : 0;

        if (fetchedThisRound > 0) {
          allBoards = allBoards.concat(response.data.values);
        }

        totalBoards = response.data.total || 0;
        startAt += fetchedThisRound;

        console.log(`Fetched ${allBoards.length} of ${totalBoards} boards...`);

        // Continue while we have more boards to fetch
      } while (fetchedThisRound > 0 && allBoards.length < totalBoards && allBoards.length < 3000);

      console.log(`✓ Fetched ${allBoards.length} boards total`);

      // Sort boards alphabetically by name
      allBoards.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      return allBoards;
    } catch (error) {
      throw new Error(`Failed to fetch boards: ${error.message}`);
    }
  }

  // Get a single board by ID
  async getBoard(boardId) {
    try {
      const response = await this.agileApi.get(`/board/${boardId}`);
      return response.data;
    } catch (error) {
      console.warn(`Failed to fetch board ${boardId}:`, error.message);
      return null;
    }
  }

  // Get sprints for a board (paginated to get ALL sprints)
  async getSprints(boardId, state = 'closed') {
    try {
      let allSprints = [];
      let startAt = 0;
      const maxResults = 50;
      let hasMore = true;

      while (hasMore) {
        const response = await this.agileApi.get(`/board/${boardId}/sprint`, {
          params: { state, startAt, maxResults }
        });

        const sprints = response.data.values || [];
        allSprints = allSprints.concat(sprints);

        // Check if there are more pages
        hasMore = sprints.length === maxResults;
        startAt += sprints.length;
      }

      console.log(`\n🔍 Board ${boardId} - Fetched ${allSprints.length} ${state} sprints`);

      // Deduplicate sprints with the same name (keep the one with dates/most issues)
      const sprintsByName = new Map();
      for (const sprint of allSprints) {
        const existing = sprintsByName.get(sprint.name);
        if (!existing) {
          sprintsByName.set(sprint.name, sprint);
        } else {
          // Keep the one that has actual dates, or the one with the higher ID (more recent)
          const existingHasDates = existing.startDate && existing.endDate;
          const newHasDates = sprint.startDate && sprint.endDate;
          if (newHasDates && !existingHasDates) {
            sprintsByName.set(sprint.name, sprint);
          } else if (newHasDates && existingHasDates && sprint.id > existing.id) {
            sprintsByName.set(sprint.name, sprint);
          }
        }
      }
      const dedupedSprints = Array.from(sprintsByName.values());
      if (dedupedSprints.length < allSprints.length) {
        console.log(`  Deduplicated: ${allSprints.length} → ${dedupedSprints.length} sprints (removed ${allSprints.length - dedupedSprints.length} duplicates)`);
      }

      // Sort sprints by end date, most recent first
      dedupedSprints.sort((a, b) => {
        const dateA = a.endDate ? new Date(a.endDate) : new Date(0);
        const dateB = b.endDate ? new Date(b.endDate) : new Date(0);
        return dateB - dateA;
      });

      console.log(`Most recent 3 sprints:`);
      dedupedSprints.slice(0, 3).forEach(s => {
        console.log(`  - ${s.name} (ID: ${s.id}) - End: ${s.endDate?.split('T')[0] || 'NO END DATE'}`);
      });

      return dedupedSprints;
    } catch (error) {
      throw new Error(`Failed to fetch sprints: ${error.message}`);
    }
  }

  // Get issues for a sprint
  async getSprintIssues(sprintId) {
    try {
      // Use Agile API endpoint for sprint issues
      // Request ALL fields using '*all' to include all custom fields
      const response = await this.agileApi.get(`/sprint/${sprintId}/issue`, {
        params: {
          maxResults: 1000,
          fields: '*all'
        }
      });
      return response.data.issues;
    } catch (error) {
      throw new Error(`Failed to fetch sprint issues: ${error.message}`);
    }
  }

  // Get issue changelog for cycle time calculation
  async getIssueChangelog(issueKey) {
    try {
      const response = await this.api.get(`/issue/${issueKey}/changelog`);
      return response.data.values;
    } catch (error) {
      throw new Error(`Failed to fetch issue changelog: ${error.message}`);
    }
  }

  // Get board configuration
  async getBoardConfiguration(boardId) {
    try {
      const response = await this.agileApi.get(`/board/${boardId}/configuration`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch board configuration: ${error.message}`);
    }
  }

  // Get custom fields to identify story points field
  async getFields() {
    try {
      const response = await this.api.get('/field');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch fields: ${error.message}`);
    }
  }

  // Search issues with JQL
  async searchIssues(jql, fields = [], maxResults = 100) {
    try {
      const response = await this.api.get('/search', {
        params: {
          jql,
          fields: fields.join(','),
          maxResults
        }
      });
      return response.data.issues;
    } catch (error) {
      throw new Error(`Failed to search issues: ${error.message}`);
    }
  }

  // Get backlog issues for a board (direct endpoint, no JQL)
  async getBacklogIssues(boardId) {
    try {
      const response = await this.agileApi.get(`/board/${boardId}/backlog`, {
        params: {
          maxResults: 500,
          fields: '*all'
        }
      });
      return response.data.issues;
    } catch (error) {
      throw new Error(`Failed to fetch backlog issues: ${error.message}`);
    }
  }

  // Get team members (users assigned to issues in a board)
  async getBoardTeamMembers(boardId) {
    try {
      const issues = await this.searchIssues(
        `board = ${boardId} AND assignee is not EMPTY`,
        ['assignee'],
        1000
      );

      const uniqueUsers = new Map();
      issues.forEach(issue => {
        if (issue.fields.assignee) {
          const user = issue.fields.assignee;
          uniqueUsers.set(user.accountId, {
            accountId: user.accountId,
            displayName: user.displayName,
            emailAddress: user.emailAddress
          });
        }
      });

      return Array.from(uniqueUsers.values());
    } catch (error) {
      throw new Error(`Failed to fetch team members: ${error.message}`);
    }
  }

  // Diagnostic: Find Story Points field
  async findStoryPointsField() {
    try {
      const fields = await this.getFields();

      // Common story points field names
      const storyPointsKeywords = ['story points', 'storypoints', 'points', 'estimate', 'sp'];

      const keywordCandidates = fields.filter(field => {
        const name = (field.name || '').toLowerCase();
        return storyPointsKeywords.some(keyword => name.includes(keyword));
      });

      // Also find all number-type custom fields as potential candidates
      const numberFields = fields.filter(field => {
        const isCustomField = field.id && field.id.startsWith('customfield_');
        const isNumber = field.schema?.type === 'number';
        return isCustomField && isNumber;
      });

      console.log('\n📊 Story Points Field Candidates (by keyword):');
      if (keywordCandidates.length > 0) {
        keywordCandidates.forEach(field => {
          console.log(`  - ${field.id}: ${field.name} (${field.schema?.type || 'unknown type'})`);
        });
      } else {
        console.log('  No fields found with keywords: points, estimate, sp');
      }

      console.log('\n🔢 All numeric custom fields (potential candidates):');
      numberFields.slice(0, 20).forEach(field => {
        console.log(`  - ${field.id}: ${field.name}`);
      });

      return keywordCandidates.length > 0 ? keywordCandidates : numberFields;
    } catch (error) {
      throw new Error(`Failed to find story points field: ${error.message}`);
    }
  }

  // Diagnostic: Get sample issue with all fields
  async getSampleIssue(sprintId) {
    try {
      const issues = await this.getSprintIssues(sprintId);

      if (issues.length === 0) {
        return null;
      }

      console.log(`\n📝 Sample Issues from Sprint ${sprintId} (showing first 3):`);

      issues.slice(0, 3).forEach((issue, idx) => {
        console.log(`\n${idx + 1}. Issue: ${issue.key} - ${issue.fields.summary}`);
        console.log(`   Status: ${issue.fields.status.name}`);

        // Show only numeric custom fields
        const numericFields = [];
        Object.keys(issue.fields).forEach(fieldKey => {
          if (fieldKey.startsWith('customfield_')) {
            const value = issue.fields[fieldKey];
            if (typeof value === 'number' && value > 0) {
              numericFields.push(`${fieldKey}=${value}`);
            }
          }
        });

        if (numericFields.length > 0) {
          console.log(`   Numeric fields: ${numericFields.join(', ')}`);
        } else {
          console.log(`   No numeric custom fields found`);
        }
      });

      return issues[0];
    } catch (error) {
      throw new Error(`Failed to get sample issue: ${error.message}`);
    }
  }

  // =====================
  // RELEASES / VERSIONS
  // =====================

  // Get project key from board
  async getProjectKeyFromBoard(boardId) {
    try {
      const config = await this.getBoardConfiguration(boardId);
      console.log(`[getProjectKeyFromBoard] Board ${boardId} location:`, config.location);

      // Try to get from board location first (most reliable)
      if (config.location?.projectKey) {
        console.log(`[getProjectKeyFromBoard] Using location.projectKey: ${config.location.projectKey}`);
        return config.location.projectKey;
      }

      // Fallback: Board filter contains project info
      const filterResponse = await this.api.get(`/filter/${config.filter.id}`);
      const jql = filterResponse.data.jql || '';
      console.log(`[getProjectKeyFromBoard] Filter JQL: ${jql}`);

      // Try different patterns to extract project key
      // Pattern 1: project = "KEY" or project = KEY or project = 'KEY'
      let match = jql.match(/project\s*=\s*["']?([A-Za-z0-9_-]+)["']?/i);
      if (match) {
        console.log(`[getProjectKeyFromBoard] Extracted from JQL (=): ${match[1]}`);
        return match[1];
      }

      // Pattern 2: project IN ("KEY") or project IN (KEY, KEY2)
      match = jql.match(/project\s+IN\s*\(\s*["']?([A-Za-z0-9_-]+)["']?/i);
      if (match) {
        console.log(`[getProjectKeyFromBoard] Extracted from JQL (IN): ${match[1]}`);
        return match[1];
      }

      throw new Error(`Could not determine project key from board. JQL: ${jql}`);
    } catch (error) {
      throw new Error(`Failed to get project key: ${error.message}`);
    }
  }

  // Get all versions/releases for a project
  async getProjectVersions(projectKey, status = null) {
    try {
      const params = { maxResults: 100, orderBy: '-releaseDate' };
      if (status) params.status = status;

      const response = await this.api.get(`/project/${projectKey}/version`, { params });
      return response.data.values || response.data || [];
    } catch (error) {
      throw new Error(`Failed to fetch versions: ${error.message}`);
    }
  }

  // Escape version name for JQL queries
  escapeJqlString(str) {
    if (!str) return str;
    // Escape special JQL characters
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  // Get issues in a specific version with changelog
  async getVersionIssues(projectKey, versionId, versionName) {
    try {
      let allIssues = [];
      let startAt = 0;
      const maxResults = 100;
      const escapedVersionName = this.escapeJqlString(versionName);

      // First, try without project filter (version name should be unique enough)
      // This handles cases where board spans multiple projects
      const jqlWithProject = `project = "${projectKey}" AND fixVersion = "${escapedVersionName}"`;
      const jqlVersionOnly = `fixVersion = "${escapedVersionName}"`;

      console.log(`[getVersionIssues] Trying JQL: ${jqlWithProject}`);

      // Fetch all issues with pagination
      while (true) {
        const response = await this.api.get('/search', {
          params: {
            jql: jqlWithProject,
            fields: 'summary,status,issuetype,priority,assignee,created,updated,fixVersions,issuelinks,customfield_10061',
            expand: 'changelog',
            startAt,
            maxResults
          }
        });

        const issues = response.data.issues || [];
        allIssues = allIssues.concat(issues);
        console.log(`[getVersionIssues] Found ${issues.length} issues (total: ${allIssues.length})`);

        if (issues.length < maxResults) break;
        startAt += maxResults;
      }

      // If no issues found with project filter, try without it
      if (allIssues.length === 0) {
        console.log(`[getVersionIssues] No issues found with project filter, trying: ${jqlVersionOnly}`);
        const response = await this.api.get('/search', {
          params: {
            jql: jqlVersionOnly,
            fields: 'summary,status,issuetype,priority,assignee,created,updated,fixVersions,issuelinks,customfield_10061',
            expand: 'changelog',
            maxResults: 200
          }
        });
        allIssues = response.data.issues || [];
        console.log(`[getVersionIssues] Found ${allIssues.length} issues without project filter`);
      }

      return allIssues;
    } catch (error) {
      console.error(`[getVersionIssues] JQL query failed for version "${versionName}":`, error.response?.data || error.message);
      throw new Error(`Failed to fetch version issues: ${error.message}`);
    }
  }

  // Get detailed release data with issue history analysis
  async getReleaseDetails(projectKey, versionId, versionName, startDate) {
    try {
      console.log(`[getReleaseDetails] Starting for version "${versionName}" (project: ${projectKey})`);

      let issues = [];
      try {
        issues = await this.getVersionIssues(projectKey, versionId, versionName);
        console.log(`[getReleaseDetails] Found ${issues.length} issues in version`);
      } catch (issueErr) {
        console.error(`[getReleaseDetails] Failed to fetch issues:`, issueErr.message);
        // Return empty result instead of throwing
        return {
          issues: [],
          addedBeforeStart: [],
          addedAfterStart: [],
          removedIssues: [],
          metrics: {
            totalIssues: 0,
            completedIssues: 0,
            inProgressIssues: 0,
            todoIssues: 0,
            completionPercentage: 0,
            totalStoryPoints: 0,
            completedStoryPoints: 0,
            storyPointsCompletion: 0
          }
        };
      }

      const releaseStartDate = startDate ? new Date(startDate) : null;

      const issueDetails = [];
      const addedBeforeStart = [];
      const addedAfterStart = [];
      const removedIssues = [];

      for (const issue of issues) {
        const changelog = issue.changelog?.histories || [];

        // Find when issue was added to this version
        let addedToVersionDate = null;
        let wasAddedToVersion = false;

        for (const history of changelog) {
          for (const item of history.items) {
            if (item.field === 'Fix Version' && item.toString?.includes(versionName)) {
              addedToVersionDate = new Date(history.created);
              wasAddedToVersion = true;
              break;
            }
          }
          if (wasAddedToVersion) break;
        }

        // If no changelog entry found, assume it was added at creation
        if (!addedToVersionDate) {
          addedToVersionDate = new Date(issue.fields.created);
        }

        // Get dependencies (issue links)
        const dependencies = (issue.fields.issuelinks || []).map(link => ({
          type: link.type?.name || 'Related',
          direction: link.inwardIssue ? 'inward' : 'outward',
          linkedIssue: link.inwardIssue || link.outwardIssue,
          description: link.inwardIssue ? link.type?.inward : link.type?.outward
        }));

        const detail = {
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status?.name || 'Unknown',
          statusCategory: issue.fields.status?.statusCategory?.key || 'undefined',
          type: issue.fields.issuetype?.name || 'Unknown',
          priority: issue.fields.priority?.name || 'None',
          assignee: issue.fields.assignee?.displayName || 'Unassigned',
          storyPoints: issue.fields.customfield_10061 || 0,
          addedToVersionDate: addedToVersionDate.toISOString(),
          dependencies,
          created: issue.fields.created,
          updated: issue.fields.updated
        };

        issueDetails.push(detail);

        // Categorize by when added
        if (releaseStartDate) {
          if (addedToVersionDate < releaseStartDate) {
            addedBeforeStart.push(detail);
          } else {
            addedAfterStart.push(detail);
          }
        }
      }

      // Find issues that were removed from this version (search changelog of all project issues)
      // This is expensive and the JQL syntax may not be supported in all Jira instances
      // So we make this completely optional - errors here won't break the response
      console.log(`[getReleaseDetails] Attempting to fetch removed issues...`);
      try {
        const escapedVersionName = this.escapeJqlString(versionName);
        const recentlyChangedResponse = await this.api.get('/search', {
          params: {
            jql: `project = "${projectKey}" AND fixVersion changed FROM "${escapedVersionName}" ORDER BY updated DESC`,
            fields: 'summary,status,issuetype,fixVersions',
            maxResults: 50
          }
        });

        for (const issue of (recentlyChangedResponse.data.issues || [])) {
          const currentVersions = (issue.fields.fixVersions || []).map(v => v.name);
          removedIssues.push({
            key: issue.key,
            summary: issue.fields.summary,
            status: issue.fields.status?.name || 'Unknown',
            type: issue.fields.issuetype?.name || 'Unknown',
            movedTo: currentVersions.length > 0 ? currentVersions.join(', ') : 'No version'
          });
        }
        console.log(`[getReleaseDetails] Found ${removedIssues.length} removed issues`);
      } catch (err) {
        // JQL "fixVersion changed FROM" may not be supported - this is OK
        console.warn('[getReleaseDetails] Could not fetch removed issues (this is OK):', err.message);
      }

      // Calculate metrics
      const totalIssues = issueDetails.length;
      const completedIssues = issueDetails.filter(i => i.statusCategory === 'done').length;
      const inProgressIssues = issueDetails.filter(i => i.statusCategory === 'indeterminate').length;
      const todoIssues = issueDetails.filter(i => i.statusCategory === 'new' || i.statusCategory === 'undefined').length;
      const totalStoryPoints = issueDetails.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
      const completedStoryPoints = issueDetails.filter(i => i.statusCategory === 'done').reduce((sum, i) => sum + (i.storyPoints || 0), 0);

      return {
        issues: issueDetails,
        addedBeforeStart,
        addedAfterStart,
        removedIssues,
        metrics: {
          totalIssues,
          completedIssues,
          inProgressIssues,
          todoIssues,
          completionPercentage: totalIssues > 0 ? Math.round((completedIssues / totalIssues) * 100) : 0,
          totalStoryPoints,
          completedStoryPoints,
          storyPointsCompletion: totalStoryPoints > 0 ? Math.round((completedStoryPoints / totalStoryPoints) * 100) : 0
        }
      };
    } catch (error) {
      throw new Error(`Failed to get release details: ${error.message}`);
    }
  }

  // Get burndown data for a version
  async getVersionBurndown(projectKey, versionName, startDate, endDate) {
    try {
      console.log(`[getVersionBurndown] Starting for version "${versionName}"`);

      const releaseStart = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const releaseEnd = endDate ? new Date(endDate) : new Date();

      // Limit burndown to max 90 days to avoid very long calculations
      const maxDays = 90;
      const dayMs = 24 * 60 * 60 * 1000;
      if ((releaseEnd - releaseStart) / dayMs > maxDays) {
        console.log(`[getVersionBurndown] Limiting burndown to last ${maxDays} days`);
        releaseStart.setTime(releaseEnd.getTime() - (maxDays * dayMs));
      }

      // Get all issues that were ever in this version
      let issues = [];
      try {
        issues = await this.getVersionIssues(projectKey, null, versionName);
        console.log(`[getVersionBurndown] Found ${issues.length} issues`);
      } catch (err) {
        console.error(`[getVersionBurndown] Failed to fetch issues:`, err.message);
        return []; // Return empty burndown
      }

      // Build daily snapshots
      const burndownData = [];
      let currentDate = new Date(releaseStart);

      while (currentDate <= releaseEnd) {
        let scopePoints = 0;
        let completedPoints = 0;

        for (const issue of issues) {
          const changelog = issue.changelog?.histories || [];
          const storyPoints = issue.fields.customfield_10061 || 0;

          // Check if issue was in scope at this date
          let inVersion = false;
          let isCompleted = false;
          const issueCreated = new Date(issue.fields.created);

          // Start with assumption: if created before date and has version, it was in scope
          if (issueCreated <= currentDate) {
            // Check changelog for version changes
            let lastVersionStatus = issue.fields.fixVersions?.some(v => v.name === versionName);

            for (const history of changelog) {
              const historyDate = new Date(history.created);
              if (historyDate > currentDate) break;

              for (const item of history.items) {
                if (item.field === 'Fix Version') {
                  if (item.toString?.includes(versionName)) {
                    lastVersionStatus = true;
                  } else if (item.fromString?.includes(versionName)) {
                    lastVersionStatus = false;
                  }
                }
                if (item.field === 'status') {
                  // Check if moved to done category
                  isCompleted = ['Done', 'Closed', 'Resolved'].some(s =>
                    item.toString?.toLowerCase().includes(s.toLowerCase())
                  );
                }
              }
            }

            inVersion = lastVersionStatus;
          }

          if (inVersion) {
            scopePoints += storyPoints;
            if (isCompleted) {
              completedPoints += storyPoints;
            }
          }
        }

        burndownData.push({
          date: currentDate.toISOString().split('T')[0],
          scopePoints,
          completedPoints,
          remainingPoints: scopePoints - completedPoints
        });

        currentDate = new Date(currentDate.getTime() + dayMs);
      }

      return burndownData;
    } catch (error) {
      throw new Error(`Failed to get version burndown: ${error.message}`);
    }
  }
}

export default JiraService;
