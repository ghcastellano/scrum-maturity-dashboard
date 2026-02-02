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
      const maxResults = 100;
      let hasMore = true;

      // Fetch all boards with pagination
      while (hasMore) {
        const response = await this.agileApi.get('/board', {
          params: {
            type: 'scrum',
            startAt,
            maxResults
          }
        });

        allBoards = allBoards.concat(response.data.values);
        startAt += maxResults;
        hasMore = !response.data.isLast;

        // Safety limit to prevent infinite loops
        if (allBoards.length >= 2000) {
          break;
        }
      }

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
      return response.data.values;
    } catch (error) {
      throw new Error(`Failed to fetch sprints: ${error.message}`);
    }
  }

  // Get issues for a sprint
  async getSprintIssues(sprintId) {
    try {
      const response = await this.api.get('/search', {
        params: {
          jql: `sprint = ${sprintId}`,
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
}

export default JiraService;
