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

  async getTeamMetrics(jiraUrl, email, apiToken, boardId, sprintCount = 6) {
    const response = await this.client.post('/metrics/team', {
      jiraUrl,
      email,
      apiToken,
      boardId,
      sprintCount
    });
    return response.data;
  }

  async getFlowMetrics(jiraUrl, email, apiToken, boardId, sprintCount = 3) {
    const response = await this.client.post('/metrics/flow', {
      jiraUrl,
      email,
      apiToken,
      boardId,
      sprintCount
    });
    return response.data;
  }
}

export default new ApiService();
