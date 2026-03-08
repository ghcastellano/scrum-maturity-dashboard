// Tenant isolation service
// Extracts tenant identifier from Jira URL to isolate data between companies

class TenantService {
  // Extract tenant ID from Jira URL
  // e.g., "https://indeed.atlassian.net/" -> "indeed.atlassian.net"
  // e.g., "https://uolinc.atlassian.net" -> "uolinc.atlassian.net"
  static extractTenantId(jiraUrl) {
    if (!jiraUrl) return null;
    try {
      const url = new URL(jiraUrl.endsWith('/') ? jiraUrl : jiraUrl + '/');
      return url.hostname.toLowerCase();
    } catch {
      // Fallback: try to extract hostname manually
      const match = jiraUrl.match(/(?:https?:\/\/)?([^\/\s]+)/i);
      return match ? match[1].toLowerCase() : null;
    }
  }

  // Extract tenant from request body (most POST endpoints send jiraUrl)
  static extractFromRequest(req) {
    // POST body
    if (req.body?.jiraUrl) {
      return TenantService.extractTenantId(req.body.jiraUrl);
    }
    // Query param (for GET endpoints)
    if (req.query?.tenant) {
      return req.query.tenant;
    }
    // Header (fallback)
    if (req.headers['x-tenant-id']) {
      return req.headers['x-tenant-id'];
    }
    return null;
  }

  // Detect locale based on Jira URL / tenant
  // Returns 'pt-BR' for Brazilian companies, 'en' otherwise
  static detectLocale(tenantId) {
    if (!tenantId) return 'en';
    // Known Brazilian tenants
    const brTenants = ['uolinc.atlassian.net'];
    // Also check for common Brazilian domain patterns
    if (brTenants.includes(tenantId) || tenantId.includes('.com.br')) {
      return 'pt-BR';
    }
    return 'en';
  }
}

export default TenantService;
