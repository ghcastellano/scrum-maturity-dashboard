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

  // Get sprints for a board
  async getSprints(boardId, state = 'closed') {
    try {
      const response = await this.agileApi.get(`/board/${boardId}/sprint`, {
        params: { state, maxResults: 50 }
      });

      const sprints = response.data.values;

      console.log(`\n🔍 Board ${boardId} - Raw Sprints from API (total: ${sprints.length}):`);
      console.log(`First 3 sprints (before sorting):`);
      sprints.slice(0, 3).forEach(s => {
        console.log(`  - ${s.name} (ID: ${s.id}) - End: ${s.endDate || 'NO END DATE'} - State: ${s.state}`);
      });

      // Sort sprints by end date, most recent first
      sprints.sort((a, b) => {
        const dateA = a.endDate ? new Date(a.endDate) : new Date(0);
        const dateB = b.endDate ? new Date(b.endDate) : new Date(0);
        return dateB - dateA; // Descending order (newest first)
      });

      console.log(`\nFirst 3 sprints (after sorting by endDate DESC):`);
      sprints.slice(0, 3).forEach(s => {
        console.log(`  - ${s.name} (ID: ${s.id}) - End: ${s.endDate || 'NO END DATE'}`);
      });

      // Check for sprints without endDate
      const sprintsWithoutEndDate = sprints.filter(s => !s.endDate);
      if (sprintsWithoutEndDate.length > 0) {
        console.log(`⚠️  WARNING: ${sprintsWithoutEndDate.length} sprints without endDate!`);
      }

      return sprints;
    } catch (error) {
      throw new Error(`Failed to fetch sprints: ${error.message}`);
    }
  }

  // Get issues for a sprint
  async getSprintIssues(sprintId) {
    try {
      // Use Agile API endpoint for sprint issues
      const response = await this.agileApi.get(`/sprint/${sprintId}/issue`, {
        params: {
          maxResults: 1000,
          fields: 'summary,status,issuetype,created,resolutiondate,customfield_10016,assignee,priority,parent,fixVersions'
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
}

export default JiraService;
