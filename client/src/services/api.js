import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

class ApiService {
  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async testConnection(jiraUrl, email, apiToken) {
    const response = await this.client.post('/jira/test-connection', {
      jiraUrl,
      email,
      apiToken
    });
    return response.data;
  }

  async getBoards(jiraUrl, email, apiToken) {
    const response = await this.client.post('/jira/boards', {
      jiraUrl,
      email,
      apiToken
    });
    return response.data;
  }

  async getSprints(jiraUrl, email, apiToken, boardId) {
    const response = await this.client.post('/jira/sprints', {
      jiraUrl,
      email,
      apiToken,
      boardId
    });
    return response.data;
  }

  async getTeamMetrics(jiraUrl, email, apiToken, boardId, sprintCount = 6, forceRefresh = false, sprintIds = null) {
    const body = {
      jiraUrl,
      email,
      apiToken,
      boardId,
      sprintCount,
      forceRefresh
    };
    if (sprintIds) body.sprintIds = sprintIds;
    const response = await this.client.post('/metrics/team', body);
    return response.data;
  }

  async getFlowMetrics(jiraUrl, email, apiToken, boardId, sprintCount = 6, forceRefresh = false, sprintIds = null) {
    const body = {
      jiraUrl,
      email,
      apiToken,
      boardId,
      sprintCount,
      forceRefresh
    };
    if (sprintIds) body.sprintIds = sprintIds;
    const response = await this.client.post('/metrics/flow', body);
    return response.data;
  }

  // Cached boards (fast, no credentials needed)
  async getCachedBoards() {
    const response = await this.client.get('/jira/boards/cached');
    return response.data;
  }

  // History endpoints
  async getBoardsWithHistory() {
    const response = await this.client.get('/history/boards');
    return response.data;
  }

  async getAllLatestMetrics() {
    const response = await this.client.get('/history/all-latest');
    return response.data;
  }

  async getBoardHistory(boardId) {
    const response = await this.client.get(`/history/board/${boardId}`);
    return response.data;
  }

  async getHistoricalMetrics(id) {
    const response = await this.client.get(`/history/metrics/${id}`);
    return response.data;
  }

  async deleteBoard(boardId) {
    const response = await this.client.delete(`/history/board/${boardId}`);
    return response.data;
  }

  // Capacity metrics
  async getCapacityMetrics(jiraUrl, email, apiToken, boardId, sprintCount = 6, forceRefresh = false, sprintIds = null) {
    const body = { jiraUrl, email, apiToken, boardId, sprintCount, forceRefresh };
    if (sprintIds) body.sprintIds = sprintIds;
    const response = await this.client.post('/metrics/capacity', body);
    return response.data;
  }

  // Releases / Versions endpoints
  async getReleases(jiraUrl, email, apiToken, boardId) {
    const response = await this.client.post('/releases', {
      jiraUrl,
      email,
      apiToken,
      boardId
    });
    return response.data;
  }

  async getReleaseDetails(jiraUrl, email, apiToken, boardId, versionId, versionName, startDate) {
    const response = await this.client.post('/releases/details', {
      jiraUrl,
      email,
      apiToken,
      boardId,
      versionId,
      versionName,
      startDate
    });
    return response.data;
  }

  async getReleaseBurndown(jiraUrl, email, apiToken, boardId, versionName, startDate, endDate) {
    const response = await this.client.post('/releases/burndown', {
      jiraUrl,
      email,
      apiToken,
      boardId,
      versionName,
      startDate,
      endDate
    });
    return response.data;
  }
}

export default new ApiService();
