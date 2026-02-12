import { differenceInDays, differenceInHours, parseISO } from 'date-fns';

class MetricsService {
  
  // Calculate Sprint Goal Attainment
  // Only counts issues as "completed" if resolved before/on sprint close date.
  // Uses completeDate (when Scrum Master clicked "Complete Sprint") to match Jira Sprint Report.
  calculateSprintGoalAttainment(sprint, issues) {
    const storyPointsField = 'customfield_10061'; // Indeed Jira Story Points field
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

    return committedPoints > 0 ? (completedPoints / committedPoints) * 100 : 0;
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

  // Determine if an issue was in a "done" status category at a specific date
  // by examining the issue's changelog. This matches Jira Sprint Report behavior
  // which captures a status snapshot at sprint close time.
  static wasCompletedAtTime(issue, targetDate, statusCategoryMap) {
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
  // Excludes sub-tasks to avoid inflating denominator
  calculateRolloverRate(sprintIssues, nextSprintIssues, sprintName = '') {
    if (!nextSprintIssues || nextSprintIssues.length === 0) {
      console.log(`\n🔄 Rollover for ${sprintName || 'sprint'}: no next sprint data, rollover = 0%`);
      return { rate: 0, issues: [], reasonBreakdown: {} };
    }

    // Filter out sub-tasks for consistent counting
    const parentIssues = sprintIssues.filter(i => !i.fields?.issuetype?.subtask);
    const parentNextIssues = nextSprintIssues.filter(i => !i.fields?.issuetype?.subtask);

    const currentSprintKeys = new Set(parentIssues.map(i => i.key));
    // An issue is a rollover only if it appears in both sprints AND has a rollover label
    const candidateIssues = parentNextIssues.filter(issue => currentSprintKeys.has(issue.key));

    // Extract rollover reason labels and keep only labeled issues
    const reasonBreakdown = {};
    const issueDetails = [];

    for (const issue of candidateIssues) {
      const allLabels = issue.fields?.labels || [];
      const rolloverReasons = allLabels.filter(l =>
        MetricsService.ROLLOVER_LABELS.includes(l)
      );

      // Only count as rollover if it has at least one rollover label
      if (rolloverReasons.length === 0) continue;

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

    console.log(`\n🔄 Rollover for ${sprintName || 'sprint'}: ${issueDetails.length}/${parentIssues.length} issues = ${rate.toFixed(1)}% (${candidateIssues.length} in both sprints, ${issueDetails.length} with rollover labels)`);
    if (issueDetails.length > 0) {
      issueDetails.forEach(issue => {
        console.log(`  → ${issue.key} - ${issue.summary} [${issue.status}] (${issue.reasons.join(', ')})`);
      });
      console.log(`  Breakdown: ${Object.entries(reasonBreakdown).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
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

  // Calculate Cycle Time
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

    // Find when issue moved to "IN PROGRESS" (Indeed Jira workflow)
    for (const change of changelog) {
      for (const item of change.items) {
        if (item.field === 'status') {
          // Check for work-in-progress status (Indeed Jira uses "IN PROGRESS")
          if (!startTime && (
            item.toString === 'IN PROGRESS' ||
            item.toString === 'In Progress'
          )) {
            startTime = parseISO(change.created);
          }
          // Check for closed status (Indeed Jira uses "CLOSED")
          if (startTime && (
            item.toString === 'CLOSED' ||
            item.toString === 'Closed'
          )) {
            endTime = parseISO(change.created);
            break;
          }
        }
      }
      if (endTime) break;
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
  calculateBacklogHealth(issues) {
    // Filter out sub-tasks - backlog health should only evaluate parent-level items
    const parentIssues = issues.filter(i => !i.fields?.issuetype?.subtask);

    let withAcceptanceCriteria = 0;
    let withEstimates = 0;
    let linkedToGoals = 0;
    const storyPointsField = 'customfield_10061'; // Indeed Jira Story Points field

    const missingAC = [];
    const missingEstimates = [];
    const missingFixVersions = [];

    console.log(`\n📋 Backlog Health Analysis:`);
    console.log(`  Total backlog issues: ${parentIssues.length} (${issues.length - parentIssues.length} sub-tasks excluded)`);

    // Log first 3 issues for debugging
    if (parentIssues.length > 0) {
      console.log(`\n  Sample backlog issues (first 3):`);
      parentIssues.slice(0, 3).forEach((issue, idx) => {
        console.log(`  ${idx + 1}. ${issue.key}`);
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

    parentIssues.forEach(issue => {
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

    const total = parentIssues.length;

    console.log(`\n  Results:`);
    console.log(`    With Acceptance Criteria (keyword match): ${withAcceptanceCriteria}/${total}`);
    console.log(`    With Estimates: ${withEstimates}/${total}`);
    console.log(`    Linked to Goals: ${linkedToGoals}/${total}`);

    if (total === 0) {
      console.log(`  ⚠️  No backlog issues found!`);
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
  determineMaturityLevel(metrics) {
    const {
      rolloverRate = 0,
      sprintGoalAttainment = 0,
      backlogHealth = { overallScore: 0 },
      midSprintAdditions = 0
    } = metrics || {};

    // Ensure backlogHealth has the expected structure
    const backlogScore = backlogHealth?.overallScore ?? 0;

    // Level 1: Assisted Scrum (Scrum Manager Required)
    // Typical Characteristics:
    // - Rollover > 20-25%
    // - Sprint goals rarely met (<50-60%)
    // - High mid-sprint injection
    // - Low "Ready" rate on backlog
    // - Poor backlog hygiene
    if (
      rolloverRate > 25 ||
      sprintGoalAttainment < 50 ||
      backlogScore < 50 ||
      midSprintAdditions > 25
    ) {
      // Identify which metrics are blocking promotion to Level 2
      const blockers = [];
      if (rolloverRate > 25) blockers.push('rollover');
      if (sprintGoalAttainment < 50) blockers.push('sprintGoals');
      if (backlogScore < 50) blockers.push('backlog');
      if (midSprintAdditions > 25) blockers.push('midSprint');

      return {
        level: 1,
        name: 'Assisted Scrum',
        description: 'Scrum Manager Required',
        characteristics: [
          `Rollover: ${rolloverRate.toFixed(1)}% (must be ≤25% for Level 2)`,
          `Sprint Goals Met: ${sprintGoalAttainment.toFixed(1)}% (must be ≥50% for Level 2)`,
          `Backlog Health: ${backlogScore.toFixed(1)}% (must be ≥50% for Level 2)`,
          `Mid-Sprint Additions: ${midSprintAdditions.toFixed(1)}% (must be ≤25% for Level 2)`
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
    // Entry Criteria (Sustained for 3-4 sprints):
    // - <10-15% average rollover
    // - Sprint goals met >70%
    // - Minimal mid-sprint scope churn
    // - 90%+ backlog "Ready"
    // - Stable throughput
    if (
      rolloverRate < 15 &&
      sprintGoalAttainment > 70 &&
      backlogScore > 80 &&
      midSprintAdditions < 10
    ) {
      return {
        level: 3,
        name: 'Self-Managed Scrum',
        description: 'Scrum Manager Optional',
        characteristics: [
          `Rollover: ${rolloverRate.toFixed(1)}% (excellent: <15%)`,
          `Sprint Goals Met: ${sprintGoalAttainment.toFixed(1)}% (excellent: >70%)`,
          `Backlog Health: ${backlogScore.toFixed(1)}% (excellent: >80%)`,
          `Mid-Sprint Additions: ${midSprintAdditions.toFixed(1)}% (excellent: <10%)`
        ],
        blockers: [],
        recommendations: [
          'Continue excellence in delivery',
          'Focus on continuous improvement',
          'Share best practices with other teams',
          'Quarterly health checks recommended',
          'Ceremonies run without dependency',
          'Blockers resolved within the team'
        ]
      };
    }

    // Level 2: Supported Scrum (Conditional Support)
    // Identify which metrics are blocking promotion to Level 3
    const blockers = [];
    if (rolloverRate >= 15) blockers.push('rollover');
    if (sprintGoalAttainment <= 70) blockers.push('sprintGoals');
    if (backlogScore <= 80) blockers.push('backlog');
    if (midSprintAdditions >= 10) blockers.push('midSprint');

    return {
      level: 2,
      name: 'Supported Scrum',
      description: 'Conditional Support',
      characteristics: [
        `Rollover: ${rolloverRate.toFixed(1)}% (must be <15% for Level 3)`,
        `Sprint Goals Met: ${sprintGoalAttainment.toFixed(1)}% (must be >70% for Level 3)`,
        `Backlog Health: ${backlogScore.toFixed(1)}% (must be >80% for Level 3)`,
        `Mid-Sprint Additions: ${midSprintAdditions.toFixed(1)}% (must be <10% for Level 3)`
      ],
      blockers,
      supportModel: 'Shared Scrum Manager, Time-bound engagement (1-2 sprints/month)',
      recommendations: [
        'Pattern recognition (last-minute rush, WIP aging)',
        'Coaching Product on backlog ownership',
        'Enabling team-led ceremonies',
        'Driving retro action execution',
        'Some scope churn but manageable',
        'Flow is improving but inconsistent'
      ]
    };
  }

  // Aggregate metrics for multiple sprints
  aggregateSprintMetrics(sprintMetrics) {
    if (sprintMetrics.length === 0) return null;

    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

    return {
      avgRolloverRate: avg(sprintMetrics.map(s => s.rolloverRate || 0)),
      avgSprintGoalAttainment: avg(sprintMetrics.map(s => s.sprintGoalAttainment || 0)),
      avgSprintHitRate: avg(sprintMetrics.map(s => s.sprintHitRate || 0)),
      avgMidSprintAdditions: avg(sprintMetrics.map(s => s.midSprintAdditions?.percentage || 0)),
      totalSprints: sprintMetrics.length
    };
  }
}

export default MetricsService;
