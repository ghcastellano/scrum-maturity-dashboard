import { differenceInDays, differenceInHours, parseISO } from 'date-fns';

class MetricsService {
  
  // Calculate Sprint Goal Attainment
  calculateSprintGoalAttainment(sprint, issues) {
    const storyPointsField = 'customfield_10016'; // Padrão Jira, ajustar se necessário
    
    let committedPoints = 0;
    let completedPoints = 0;
    
    issues.forEach(issue => {
      const points = issue.fields[storyPointsField] || 0;
      committedPoints += points;
      
      if (issue.fields.status.statusCategory.key === 'done') {
        completedPoints += points;
      }
    });
    
    return committedPoints > 0 ? (completedPoints / committedPoints) * 100 : 0;
  }

  // Calculate Rollover Rate
  calculateRolloverRate(sprintIssues, nextSprintIssues) {
    if (!nextSprintIssues || nextSprintIssues.length === 0) {
      return 0;
    }

    const currentSprintKeys = new Set(sprintIssues.map(i => i.key));
    const rolledOverIssues = nextSprintIssues.filter(issue => {
      return currentSprintKeys.has(issue.key) && 
             issue.fields.status.statusCategory.key !== 'done';
    });

    return sprintIssues.length > 0 ? (rolledOverIssues.length / sprintIssues.length) * 100 : 0;
  }

  // Calculate Sprint Hit Rate
  calculateSprintHitRate(issues) {
    const total = issues.length;
    const completed = issues.filter(i => i.fields.status.statusCategory.key === 'done').length;
    
    return total > 0 ? (completed / total) * 100 : 0;
  }

  // Calculate Mid-Sprint Additions
  calculateMidSprintAdditions(issues, sprintStartDate) {
    const sprintStart = parseISO(sprintStartDate);
    
    const addedDuringSprint = issues.filter(issue => {
      const created = parseISO(issue.fields.created);
      return created > sprintStart;
    });

    return {
      count: addedDuringSprint.length,
      percentage: issues.length > 0 ? (addedDuringSprint.length / issues.length) * 100 : 0
    };
  }

  // Calculate Cycle Time
  calculateCycleTime(issue, changelog) {
    let startTime = null;
    let endTime = null;

    // Find when issue moved to "In Progress"
    for (const change of changelog) {
      for (const item of change.items) {
        if (item.field === 'status') {
          if (item.toString === 'In Progress' && !startTime) {
            startTime = parseISO(change.created);
          }
          if (item.toString === 'Done' && startTime) {
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

  // Calculate Backlog Health Score
  calculateBacklogHealth(issues) {
    let withAcceptanceCriteria = 0;
    let withEstimates = 0;
    let linkedToGoals = 0;
    const storyPointsField = 'customfield_10016';

    issues.forEach(issue => {
      // Check for AC (assuming description length > 50 chars indicates AC)
      if (issue.fields.description && issue.fields.description.length > 50) {
        withAcceptanceCriteria++;
      }

      // Check for estimates
      if (issue.fields[storyPointsField]) {
        withEstimates++;
      }

      // Check for links to goals/fix versions
      if (issue.fields.fixVersions && issue.fields.fixVersions.length > 0) {
        linkedToGoals++;
      }
    });

    const total = issues.length;
    if (total === 0) return 0;

    return {
      withAcceptanceCriteria: (withAcceptanceCriteria / total) * 100,
      withEstimates: (withEstimates / total) * 100,
      linkedToGoals: (linkedToGoals / total) * 100,
      overallScore: ((withAcceptanceCriteria + withEstimates + linkedToGoals) / (total * 3)) * 100
    };
  }

  // Calculate Defect Distribution
  calculateDefectDistribution(issues) {
    const bugs = issues.filter(i => i.fields.issuetype.name === 'Bug');
    
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

  // Calculate WIP Aging
  calculateWIPAging(issues, changelog) {
    const wipIssues = issues.filter(i => 
      i.fields.status.statusCategory.key === 'indeterminate'
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
    const { rolloverRate, sprintGoalAttainment, backlogHealth, midSprintAdditions } = metrics;

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
      backlogHealth.overallScore < 50 ||
      midSprintAdditions > 25
    ) {
      return {
        level: 1,
        name: 'Assisted Scrum',
        description: 'Scrum Manager Required',
        characteristics: [
          `Rollover: ${rolloverRate.toFixed(1)}% (threshold: >20-25%)`,
          `Sprint Goals Met: ${sprintGoalAttainment.toFixed(1)}% (threshold: <50-60%)`,
          `Backlog Health: ${backlogHealth.overallScore.toFixed(1)}% (needs improvement)`,
          `Mid-Sprint Additions: ${midSprintAdditions.toFixed(1)}% (high churn)`
        ],
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
      backlogHealth.overallScore > 80 &&
      midSprintAdditions < 10
    ) {
      return {
        level: 3,
        name: 'Self-Managed Scrum',
        description: 'Scrum Manager Optional',
        characteristics: [
          `Rollover: ${rolloverRate.toFixed(1)}% (excellent: <10-15%)`,
          `Sprint Goals Met: ${sprintGoalAttainment.toFixed(1)}% (excellent: >70%)`,
          `Backlog Health: ${backlogHealth.overallScore.toFixed(1)}% (excellent: >80%)`,
          `Mid-Sprint Additions: ${midSprintAdditions.toFixed(1)}% (minimal churn)`
        ],
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
    // Typical Characteristics:
    // - Rollover ~10-20%
    // - Sprint goals met ~60-70%
    // - Some scope churn but manageable
    // - Backlog mostly healthy
    return {
      level: 2,
      name: 'Supported Scrum',
      description: 'Conditional Support',
      characteristics: [
        `Rollover: ${rolloverRate.toFixed(1)}% (target: 10-20%)`,
        `Sprint Goals Met: ${sprintGoalAttainment.toFixed(1)}% (target: 60-70%)`,
        `Backlog Health: ${backlogHealth.overallScore.toFixed(1)}% (improving)`,
        `Mid-Sprint Additions: ${midSprintAdditions.toFixed(1)}% (manageable)`
      ],
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
