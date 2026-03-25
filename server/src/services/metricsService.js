import { differenceInDays, differenceInHours, parseISO } from 'date-fns';

class MetricsService {

  constructor() {
    // Default story points field (Indeed Jira). Can be overridden per-tenant via setStoryPointsField()
    this.storyPointsField = 'customfield_10061';
  }

  // Set the story points custom field ID for the current tenant
  setStoryPointsField(fieldId) {
    if (fieldId) {
      this.storyPointsField = fieldId;
      console.log(`✓ Story points field set to: ${fieldId}`);
    }
  }

  // Calculate Sprint Goal Attainment
  // Only counts issues as "completed" if resolved before/on sprint close date.
  // Uses completeDate (when Scrum Master clicked "Complete Sprint") to match Jira Sprint Report.
  calculateSprintGoalAttainment(sprint, issues) {
    const storyPointsField = this.storyPointsField;
    const sprintEnd = new Date(sprint.completeDate || sprint.endDate);
    const statusCategoryMap = MetricsService.buildStatusCategoryMap(issues);

    let committedPoints = 0;
    let completedPoints = 0;
    let issuesWithPoints = 0;
    let issuesWithoutPoints = 0;
    let skippedSubtasks = 0;
    let completedAfterSprint = 0;

    issues.forEach(issue => {
      // Skip sub-tasks to avoid double-counting story points with their parent
      if (issue.fields.issuetype.subtask) {
        skippedSubtasks++;
        return;
      }

      const points = issue.fields[storyPointsField] || 0;

      if (points > 0) {
        issuesWithPoints++;
        committedPoints += points;

        // Check if issue was in "done" status at sprint close time (changelog snapshot)
        if (MetricsService.wasCompletedAtTime(issue, sprintEnd, statusCategoryMap)) {
          completedPoints += points;
        } else if (issue.fields.status.statusCategory.key === 'done') {
          completedAfterSprint++;
        }
      } else {
        issuesWithoutPoints++;
      }
    });

    console.log(`\n📊 Sprint Goal Attainment - ${sprint.name}:`);
    console.log(`  Total issues: ${issues.length} (${skippedSubtasks} sub-tasks excluded from SP count)`);
    console.log(`  Issues with story points: ${issuesWithPoints}`);
    console.log(`  Issues without story points: ${issuesWithoutPoints}`);
    console.log(`  Committed points: ${committedPoints}`);
    console.log(`  Completed points: ${completedPoints}${completedAfterSprint > 0 ? ` (${completedAfterSprint} issues completed after sprint end excluded)` : ''}`);
    console.log(`  Attainment: ${committedPoints > 0 ? ((completedPoints / committedPoints) * 100).toFixed(1) : 0}%`);

    if (issuesWithoutPoints > 0 && issues.length <= 5) {
      console.log(`  Sample issue keys (first 5): ${issues.slice(0, 5).map(i => i.key).join(', ')}`);
    }

    return {
      percentage: committedPoints > 0 ? (completedPoints / committedPoints) * 100 : 0,
      committedPoints,
      completedPoints
    };
  }

  // Rollover reason labels used by the teams
  static ROLLOVER_LABELS = [
    'external-blockers',
    'late-discovery',
    'resource-constraints',
    'internal-blockers',
    'req-gap',
    'dev-qa-spill'
  ];

  // Human-readable names for rollover labels
  static ROLLOVER_LABEL_NAMES = {
    'external-blockers': 'External Blockers',
    'late-discovery': 'Late Discovery',
    'resource-constraints': 'Resource Constraints',
    'internal-blockers': 'Internal Blockers',
    'req-gap': 'Requirement Gap',
    'dev-qa-spill': 'Dev/QA Spill'
  };

  // Build a mapping of status names → category keys from current issue data.
  // Used to interpret changelog status transitions.
  static buildStatusCategoryMap(issues) {
    const map = new Map();
    for (const issue of issues) {
      const statusName = issue.fields?.status?.name;
      const category = issue.fields?.status?.statusCategory?.key;
      if (statusName && category) {
        map.set(statusName, category);
      }
    }
    return map;
  }

  // Determine if an issue was in a "done" status category at a specific date.
  // Prefers the Sprint Report flag (_completedInSprintReport) set by jiraService
  // which comes directly from the Jira Sprint Report API — an exact match with
  // the Jira UI. Falls back to changelog-based status snapshot when unavailable.
  static wasCompletedAtTime(issue, targetDate, statusCategoryMap) {
    // Sprint Report flag takes absolute precedence (exact Jira UI match)
    if (issue._completedInSprintReport !== undefined) {
      return issue._completedInSprintReport;
    }

    // No valid target date: fall back to current status
    if (!targetDate || isNaN(targetDate.getTime())) {
      return issue.fields?.status?.statusCategory?.key === 'done';
    }

    // If changelog not available (API didn't return it), fall back to resolution date check
    if (!issue.changelog) {
      const statusDone = issue.fields?.status?.statusCategory?.key === 'done';
      const resolutionDate = issue.fields?.resolutiondate ? new Date(issue.fields.resolutiondate) : null;
      return statusDone && (resolutionDate && resolutionDate <= targetDate);
    }

    const histories = issue.changelog?.histories || [];
    const sorted = [...histories].sort((a, b) => new Date(a.created) - new Date(b.created));

    // Walk through status transitions to find the status at targetDate
    let statusAtTime = null;

    for (const history of sorted) {
      if (new Date(history.created) > targetDate) break;
      for (const item of history.items) {
        if (item.field === 'status') {
          statusAtTime = item.toString;
        }
      }
    }

    // If no status change before targetDate, find the initial status
    if (statusAtTime === null) {
      for (const history of sorted) {
        for (const item of history.items) {
          if (item.field === 'status') {
            statusAtTime = item.fromString; // This was the initial status
            break;
          }
        }
        if (statusAtTime !== null) break;
      }
    }

    // No status changes at all: issue has always been in its current status
    if (statusAtTime === null) {
      return issue.fields?.status?.statusCategory?.key === 'done';
    }

    // Look up category from the map built from current issue statuses
    const category = statusCategoryMap.get(statusAtTime);
    if (category) return category === 'done';

    // Fallback: name-based check for statuses not in our map
    const lower = statusAtTime.toLowerCase();
    return ['done', 'closed', 'resolved', 'complete', 'completed'].some(s => lower.includes(s));
  }

  // Calculate Rollover Rate - returns { rate, issues[], reasonBreakdown }
  // A rollover is any issue that:
  //   1. Appears in both the current sprint AND the next sprint
  //   2. Was NOT completed in the current sprint
  // Labels are tracked as optional reasons but are NOT required for counting.
  calculateRolloverRate(sprintIssues, nextSprintIssues, sprintName = '', sprint = null) {
    if (!nextSprintIssues || nextSprintIssues.length === 0) {
      console.log(`\n🔄 Rollover for ${sprintName || 'sprint'}: no next sprint data, rollover = 0%`);
      return { rate: 0, issues: [], reasonBreakdown: {} };
    }

    // Filter out sub-tasks for consistent counting
    const parentIssues = sprintIssues.filter(i => !i.fields?.issuetype?.subtask);
    const parentNextIssues = nextSprintIssues.filter(i => !i.fields?.issuetype?.subtask);

    const currentSprintKeys = new Set(parentIssues.map(i => i.key));
    // Issues that appear in both sprints are rollover candidates
    const candidateIssues = parentNextIssues.filter(issue => currentSprintKeys.has(issue.key));

    // Build status category map for completion check
    const statusCategoryMap = MetricsService.buildStatusCategoryMap(sprintIssues);
    const sprintEnd = sprint ? new Date(sprint.completeDate || sprint.endDate) : null;

    const reasonBreakdown = {};
    const issueDetails = [];

    for (const issue of candidateIssues) {
      // Find the original issue from the current sprint (has the correct completion flag)
      const originalIssue = parentIssues.find(i => i.key === issue.key) || issue;

      // Skip if the issue was completed in the current sprint — not a rollover
      if (MetricsService.wasCompletedAtTime(originalIssue, sprintEnd, statusCategoryMap)) {
        continue;
      }

      // This is a genuine rollover — track optional reason labels
      const allLabels = issue.fields?.labels || [];
      const rolloverReasons = allLabels.filter(l =>
        MetricsService.ROLLOVER_LABELS.includes(l)
      );

      for (const reason of rolloverReasons) {
        reasonBreakdown[reason] = (reasonBreakdown[reason] || 0) + 1;
      }

      issueDetails.push({
        key: issue.key,
        summary: issue.fields?.summary || '',
        status: issue.fields?.status?.name || 'unknown',
        type: issue.fields?.issuetype?.name || 'unknown',
        reasons: rolloverReasons
      });
    }

    const rate = parentIssues.length > 0 ? (issueDetails.length / parentIssues.length) * 100 : 0;

    const labeled = issueDetails.filter(i => i.reasons.length > 0).length;
    console.log(`\n🔄 Rollover for ${sprintName || 'sprint'}: ${issueDetails.length}/${parentIssues.length} issues = ${rate.toFixed(1)}% (${candidateIssues.length} in both sprints, ${issueDetails.length} not completed, ${labeled} with labels)`);
    if (issueDetails.length > 0) {
      issueDetails.forEach(issue => {
        console.log(`  → ${issue.key} - ${issue.summary} [${issue.status}]${issue.reasons.length > 0 ? ` (${issue.reasons.join(', ')})` : ''}`);
      });
      if (Object.keys(reasonBreakdown).length > 0) {
        console.log(`  Breakdown: ${Object.entries(reasonBreakdown).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
      }
    }

    return { rate, issues: issueDetails, reasonBreakdown };
  }

  // Calculate Sprint Hit Rate (excludes sub-tasks, uses changelog snapshot at sprint close)
  calculateSprintHitRate(issues, sprintEndDate = null) {
    const parentIssues = issues.filter(i => !i.fields.issuetype.subtask);
    const total = parentIssues.length;
    const sprintEnd = sprintEndDate ? new Date(sprintEndDate) : null;
    const statusCategoryMap = MetricsService.buildStatusCategoryMap(issues);
    const completed = parentIssues.filter(i =>
      MetricsService.wasCompletedAtTime(i, sprintEnd, statusCategoryMap)
    ).length;

    return total > 0 ? (completed / total) * 100 : 0;
  }

  // Calculate Mid-Sprint Additions (excludes sub-tasks)
  calculateMidSprintAdditions(issues, sprintStartDate) {
    const sprintStart = parseISO(sprintStartDate);
    const parentIssues = issues.filter(i => !i.fields.issuetype.subtask);

    const addedDuringSprint = parentIssues.filter(issue => {
      const created = parseISO(issue.fields.created);
      return created > sprintStart;
    });

    const issueDetails = addedDuringSprint.map(issue => ({
      key: issue.key,
      summary: issue.fields?.summary || '',
      status: issue.fields?.status?.name || 'unknown',
      type: issue.fields?.issuetype?.name || 'unknown',
      created: issue.fields.created
    }));

    return {
      count: addedDuringSprint.length,
      percentage: parentIssues.length > 0 ? (addedDuringSprint.length / parentIssues.length) * 100 : 0,
      issues: issueDetails
    };
  }

  // Calculate Cycle Time — measures time from when issue was committed to sprint until done.
  // This excludes discovery time (before sprint commitment).
  // Falls back to "In Progress" transition if sprint field change not found.
  calculateCycleTime(issue, changelog) {
    let startTime = null;
    let endTime = null;

    // Log status transitions for debugging (only for first issue)
    if (!this._loggedStatuses) {
      console.log(`\n🔄 Status transitions for ${issue.key}:`);
      changelog.slice(0, 5).forEach(change => {
        change.items.forEach(item => {
          if (item.field === 'status') {
            console.log(`  ${item.fromString} → ${item.toString}`);
          }
        });
      });
      this._loggedStatuses = true;
    }

    // 1. Try to find when the issue was added to a sprint (Sprint field change)
    for (const change of changelog) {
      for (const item of change.items) {
        if (item.field === 'Sprint' && item.toString && !item.fromString) {
          // First time added to any sprint
          startTime = parseISO(change.created);
          break;
        }
        if (item.field === 'Sprint' && item.toString) {
          // Sprint changed — use the first sprint assignment
          if (!startTime) startTime = parseISO(change.created);
        }
      }
      if (startTime) break;
    }

    // 2. Fallback: find "In Progress" transition if no sprint field change found
    if (!startTime) {
      const inProgressNames = ['in progress', 'em progresso', 'em andamento', 'development', 'desenvolvimento', 'doing'];
      for (const change of changelog) {
        for (const item of change.items) {
          if (item.field === 'status') {
            const statusLower = (item.toString || '').toLowerCase();
            if (inProgressNames.some(s => statusLower.includes(s))) {
              startTime = parseISO(change.created);
              break;
            }
          }
        }
        if (startTime) break;
      }
    }

    // 3. Find when issue moved to done
    const doneNames = ['closed', 'done', 'resolved', 'concluido', 'concluído', 'finalizado', 'complete', 'completed'];
    if (startTime) {
      for (const change of changelog) {
        const changeDate = parseISO(change.created);
        if (changeDate < startTime) continue;
        for (const item of change.items) {
          if (item.field === 'status') {
            const statusLower = (item.toString || '').toLowerCase();
            if (doneNames.some(s => statusLower.includes(s))) {
              endTime = changeDate;
              break;
            }
          }
        }
        if (endTime) break;
      }
    }

    if (startTime && endTime) {
      return differenceInHours(endTime, startTime) / 24; // Return in days
    }

    return null;
  }

  // Calculate Lead Time
  calculateLeadTime(issue) {
    if (issue.fields.resolutiondate) {
      const created = parseISO(issue.fields.created);
      const resolved = parseISO(issue.fields.resolutiondate);
      return differenceInHours(resolved, created) / 24; // Return in days
    }
    return null;
  }

  // Calculate Backlog Health Score (excludes sub-tasks)
  // Only evaluates items in backlog/pending statuses — items already in progress or done are excluded.
  calculateBacklogHealth(issues) {
    // Filter out sub-tasks
    const parentIssues = issues.filter(i => !i.fields?.issuetype?.subtask);

    // Only evaluate items that are truly in the backlog (not yet pulled into a sprint or in progress)
    // statusCategory: 'new' = To Do / Backlog / Pending / Open
    // Excludes 'indeterminate' (In Progress) and 'done' (Closed/Resolved)
    const backlogStatuses = ['pending requirements', 'backlog', 'open', 'to do', 'new', 'pending',
      'pendente', 'aberto', 'a fazer', 'ready for development', 'ready for refinement',
      'ready', 'triage', 'funnel', 'ideas', 'selected for development'];

    const backlogIssues = parentIssues.filter(i => {
      const category = i.fields?.status?.statusCategory?.key;
      if (category === 'new') return true; // Jira "To Do" category
      const statusName = (i.fields?.status?.name || '').toLowerCase();
      return backlogStatuses.some(s => statusName.includes(s));
    });

    let withAcceptanceCriteria = 0;
    let withEstimates = 0;
    let linkedToGoals = 0;
    const storyPointsField = this.storyPointsField;

    const missingAC = [];
    const missingEstimates = [];
    const missingFixVersions = [];

    console.log(`\n📋 Backlog Health Analysis:`);
    console.log(`  Total backlog issues: ${backlogIssues.length} (from ${parentIssues.length} parent issues, ${parentIssues.length - backlogIssues.length} in-progress/done excluded)`);

    // Log first 3 issues for debugging
    if (backlogIssues.length > 0) {
      console.log(`\n  Sample backlog issues (first 3):`);
      backlogIssues.slice(0, 3).forEach((issue, idx) => {
        console.log(`  ${idx + 1}. ${issue.key} [${issue.fields?.status?.name}]`);
        console.log(`     Description length: ${issue.fields.description?.length || 0} chars`);
        console.log(`     Story Points (${storyPointsField}): ${issue.fields[storyPointsField] || 'null'}`);
        console.log(`     Fix Versions: ${issue.fields.fixVersions?.length || 0}`);
      });
    }

    const makeDetail = (issue) => ({
      key: issue.key,
      summary: issue.fields?.summary || '',
      type: issue.fields?.issuetype?.name || 'unknown',
      status: issue.fields?.status?.name || 'unknown'
    });

    // Regex patterns for Acceptance Criteria keywords in description
    const acPatterns = [
      /acceptance\s*criteria/i,
      /\bAC\b\s*[:;\-\n]/,
      /\bacc\s*criteria/i,
      /\bcriteria\s*de\s*aceita/i,
      /\bcritérios?\s*de\s*aceite/i,
      /\bgiven\b.*\bwhen\b.*\bthen\b/is,
      /\bdefinition\s*of\s*done\b/i,
      /\bexpected\s*result/i,
      /\bexpected\s*outcome/i,
      /\bexpected\s*behavio/i
    ];

    const hasAcceptanceCriteria = (description) => {
      if (!description || typeof description !== 'string') return false;
      // Handle Jira's ADF (Atlassian Document Format) JSON description
      let textContent = description;
      if (typeof description === 'object') {
        textContent = JSON.stringify(description);
      }
      return acPatterns.some(pattern => pattern.test(textContent));
    };

    backlogIssues.forEach(issue => {
      // Check for AC keywords in description
      const desc = issue.fields.description;
      const descText = typeof desc === 'object' ? JSON.stringify(desc) : desc;
      if (hasAcceptanceCriteria(descText)) {
        withAcceptanceCriteria++;
      } else {
        missingAC.push(makeDetail(issue));
      }

      // Check for estimates
      if (issue.fields[storyPointsField]) {
        withEstimates++;
      } else {
        missingEstimates.push(makeDetail(issue));
      }

      // Check for links to goals/fix versions
      if (issue.fields.fixVersions && issue.fields.fixVersions.length > 0) {
        linkedToGoals++;
      } else {
        missingFixVersions.push(makeDetail(issue));
      }
    });

    const total = backlogIssues.length;

    console.log(`\n  Results:`);
    console.log(`    With Acceptance Criteria (keyword match): ${withAcceptanceCriteria}/${total}`);
    console.log(`    With Estimates: ${withEstimates}/${total}`);
    console.log(`    Linked to Goals: ${linkedToGoals}/${total}`);

    if (total === 0) {
      console.log(`  ⚠️  No backlog issues in pending/backlog status found!`);
      return {
        withAcceptanceCriteria: 0,
        withEstimates: 0,
        linkedToGoals: 0,
        overallScore: 0,
        missingAC: [],
        missingEstimates: [],
        missingFixVersions: [],
        totalItems: 0
      };
    }

    return {
      withAcceptanceCriteria: (withAcceptanceCriteria / total) * 100,
      withEstimates: (withEstimates / total) * 100,
      linkedToGoals: (linkedToGoals / total) * 100,
      overallScore: ((withAcceptanceCriteria + withEstimates + linkedToGoals) / (total * 3)) * 100,
      missingAC,
      missingEstimates,
      missingFixVersions,
      totalItems: total
    };
  }

  // Calculate Defect Distribution (excludes sub-tasks)
  calculateDefectDistribution(issues) {
    const bugs = issues.filter(i => i.fields.issuetype.name === 'Bug' && !i.fields.issuetype.subtask);
    
    let preMerge = 0;
    let inQA = 0;
    let postRelease = 0;

    bugs.forEach(bug => {
      const labels = bug.fields.labels || [];
      
      if (labels.includes('pre-merge') || labels.includes('code-review')) {
        preMerge++;
      } else if (labels.includes('qa') || labels.includes('testing')) {
        inQA++;
      } else {
        postRelease++;
      }
    });

    return { preMerge, inQA, postRelease, total: bugs.length };
  }

  // Calculate WIP Aging (excludes sub-tasks)
  calculateWIPAging(issues, changelog) {
    const wipIssues = issues.filter(i =>
      !i.fields.issuetype.subtask && i.fields.status.statusCategory.key === 'indeterminate'
    );

    const aged = wipIssues.map(issue => {
      // Find when it entered "In Progress"
      let inProgressDate = null;
      
      const issueChangelog = changelog[issue.key] || [];
      for (const change of issueChangelog) {
        for (const item of change.items) {
          if (item.field === 'status' && item.toString === 'In Progress') {
            inProgressDate = parseISO(change.created);
            break;
          }
        }
        if (inProgressDate) break;
      }

      const startDate = inProgressDate || parseISO(issue.fields.created);
      const daysInProgress = differenceInDays(new Date(), startDate);

      return {
        key: issue.key,
        summary: issue.fields.summary,
        daysInProgress
      };
    });

    return aged;
  }

  // Determine Maturity Level
  // Based on three pillars:
  // P1: Delivery Predictability (rollover rate as proxy for sprint hit rate)
  // P2: Flow & Quality (cycle time stability, rework)
  // P3: Team Ownership (backlog readiness = % "To Do" with AC + estimates)
  determineMaturityLevel(metrics) {
    const {
      rolloverRate = 0,
      sprintGoalAttainment = 0,
      backlogHealth = { overallScore: 0 },
      midSprintAdditions = 0
    } = metrics || {};

    // Backlog readiness = % of items that are "Ready" (have AC + estimates)
    const backlogReadiness = backlogHealth?.overallScore ?? 0;

    // Level 1: Assisted Scrum (Scrum Manager Required)
    // - Rollover > 20-25%
    // - Low "Ready" rate on backlog (<25%)
    // - High mid-sprint injection
    // - Poor backlog hygiene
    if (
      rolloverRate > 25 ||
      backlogReadiness < 25
    ) {
      const blockers = [];
      if (rolloverRate > 25) blockers.push('rollover');
      if (backlogReadiness < 25) blockers.push('backlogReady');

      return {
        level: 1,
        name: 'Assisted Scrum',
        description: 'Scrum Manager Required',
        characteristics: [
          `Rollover: ${rolloverRate.toFixed(1)}% (must be ≤25% for Level 2)`,
          `Backlog Ready: ${backlogReadiness.toFixed(1)}% (must be ≥25% for Level 2)`
        ],
        blockers,
        recommendations: [
          'Establish basic operating cadence',
          'Improve backlog readiness and capacity planning',
          'Reduce scope churn',
          'Coach ownership behaviors',
          'Introduce visible metrics and patterns'
        ]
      };
    }

    // Level 3: Self-Managed Scrum (Scrum Manager Optional)
    // Sustained for 3-4 sprints:
    // - <10-15% average rollover
    // - Minimal mid-sprint scope churn
    // - Almost all backlog "Ready" (>75%)
    // - Stable throughput
    // - Quality issues trending down
    if (
      rolloverRate < 15 &&
      backlogReadiness > 75
    ) {
      return {
        level: 3,
        name: 'Self-Managed Scrum',
        description: 'Scrum Manager Optional',
        characteristics: [
          `Rollover: ${rolloverRate.toFixed(1)}% (excellent: <15%)`,
          `Backlog Ready: ${backlogReadiness.toFixed(1)}% (excellent: >75%)`
        ],
        blockers: [],
        recommendations: [
          'On-demand coaching',
          'Quarterly health check',
          'Stakeholder/product check in',
          'Pattern escalation if regression occurs',
          'Share best practices with other teams'
        ]
      };
    }

    // Level 2: Supported Scrum (Conditional Support)
    const blockers = [];
    if (rolloverRate >= 15) blockers.push('rollover');
    if (backlogReadiness <= 75) blockers.push('backlogReady');

    return {
      level: 2,
      name: 'Supported Scrum',
      description: 'Conditional Support',
      characteristics: [
        `Rollover: ${rolloverRate.toFixed(1)}% (must be <15% for Level 3)`,
        `Backlog Ready: ${backlogReadiness.toFixed(1)}% (must be >75% for Level 3)`
      ],
      blockers,
      supportModel: 'Shared Scrum Manager, Time-bound engagement (1-2 sprints/month)',
      recommendations: [
        'Pattern recognition (last-minute rush, WIP aging)',
        'Coaching Product on backlog ownership',
        'Enabling team-led ceremonies',
        'Driving retro action execution'
      ]
    };
  }

  // Calculate Flow & Quality metrics from all sprint data
  calculateFlowQuality(sprintIssuesMap, sprintMetrics, recentSprints) {
    // 1. Collect all resolved non-subtask issues (deduplicated)
    const allIssuesMap = new Map();
    const sprintIssuesBySprintId = new Map();

    for (const sprint of recentSprints) {
      const issues = sprintIssuesMap.get(sprint.id) || [];
      const parentIssues = issues.filter(i => !i.fields.issuetype?.subtask);
      sprintIssuesBySprintId.set(sprint.id, parentIssues);
      for (const issue of parentIssues) {
        allIssuesMap.set(issue.key, issue);
      }
    }

    // 2. Cycle time by work type (sprint commitment → done, excludes backlog wait time)
    // Excludes "Task" type — not relevant for flow analysis
    const isExcludedType = (t) => t.toLowerCase() === 'task';
    const cycleTimeByType = {};
    const cycleTimeItems = {};

    for (const issue of allIssuesMap.values()) {
      const type = issue.fields.issuetype?.name || 'Other';
      if (isExcludedType(type)) continue;

      const histories = issue.changelog?.histories || [];
      const ct = histories.length > 0 ? this.calculateCycleTime(issue, histories) : null;
      if (ct === null || ct <= 0) continue;
      if (!cycleTimeByType[type]) { cycleTimeByType[type] = []; cycleTimeItems[type] = []; }
      cycleTimeByType[type].push(ct);
      cycleTimeItems[type].push({ key: issue.key, days: ct });
    }

    // Average per type
    const leadTimeAvgByType = {};
    for (const [type, times] of Object.entries(cycleTimeByType)) {
      leadTimeAvgByType[type] = times.length > 0
        ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10
        : 0;
    }

    // 3. Cycle time by sprint by type (trend) — excludes Task
    const leadTimeByTypeBySprint = recentSprints.map(sprint => {
      const issues = sprintIssuesBySprintId.get(sprint.id) || [];
      const byType = {};
      for (const issue of issues) {
        const type = issue.fields.issuetype?.name || 'Other';
        if (isExcludedType(type)) continue;

        const histories = issue.changelog?.histories || [];
        const ct = histories.length > 0 ? this.calculateCycleTime(issue, histories) : null;
        if (ct === null || ct <= 0) continue;
        if (!byType[type]) byType[type] = [];
        byType[type].push(ct);
      }
      const avgs = {};
      for (const [type, times] of Object.entries(byType)) {
        avgs[type] = Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10;
      }
      return { sprint: sprint.name, ...avgs };
    });

    // 4. WIP aging — issues from last sprint still in progress
    const lastSprint = recentSprints[recentSprints.length - 1];
    const lastSprintIssues = lastSprint ? (sprintIssuesBySprintId.get(lastSprint.id) || []) : [];
    const wipAging = lastSprintIssues
      .filter(i => i.fields.status?.statusCategory?.key === 'indeterminate')
      .map(issue => {
        const created = new Date(issue.fields.created);
        const daysInProgress = Math.round((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));
        return {
          key: issue.key,
          summary: issue.fields.summary,
          type: issue.fields.issuetype?.name || 'Unknown',
          daysInProgress,
          assignee: issue.fields.assignee?.displayName || 'Unassigned',
          status: issue.fields.status?.name || 'Unknown'
        };
      })
      .sort((a, b) => b.daysInProgress - a.daysInProgress);

    // 5. Defect distribution — aggregate + by sprint
    const totalDefects = { preMerge: 0, inQA: 0, postRelease: 0, total: 0 };
    const defectsBySprint = sprintMetrics.map(sm => {
      const d = sm.defectDistribution || { preMerge: 0, inQA: 0, postRelease: 0, total: 0 };
      totalDefects.preMerge += d.preMerge;
      totalDefects.inQA += d.inQA;
      totalDefects.postRelease += d.postRelease;
      totalDefects.total += d.total;
      return { sprint: sm.sprintName, ...d };
    });

    // 6. QA rework — detect issues that went backwards in workflow (QA/Review → Dev/In Progress)
    // This catches actual rework more accurately than label-based detection.
    const qaStatuses = ['qa', 'testing', 'in qa', 'code review', 'review', 'in review', 'ready for qa', 'verificação', 'verificacao', 'teste'];
    const devStatuses = ['in progress', 'em progresso', 'em andamento', 'development', 'desenvolvimento', 'doing', 'to do', 'open', 'reopened'];

    let totalReworkIssues = 0;
    let totalIssueCount = 0;
    const reworkBySprint = [];
    for (const sprint of recentSprints) {
      const issues = sprintIssuesBySprintId.get(sprint.id) || [];
      let reworkCount = 0;
      const reworkDetails = [];

      for (const issue of issues) {
        const histories = issue.changelog?.histories || [];
        let wasInQA = false;
        let sentBack = false;

        for (const history of histories) {
          for (const item of history.items) {
            if (item.field === 'status') {
              const fromLower = (item.fromString || '').toLowerCase();
              const toLower = (item.toString || '').toLowerCase();
              if (qaStatuses.some(s => fromLower.includes(s)) || qaStatuses.some(s => toLower.includes(s))) {
                wasInQA = true;
              }
              // Detect back-transition: from QA/Review status to Dev/In Progress
              if (wasInQA && qaStatuses.some(s => fromLower.includes(s)) && devStatuses.some(s => toLower.includes(s))) {
                sentBack = true;
                break;
              }
            }
          }
          if (sentBack) break;
        }

        if (sentBack) {
          reworkCount++;
          reworkDetails.push({
            key: issue.key,
            summary: issue.fields?.summary || '',
            type: issue.fields?.issuetype?.name || 'Unknown'
          });
        }
      }

      totalIssueCount += issues.length;
      totalReworkIssues += reworkCount;
      reworkBySprint.push({
        sprint: sprint.name,
        reworkCount,
        totalIssues: issues.length,
        reworkRate: issues.length > 0 ? Math.round((reworkCount / issues.length) * 1000) / 10 : 0,
        reworkDetails
      });
    }

    // 7. Healthy Signals
    // a) Stable lead time: compare last 2 sprints' avg lead time
    let stableLeadTime = true;
    if (leadTimeByTypeBySprint.length >= 3) {
      const recent = leadTimeByTypeBySprint.slice(-2);
      const earlier = leadTimeByTypeBySprint.slice(-4, -2);
      const avgRecent = this._avgLeadTimeFromSprint(recent);
      const avgEarlier = this._avgLeadTimeFromSprint(earlier);
      if (avgEarlier > 0 && avgRecent > avgEarlier * 1.2) stableLeadTime = false;
    }

    // b) Early defect detection: pre-merge + QA > post-release
    const earlyDefectDetection = totalDefects.total === 0 ||
      (totalDefects.preMerge + totalDefects.inQA) >= totalDefects.postRelease;

    // c) Minimal rework: QA back-transitions < 15% of all issues
    const reworkRate = totalIssueCount > 0 ? (totalReworkIssues / totalIssueCount) * 100 : 0;
    const minimalRework = reworkRate < 15;

    return {
      leadTimeByType: leadTimeAvgByType,
      leadTimeByTypeBySprint,
      wipAging,
      defects: { total: totalDefects, bySprint: defectsBySprint },
      reworkRate: Math.round(reworkRate * 10) / 10,
      reworkBySprint,
      healthySignals: { stableLeadTime, earlyDefectDetection, minimalRework }
    };
  }

  // Helper: average lead time across sprint entries
  _avgLeadTimeFromSprint(entries) {
    let sum = 0, count = 0;
    for (const e of entries) {
      for (const [key, val] of Object.entries(e)) {
        if (key !== 'sprint' && typeof val === 'number') { sum += val; count++; }
      }
    }
    return count > 0 ? sum / count : 0;
  }

  // Aggregate metrics for multiple sprints
  aggregateSprintMetrics(sprintMetrics) {
    if (sprintMetrics.length === 0) return null;

    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

    return {
      avgRolloverRate: avg(sprintMetrics.map(s => s.rolloverRate || 0)),
      avgSprintGoalAttainment: avg(sprintMetrics.map(s => s.sprintGoalAttainment || 0)),
      avgSprintHitRate: avg(sprintMetrics.map(s => s.sprintHitRate || 0)),
      avgSprintHitRatePoints: avg(sprintMetrics.map(s => s.sprintHitRatePoints || s.sprintHitRate || 0)),
      avgMidSprintAdditions: avg(sprintMetrics.map(s => s.midSprintAdditions?.percentage || 0)),
      totalSprints: sprintMetrics.length
    };
  }
}

export default MetricsService;
