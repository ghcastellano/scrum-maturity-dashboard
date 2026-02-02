# Scrum Maturity Dashboard - User Documentation

## Table of Contents
1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [How to Use the Application](#how-to-use-the-application)
4. [Understanding Maturity Levels](#understanding-maturity-levels)
5. [Metrics Explained](#metrics-explained)
6. [How Data is Collected](#how-data-is-collected)
7. [Technical Architecture](#technical-architecture)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The **Scrum Maturity Dashboard** is a web application that analyzes Scrum team performance by connecting to Jira and evaluating key metrics across three pillars:

1. **Delivery Predictability** - How well the team commits and delivers
2. **Flow & Quality** - How efficiently work moves through the system
3. **Team Ownership & Execution** - How well the team plans and maintains their backlog

Based on these metrics, the application determines the team's maturity level and provides actionable recommendations for improvement.

### Key Features
- **Automated Jira Integration** - Securely connects to your Jira instance
- **Multi-Team Support** - Analyze multiple Scrum boards simultaneously
- **Real-time Analysis** - Fetches and analyzes the last 6 closed sprints
- **Intelligent Caching** - 30-minute cache to reduce API calls and improve performance
- **Visual Analytics** - Interactive charts and graphs for easy interpretation
- **Maturity Assessment** - Automated classification into 3 maturity levels with specific recommendations

---

## Getting Started

### Prerequisites
To use this application, you need:
- A Jira Cloud account with Scrum boards
- Jira API credentials (email + API token)
- Access to Scrum boards you want to analyze

### Obtaining Jira API Token

1. Log in to your Atlassian account at https://id.atlassian.com
2. Navigate to **Security** → **API tokens**
3. Click **Create API token**
4. Give it a descriptive name (e.g., "Scrum Maturity Dashboard")
5. Copy the generated token and save it securely

⚠️ **Security Note:** Never share your API token. The application stores credentials only in your browser's memory during the session.

### Accessing the Application

1. Open the application URL in your web browser
2. You will see the login screen requesting:
   - **Jira URL**: Your Jira instance URL (e.g., `https://yourcompany.atlassian.net`)
   - **Email**: Your Jira account email
   - **API Token**: The token you generated

---

## How to Use the Application

### Step 1: Connect to Jira

1. Enter your **Jira URL** (without trailing slash)
   - Example: `https://yourcompany.atlassian.net`
2. Enter your **Jira email address**
3. Paste your **API Token**
4. Click **Test Connection**

The application will verify your credentials and display the number of Scrum boards found.

### Step 2: Select Boards

After successful connection, you'll see a list of all available Scrum boards. You can:
- Select **single board** for focused analysis
- Select **multiple boards** to compare teams
- Use the search function to quickly find specific boards

Boards are displayed with their names (sorted alphabetically) for easy identification.

### Step 3: View Dashboard

Once you select boards and click **Continue**, the dashboard loads with:

#### Header Section
- **Team Maturity Level Badge** - Shows current maturity level (1, 2, or 3)
- **Sprints Analyzed** - Number of closed sprints included in analysis
- **Refresh Button** - Force refresh from Jira (bypasses cache)
- **Board Selector** - Switch between selected boards if analyzing multiple teams

#### Key Metrics Overview
Four key performance indicators displayed at the top:
1. **Avg Sprint Goal Attainment** - Percentage of committed story points completed
2. **Avg Rollover Rate** - Percentage of work carried over to next sprint
3. **Avg Hit Rate** - Percentage of all issues (with/without points) completed
4. **Backlog Health Score** - Overall readiness of backlog items

#### Maturity Assessment Card
Shows:
- **Current maturity level** with color-coded badge
- **Characteristics** - Current metrics that define the level
- **Support Model** - Recommended Scrum Manager involvement
- **Recommendations** - Specific actions to improve

#### Detailed Analytics

**Pillar 1: Delivery Predictability**
- Sprint Goal Attainment trend chart
- Rollover Rate trend chart
- Sprint Hit Rate bar chart
- Mid-Sprint Additions list

**Pillar 2: Flow & Quality**
- Average Cycle Time by issue type (Story, Bug, Task)

**Pillar 3: Team Ownership & Execution**
- Backlog Health horizontal bar chart
- Detailed backlog metrics cards

### Step 4: Refresh Data

The application caches data for **30 minutes** to improve performance. You'll see a **"Cached data"** indicator when viewing cached results.

To fetch fresh data from Jira:
1. Click the **"Refresh from Jira"** button
2. Wait for the application to re-fetch and re-analyze all data
3. Review updated metrics

---

## Understanding Maturity Levels

The application classifies teams into three maturity levels based on sustained performance across multiple sprints.

### Level 1: Assisted Scrum (Scrum Manager Required)

**Characteristics:**
- High rollover rate (>25%)
- Low sprint goal attainment (<50%)
- Poor backlog health (<50%)
- High mid-sprint scope changes (>25%)

**What This Means:**
The team is still establishing basic Scrum practices and requires dedicated Scrum Manager support to build foundational disciplines.

**Typical Challenges:**
- Inconsistent sprint planning
- Frequent scope changes during sprints
- Poor backlog refinement
- Low predictability

**Recommended Actions:**
- Establish consistent operating cadence
- Improve backlog readiness before sprint planning
- Reduce scope churn through better planning
- Coach team on ownership behaviors
- Introduce visible metrics and patterns

### Level 2: Supported Scrum (Conditional Support)

**Characteristics:**
- Moderate rollover rate (10-20%)
- Good sprint goal attainment (60-70%)
- Improving backlog health (50-80%)
- Manageable scope changes (10-25%)

**What This Means:**
The team demonstrates improving performance but benefits from periodic Scrum Manager support for pattern recognition and continuous improvement.

**Support Model:**
Shared Scrum Manager with time-bound engagements (1-2 sprints per month)

**Recommended Actions:**
- Pattern recognition (identify last-minute rushes, WIP aging)
- Coach Product Owner on backlog ownership
- Enable team-led ceremonies
- Drive execution of retrospective action items
- Monitor for regression

### Level 3: Self-Managed Scrum (Scrum Manager Optional)

**Characteristics:**
- Low rollover rate (<15%)
- High sprint goal attainment (>70%)
- Excellent backlog health (>80%)
- Minimal scope changes (<10%)

**What This Means:**
The team operates independently with excellent delivery predictability, strong ownership, and mature practices. Scrum Manager support is optional.

**Entry Criteria:**
Metrics must be sustained for 3-4 consecutive sprints to ensure stability, not a temporary spike.

**Recommended Actions:**
- Continue excellence in delivery
- Focus on continuous improvement
- Share best practices with other teams
- Quarterly health checks recommended
- Run ceremonies independently
- Resolve blockers within the team

---

## Metrics Explained

### Delivery Predictability Metrics

#### 1. Sprint Goal Attainment
**Definition:** Percentage of committed story points that were completed by sprint end.

**Formula:** `(Completed Story Points / Committed Story Points) × 100`

**How It's Calculated:**
- Sum all story points from issues in the sprint
- Sum story points from issues with status = "Done"
- Calculate percentage

**Target:** >70% for Level 3

**Why It Matters:** Indicates how well the team estimates and commits to achievable work.

---

#### 2. Rollover Rate
**Definition:** Percentage of incomplete work that carries over to the next sprint.

**Formula:** `(Issues rolled to next sprint / Total issues in sprint) × 100`

**How It's Calculated:**
- Identify issues present in both current sprint and next sprint
- Exclude issues that were completed (status = Done)
- Calculate as percentage of total sprint issues

**Target:** <10-15% for Level 3

**Why It Matters:** High rollover indicates poor estimation, scope creep, or blocked work.

---

#### 3. Sprint Hit Rate
**Definition:** Percentage of ALL issues (regardless of story points) marked as Done by sprint end.

**Formula:** `(Completed Issues / Total Issues) × 100`

**How It's Calculated:**
- Count all issues in sprint (including those without story points)
- Count issues with status = "Done"
- Calculate percentage

**Why It Matters:** Provides a count-based view of completion, complementing the point-based Sprint Goal Attainment metric.

---

#### 4. Mid-Sprint Additions
**Definition:** Number and percentage of issues added to the sprint after it started.

**How It's Calculated:**
- Compare each issue's creation date to sprint start date
- Count issues created AFTER sprint started
- Calculate as percentage of total sprint issues

**Target:** <10% for Level 3

**Why It Matters:** High mid-sprint additions indicate poor planning or reactive work patterns.

---

### Flow & Quality Metrics

#### 5. Cycle Time
**Definition:** Time (in days) from when work starts ("In Progress") until it's completed ("Closed").

**How It's Calculated:**
1. Parse issue changelog for status transitions
2. Find first transition TO "IN PROGRESS" or "In Progress"
3. Find subsequent transition TO "CLOSED" or "Closed"
4. Calculate time difference in hours, convert to days

**Calculated by Issue Type:**
- Stories
- Bugs
- Tasks

**Why It Matters:** Shorter cycle times indicate efficient workflow and fewer bottlenecks.

---

#### 6. Lead Time
**Definition:** Total time (in days) from issue creation until resolution.

**How It's Calculated:**
- Subtract issue creation date from resolution date
- Convert to days

**Why It Matters:** Measures total time in system, including waiting time before work starts.

---

### Team Ownership Metrics

#### 7. Backlog Health Score
**Definition:** Composite score measuring backlog readiness based on three factors.

**Components:**

**A. Items with Acceptance Criteria**
- **Logic:** Issues with description length > 50 characters
- **Assumption:** Meaningful descriptions indicate defined acceptance criteria
- **Target:** >80% for Level 3

**B. Items with Estimates**
- **Logic:** Issues with Story Points field populated (customfield_10061)
- **Assumption:** Estimated items have been discussed and understood
- **Target:** >80% for Level 3

**C. Items Linked to Fix Versions**
- **Logic:** Issues with at least one Fix Version assigned
- **Assumption:** Links to releases indicate strategic planning
- **Target:** >80% for Level 3

**Overall Score Formula:**
```
Overall Score = (A + B + C) / 3
```

**Why It Matters:** Healthy backlog indicates proactive planning and team ownership of upcoming work.

---

## How Data is Collected

### Data Sources

The application connects to two Jira REST APIs:

1. **Jira Agile REST API v1.0** - For boards, sprints, and backlog
2. **Jira Platform REST API v3** - For issue changelogs and field metadata

### Authentication

- Uses **HTTP Basic Authentication** with Base64 encoding
- Format: `email:api_token` encoded to Base64
- Sent in `Authorization` header with every request

### Data Collection Process

#### Step 1: Board Discovery
**API Call:** `GET /rest/agile/1.0/board?type=scrum`

**What's Fetched:**
- All Scrum boards accessible to the authenticated user
- Board ID, name, and type
- Supports pagination (fetches up to 3000 boards)

**Processing:**
- Results sorted alphabetically by board name
- Stored in memory for board selection

---

#### Step 2: Sprint Retrieval
**API Call:** `GET /rest/agile/1.0/board/{boardId}/sprint?state=closed`

**Parameters:**
- `state=closed` - Only closed/completed sprints
- `maxResults=50` - Up to 50 sprints

**What's Fetched:**
- Sprint ID, name, start date, end date, state
- Only sprints that have been completed

**Processing:**
1. Sort sprints by end date (descending - most recent first)
2. Select the 6 most recent sprints
3. Log sprint details for verification

---

#### Step 3: Sprint Issues Collection
**API Call:** `GET /rest/agile/1.0/sprint/{sprintId}/issue?fields=*all`

**Parameters:**
- `fields=*all` - Fetch ALL fields including custom fields
- `maxResults=1000` - Up to 1000 issues per sprint

**What's Fetched:**
For each sprint, retrieve all issues with complete field data:
- Issue key, summary, description
- Status and status category
- Issue type (Story, Bug, Task, etc.)
- Creation date
- Resolution date
- **Custom field: Story Points (customfield_10061)**
- Labels
- Fix Versions
- All other custom fields

**Processing:**
- Issues stored by sprint
- Used for calculating sprint metrics

---

#### Step 4: Issue Changelog (For Cycle Time)
**API Call:** `GET /rest/api/3/issue/{issueKey}/changelog`

**What's Fetched:**
- Complete history of status changes
- Timestamp of each transition
- From/To status names

**Processing:**
1. Parse all status change events
2. Find transition TO "IN PROGRESS"
3. Find subsequent transition TO "CLOSED"
4. Calculate time difference

**Note:** This is the most API-intensive operation. For 3 sprints with 50 issues each, this generates 150 additional API calls.

---

#### Step 5: Backlog Issues Collection
**API Call:** `GET /rest/agile/1.0/board/{boardId}/backlog`

**Parameters:**
- `maxResults=500` - Up to 500 backlog items
- `fields=summary,description,customfield_10061,fixVersions`

**What's Fetched:**
- All items in board backlog (not assigned to any sprint)
- Description text
- Story Points
- Fix Versions

**Processing:**
- Check description length for acceptance criteria
- Check for story points presence
- Check for fix version links
- Calculate three component scores
- Compute overall backlog health score

---

### Caching Strategy

To optimize performance and reduce API load:

**Cache Key Format:** `board-{boardId}-{metricType}`
- Example: `board-10870-team-metrics`

**Cache Duration:** 30 minutes (1800 seconds)

**Cache Storage:** In-memory (server RAM)

**Cache Invalidation:**
- Automatic after 30 minutes
- Manual via "Refresh from Jira" button (passes `forceRefresh=true`)

**Cached Data Includes:**
- Complete sprint metrics for all analyzed sprints
- Aggregated metrics
- Backlog health scores
- Maturity level determination

**Not Cached:**
- Board list (always fetched fresh)
- Connection test results

---

### Data Processing Pipeline

1. **Fetch** → Retrieve data from Jira APIs
2. **Parse** → Extract relevant fields and values
3. **Calculate** → Apply formulas to compute metrics
4. **Aggregate** → Average metrics across multiple sprints
5. **Classify** → Determine maturity level based on thresholds
6. **Cache** → Store results for 30 minutes
7. **Respond** → Send to frontend for visualization

---

## Technical Architecture

### System Components

```
┌─────────────────┐
│   Web Browser   │ (React Frontend)
└────────┬────────┘
         │ HTTPS
         ↓
┌─────────────────┐
│  Express Server │ (Node.js Backend)
└────────┬────────┘
         │ HTTPS + Basic Auth
         ↓
┌─────────────────┐
│   Jira Cloud    │ (Atlassian)
└─────────────────┘
```

### Frontend (Client)
- **Framework:** React 18 with Vite
- **Charts:** Chart.js with react-chartjs-2
- **Styling:** Tailwind CSS
- **HTTP Client:** Axios
- **Deployment:** GitHub Pages (static hosting)

**Key Components:**
- `Login.jsx` - Authentication and board selection
- `Dashboard.jsx` - Main analytics dashboard
- `MaturityBadge.jsx` - Maturity level display
- `MaturityLevelsReference.jsx` - Level descriptions

---

### Backend (Server)
- **Runtime:** Node.js with Express
- **API Client:** Axios
- **Date Processing:** date-fns
- **Deployment:** Render (cloud hosting)

**Key Services:**
- `jiraService.js` - Jira API interactions
- `metricsService.js` - Metric calculations and maturity logic
- `cacheService.js` - In-memory caching with TTL
- `dashboardController.js` - API endpoint handlers

---

### API Endpoints

**POST `/api/jira/test-connection`**
- Tests Jira credentials
- Returns board count

**POST `/api/jira/boards`**
- Fetches all Scrum boards
- Returns board list with IDs and names

**POST `/api/metrics/team`**
- Fetches sprint metrics for a board
- Returns complete analytics data

**POST `/api/metrics/flow`**
- Fetches flow metrics (cycle time, lead time)
- Returns time-based metrics

**POST `/api/diagnostics`**
- Diagnostic endpoint for troubleshooting
- Helps identify Story Points field

**GET `/health`**
- Health check endpoint
- Returns server status and timestamp

---

### Field Configuration

**Story Points Field:** `customfield_10061`

This custom field ID is specific to the Jira instance. If using with a different Jira instance, you may need to:

1. Run the diagnostics endpoint to identify the correct field
2. Update the field ID in:
   - `server/src/services/metricsService.js` (line 7 and 105)

---

### Security Considerations

1. **No Credential Storage:** API tokens are never stored on server
2. **HTTPS Only:** All communication encrypted in transit
3. **CORS Protection:** Backend restricts origin access
4. **Memory-Only Cache:** Cache data stored in RAM, not disk
5. **Session-Based:** Credentials exist only during browser session

---

## Troubleshooting

### Issue: "Failed to connect to Jira"

**Possible Causes:**
- Incorrect Jira URL format
- Invalid email or API token
- Network connectivity issues

**Solutions:**
1. Verify Jira URL has no trailing slash
2. Regenerate API token and try again
3. Check if Jira instance is accessible from your network

---

### Issue: "No boards found"

**Possible Causes:**
- Account has no Scrum boards
- Insufficient permissions
- Only Kanban boards exist

**Solutions:**
1. Verify you have at least one Scrum board
2. Check Jira permissions for your account
3. Ensure boards are type "Scrum" not "Kanban"

---

### Issue: "Story Points showing as 0"

**Possible Causes:**
- Issues don't have story points assigned
- Wrong custom field ID

**Solutions:**
1. Verify issues in Jira have story points
2. Run diagnostics endpoint to identify correct field
3. Update `customfield_10061` if different in your Jira instance

---

### Issue: "Cycle Time showing N/A"

**Possible Causes:**
- Issues never transitioned through correct statuses
- Status names don't match expected values

**Solutions:**
1. Verify your workflow uses "IN PROGRESS" and "CLOSED" status names
2. Update status matching logic in `metricsService.js` (lines 85-95)
3. Check issue changelog to see actual status names used

---

### Issue: "Backlog Health at 0%"

**Possible Causes:**
- No items in backlog
- Board has no project association
- API endpoint not returning data

**Solutions:**
1. Verify board has backlog items in Jira
2. Check server logs for specific error messages
3. Ensure backlog items have descriptions, estimates, or fix versions

---

### Issue: "Maturity level seems incorrect"

**Possible Causes:**
- One metric falling below threshold
- Logic uses OR condition for Level 1

**Understanding:**
- Level 1 triggered if ANY of these are true:
  - Rollover > 25%
  - Sprint Goal Attainment < 50%
  - Backlog Health < 50%
  - Mid-Sprint Additions > 25%

**Note:** A team can have excellent delivery metrics but still be Level 1 if backlog health is poor.

---

### Issue: "Data not refreshing"

**Solution:**
Click the "Refresh from Jira" button to bypass the 30-minute cache and fetch fresh data.

---

## Appendix: Jira API Reference

**Jira Agile REST API Documentation:**
https://developer.atlassian.com/cloud/jira/software/rest/

**Jira Platform REST API Documentation:**
https://developer.atlassian.com/cloud/jira/platform/rest/v3/

**API Token Management:**
https://id.atlassian.com/manage-profile/security/api-tokens

---

## Support and Feedback

For issues, questions, or suggestions:
1. Check this documentation first
2. Review server logs for detailed error messages
3. Use the diagnostics endpoint for field identification issues
4. Contact your system administrator for access or permission issues

---

**Document Version:** 1.0
**Last Updated:** 2026-02-02
**Application:** Scrum Maturity Dashboard
