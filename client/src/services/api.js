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
    // Tenant ID set after login (extracted from Jira URL)
    this.tenantId = null;
  }

  // Set tenant for all subsequent requests
  setTenant(tenantId) {
    this.tenantId = tenantId;
  }

  // Helper: append tenant query param to GET URLs
  _withTenant(url) {
    if (!this.tenantId) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}tenant=${encodeURIComponent(this.tenantId)}`;
  }

  async testConnection(jiraUrl, email, apiToken) {
    const response = await this.client.post('/jira/test-connection', {
      jiraUrl,
      email,
      apiToken
    });
    return response.data;
  }

  async getBoards(jiraUrl, email, apiToken, forceRefresh = false) {
    const response = await this.client.post('/jira/boards', {
      jiraUrl,
      email,
      apiToken,
      forceRefresh
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

  // Cached boards (tenant-scoped)
  async getCachedBoards() {
    const response = await this.client.get(this._withTenant('/jira/boards/cached'));
    return response.data;
  }

  // History endpoints (all tenant-scoped)
  async getBoardsWithHistory() {
    const response = await this.client.get(this._withTenant('/history/boards'));
    return response.data;
  }

  async getAllLatestMetrics() {
    const response = await this.client.get(this._withTenant('/history/all-latest'));
    return response.data;
  }

  async getBoardHistory(boardId) {
    const response = await this.client.get(this._withTenant(`/history/board/${boardId}`));
    return response.data;
  }

  async getHistoricalMetrics(id) {
    const response = await this.client.get(this._withTenant(`/history/metrics/${id}`));
    return response.data;
  }

  async deleteBoard(boardId) {
    const response = await this.client.delete(this._withTenant(`/history/board/${boardId}`));
    return response.data;
  }

}

export default new ApiService();
