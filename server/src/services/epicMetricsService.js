class EpicMetricsService {

  // Calculate progress for an epic based on its children
  calculateEpicProgress(children) {
    if (!children || children.length === 0) {
      return { total: 0, done: 0, inProgress: 0, todo: 0, totalPoints: 0, completedPoints: 0, progress: 0 };
    }

    let done = 0, inProgress = 0, todo = 0;
    let totalPoints = 0, completedPoints = 0;

    for (const child of children) {
      const statusCategory = child.fields?.status?.statusCategory?.key || 'new';
      const points = child.fields?.customfield_10061 || 0;
      totalPoints += points;

      if (statusCategory === 'done') {
        done++;
        completedPoints += points;
      } else if (statusCategory === 'indeterminate') {
        inProgress++;
      } else {
        todo++;
      }
    }

    const total = children.length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;

    return { total, done, inProgress, todo, totalPoints, completedPoints, progress };
  }

  // Determine epic health based on progress vs time elapsed
  calculateEpicHealth(epic, children, dependencies) {
    const statusCategory = epic.fields?.status?.statusCategory?.key;

    // Already done
    if (statusCategory === 'done') {
      return { health: 'done', reason: 'Completed' };
    }

    // Check if blocked by unresolved dependencies
    const blockedBy = dependencies?.blockedBy || [];
    const unresolvedBlockers = blockedBy.filter(b => {
      const status = (b.status || '').toLowerCase();
      return !['done', 'closed', 'resolved'].includes(status);
    });
    if (unresolvedBlockers.length > 0) {
      return {
        health: 'blocked',
        reason: `Blocked by ${unresolvedBlockers.map(b => b.key).join(', ')}`
      };
    }

    // Check progress vs time elapsed
    const dueDate = epic.fields?.duedate;
    const created = epic.fields?.created;
    const childProgress = this.calculateEpicProgress(children);

    if (!dueDate) {
      // No due date — base health purely on progress
      if (childProgress.total === 0) return { health: 'no-data', reason: 'No child issues' };
      if (childProgress.progress >= 70) return { health: 'on-track', reason: `${childProgress.progress}% done` };
      if (childProgress.progress >= 30) return { health: 'on-track', reason: `${childProgress.progress}% done` };
      return { health: 'on-track', reason: `${childProgress.progress}% done (no due date)` };
    }

    const now = new Date();
    const start = new Date(created);
    const end = new Date(dueDate);
    const totalTime = end - start;
    const elapsed = now - start;
    const timeProgress = totalTime > 0 ? Math.round((elapsed / totalTime) * 100) : 100;

    if (now > end) {
      // Past due
      if (childProgress.progress < 100) {
        return { health: 'at-risk', reason: `Overdue (${childProgress.progress}% done)` };
      }
    }

    // At risk: time elapsed significantly exceeds work progress
    if (timeProgress > 0 && childProgress.progress < timeProgress - 15) {
      return {
        health: 'at-risk',
        reason: `${childProgress.progress}% done, ${timeProgress}% time elapsed`
      };
    }

    return { health: 'on-track', reason: `${childProgress.progress}% done` };
  }

  // Build a complete epic data object
  buildEpicData(epic, children, dependencies) {
    const childProgress = this.calculateEpicProgress(children);
    const healthInfo = this.calculateEpicHealth(epic, children, dependencies);

    return {
      key: epic.key,
      id: epic.id,
      summary: epic.fields?.summary || '',
      status: epic.fields?.status?.name || 'Unknown',
      statusCategory: epic.fields?.status?.statusCategory?.key || 'new',
      priority: epic.fields?.priority?.name || 'None',
      labels: epic.fields?.labels || [],
      components: (epic.fields?.components || []).map(c => c.name),
      fixVersions: (epic.fields?.fixVersions || []).map(v => v.name),
      assignee: epic.fields?.assignee?.displayName || 'Unassigned',
      created: epic.fields?.created,
      updated: epic.fields?.updated,
      dueDate: epic.fields?.duedate || null,
      resolutionDate: epic.fields?.resolutiondate || null,
      // Jira Plans / Advanced Roadmaps date fields
      targetStart: epic.fields?.customfield_10015 || epic.fields?.customfield_10011 || null,
      targetEnd: epic.fields?.customfield_10016 || null,
      storyPoints: epic.fields?.customfield_10061 || 0,
      parentKey: epic.fields?.parent?.key || null,
      children: {
        ...childProgress,
        issues: children.map(c => ({
          key: c.key,
          summary: c.fields?.summary || '',
          status: c.fields?.status?.name || 'Unknown',
          statusCategory: c.fields?.status?.statusCategory?.key || 'new',
          type: c.fields?.issuetype?.name || 'Unknown',
          assignee: c.fields?.assignee?.displayName || 'Unassigned',
          storyPoints: c.fields?.customfield_10061 || 0
        }))
      },
      progress: childProgress.progress,
      health: healthInfo.health,
      healthReason: healthInfo.reason,
      dependencies: dependencies || { blocks: [], blockedBy: [], relatesTo: [] }
    };
  }

  // Aggregate epics by their parent initiative
  aggregateByInitiative(initiatives, epics) {
    const initiativeMap = new Map();

    // Initialize with known initiatives
    for (const init of initiatives) {
      initiativeMap.set(init.key, {
        key: init.key,
        summary: init.fields?.summary || '',
        status: init.fields?.status?.name || 'Unknown',
        statusCategory: init.fields?.status?.statusCategory?.key || 'new',
        assignee: init.fields?.assignee?.displayName || 'Unassigned',
        dueDate: init.fields?.duedate || null,
        epics: [],
        totalEpics: 0,
        completedEpics: 0,
        progress: 0,
        totalStoryPoints: 0,
        completedStoryPoints: 0
      });
    }

    // Add an "Unlinked" bucket for epics without a parent initiative
    initiativeMap.set('_unlinked', {
      key: '_unlinked',
      summary: 'Epics without Initiative',
      status: '-',
      statusCategory: 'new',
      assignee: '-',
      dueDate: null,
      epics: [],
      totalEpics: 0,
      completedEpics: 0,
      progress: 0,
      totalStoryPoints: 0,
      completedStoryPoints: 0
    });

    // Assign epics to initiatives
    for (const epic of epics) {
      const parentKey = epic.parentKey || '_unlinked';
      const initiative = initiativeMap.get(parentKey) || initiativeMap.get('_unlinked');

      initiative.epics.push({
        key: epic.key,
        summary: epic.summary,
        status: epic.status,
        progress: epic.progress,
        health: epic.health,
        storyPoints: epic.children.totalPoints,
        completedPoints: epic.children.completedPoints
      });

      initiative.totalEpics++;
      if (epic.statusCategory === 'done') initiative.completedEpics++;
      initiative.totalStoryPoints += epic.children.totalPoints;
      initiative.completedStoryPoints += epic.children.completedPoints;
    }

    // Calculate progress per initiative
    for (const init of initiativeMap.values()) {
      init.progress = init.totalEpics > 0
        ? Math.round((init.completedEpics / init.totalEpics) * 100)
        : 0;
    }

    // Convert to array, filter out empty unlinked bucket
    const result = Array.from(initiativeMap.values());
    return result.filter(i => i.key !== '_unlinked' || i.epics.length > 0);
  }

  // Calculate throughput: epics completed per period
  calculateThroughput(epics, periodType = 'month') {
    const completed = epics.filter(e => e.statusCategory === 'done' && e.resolutionDate);
    const periodMap = new Map();

    for (const epic of completed) {
      const date = new Date(epic.resolutionDate);
      let periodKey;

      if (periodType === 'month') {
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (periodType === 'quarter') {
        const quarter = Math.ceil((date.getMonth() + 1) / 3);
        periodKey = `${date.getFullYear()} Q${quarter}`;
      } else {
        // week
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - date.getDay());
        periodKey = startOfWeek.toISOString().split('T')[0];
      }

      periodMap.set(periodKey, (periodMap.get(periodKey) || 0) + 1);
    }

    // Sort by period
    const sorted = Array.from(periodMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, count]) => ({ period, count }));

    return sorted;
  }

  // ==============================
  // PHASE 2: PRIORITIZATION
  // ==============================

  // Calculate WSJF score for an epic
  // WSJF = Cost of Delay / Job Size
  // Cost of Delay = Business Value + Time Criticality + Risk Reduction
  calculateWSJF(epic, fieldMappings) {
    let businessValue = 0, timeCriticality = 0, riskReduction = 0, jobSize = 1;

    if (fieldMappings) {
      // Use mapped custom fields from Jira
      businessValue = epic._rawFields?.[fieldMappings.businessValue] || 0;
      timeCriticality = epic._rawFields?.[fieldMappings.timeCriticality] || 0;
      riskReduction = epic._rawFields?.[fieldMappings.riskReduction] || 0;
      jobSize = epic._rawFields?.[fieldMappings.jobSize] || epic.children?.totalPoints || 1;
    } else {
      // Fallback: composite score using multiple signals for better spread
      const priorityScores = { 'Highest': 5, 'High': 4, 'Medium': 3, 'Low': 2, 'Lowest': 1 };
      const basePriority = priorityScores[epic.priority] || 3;

      // Factor in child issue count (more children = bigger/more important epic)
      const childCount = epic.children?.total || 0;
      const childBonus = childCount >= 20 ? 2 : childCount >= 10 ? 1.5 : childCount >= 5 ? 1 : 0.5;

      // Factor in progress (invested work signals value)
      const progressBonus = (epic.progress || 0) > 50 ? 0.5 : 0;

      // Factor in health (blocked items may signal dependencies = importance)
      const healthBonus = epic.health === 'blocked' ? 1 : epic.health === 'at-risk' ? 0.5 : 0;

      // Composite business value: 1-8 range with more spread
      businessValue = Math.min(8, Math.round((basePriority + childBonus + progressBonus + healthBonus) * 10) / 10);

      // Time criticality: higher for items with closer due dates
      if (epic.dueDate) {
        const daysUntilDue = (new Date(epic.dueDate) - new Date()) / (1000 * 60 * 60 * 24);
        timeCriticality = daysUntilDue < 14 ? 5 : daysUntilDue < 30 ? 4 : daysUntilDue < 60 ? 3 : daysUntilDue < 90 ? 2 : 1;
      } else {
        timeCriticality = 2;
      }

      // Risk reduction: higher for blocked/at-risk items
      riskReduction = epic.health === 'blocked' ? 4 : epic.health === 'at-risk' ? 3 : 2;
      jobSize = epic.children?.totalPoints || epic.storyPoints || 1;
    }

    // Prevent division by zero
    jobSize = Math.max(jobSize, 0.5);

    const costOfDelay = businessValue + timeCriticality + riskReduction;
    const wsjfScore = Math.round((costOfDelay / jobSize) * 100) / 100;

    return {
      businessValue,
      timeCriticality,
      riskReduction,
      jobSize,
      costOfDelay,
      wsjfScore
    };
  }

  // Categorize epics by MoSCoW (Must/Should/Could/Won't)
  categorizeMoSCoW(epic, fieldMappings) {
    // Check for explicit label-based categorization
    const labels = (epic.labels || []).map(l => l.toLowerCase());
    if (labels.some(l => l.includes('must'))) return 'Must Have';
    if (labels.some(l => l.includes('should'))) return 'Should Have';
    if (labels.some(l => l.includes('could'))) return 'Could Have';
    if (labels.some(l => l.includes('wont') || l.includes("won't"))) return "Won't Have";

    // Check custom field if mapped
    if (fieldMappings?.moscow && epic._rawFields?.[fieldMappings.moscow]) {
      const val = String(epic._rawFields[fieldMappings.moscow]).toLowerCase();
      if (val.includes('must')) return 'Must Have';
      if (val.includes('should')) return 'Should Have';
      if (val.includes('could')) return 'Could Have';
      if (val.includes('wont') || val.includes("won't")) return "Won't Have";
    }

    // Fallback: derive from composite signals (not just priority alone)
    // Use priority + health + child count + progress for better distribution
    const priorityScore = { 'Highest': 5, 'High': 4, 'Medium': 3, 'Low': 2, 'Lowest': 1 }[epic.priority] || 3;
    const childCount = epic.children?.total || 0;
    const hasBlockers = epic.health === 'blocked';
    const isAtRisk = epic.health === 'at-risk';
    const hasDueDate = !!epic.dueDate;
    const daysUntilDue = hasDueDate ? (new Date(epic.dueDate) - new Date()) / (1000 * 60 * 60 * 24) : 999;

    // Composite score for MoSCoW classification
    let score = priorityScore;
    if (hasBlockers) score += 1.5; // blocked = urgent
    if (isAtRisk) score += 1;
    if (childCount >= 15) score += 1; // large epic = important
    if (daysUntilDue < 30) score += 1.5; // due soon
    else if (daysUntilDue < 60) score += 0.5;
    if (childCount <= 2 && !hasDueDate) score -= 1; // small, no deadline

    if (score >= 6) return 'Must Have';
    if (score >= 4.5) return 'Should Have';
    if (score >= 3) return 'Could Have';
    return "Won't Have";
  }

  // Build prioritization data for all epics
  buildPrioritizationData(epics, fieldMappings) {
    const prioritizedEpics = epics
      .filter(e => e.statusCategory !== 'done') // only active/upcoming epics
      .map(epic => {
        const wsjf = this.calculateWSJF(epic, fieldMappings);
        const moscow = this.categorizeMoSCoW(epic, fieldMappings);

        // Effort: prefer story points, fallback to child issue count as proxy
        const spEffort = epic.children?.totalPoints || epic.storyPoints || 0;
        const childCount = epic.children?.total || 0;
        // If no story points, use child count as effort proxy (1 child ≈ 2 SP)
        const effort = spEffort > 0 ? spEffort : childCount * 2;

        return {
          key: epic.key,
          summary: epic.summary,
          status: epic.status,
          statusCategory: epic.statusCategory,
          priority: epic.priority,
          health: epic.health,
          assignee: epic.assignee,
          progress: epic.progress,
          labels: epic.labels,
          // Value vs Effort coordinates
          effort,
          effortSource: spEffort > 0 ? 'story_points' : 'child_count',
          value: wsjf.businessValue,
          // WSJF breakdown
          wsjf,
          // MoSCoW category
          moscow
        };
      });

    // Sort by WSJF score descending
    prioritizedEpics.sort((a, b) => b.wsjf.wsjfScore - a.wsjf.wsjfScore);

    // MoSCoW distribution
    const moscowDistribution = {
      'Must Have': 0,
      'Should Have': 0,
      'Could Have': 0,
      "Won't Have": 0
    };
    for (const epic of prioritizedEpics) {
      moscowDistribution[epic.moscow] = (moscowDistribution[epic.moscow] || 0) + 1;
    }

    // Value vs Effort quadrant counts
    const effortValues = prioritizedEpics.filter(e => e.effort > 0).map(e => e.effort);
    const valueValues = prioritizedEpics.filter(e => e.value > 0).map(e => e.value);
    const medianEffort = effortValues.length > 0
      ? effortValues.sort((a, b) => a - b)[Math.floor(effortValues.length / 2)]
      : 5;
    const medianValue = valueValues.length > 0
      ? valueValues.sort((a, b) => a - b)[Math.floor(valueValues.length / 2)]
      : 3;

    const quadrants = {
      quickWins: prioritizedEpics.filter(e => e.value >= medianValue && e.effort < medianEffort).length,
      bigBets: prioritizedEpics.filter(e => e.value >= medianValue && e.effort >= medianEffort).length,
      fillIns: prioritizedEpics.filter(e => e.value < medianValue && e.effort < medianEffort).length,
      moneyPit: prioritizedEpics.filter(e => e.value < medianValue && e.effort >= medianEffort).length
    };

    return {
      epics: prioritizedEpics,
      moscowDistribution,
      quadrants,
      medianEffort,
      medianValue
    };
  }

  // ==============================
  // PHASE 3: PORTFOLIO & FORECASTING
  // ==============================

  // Build Cumulative Flow Diagram data for epics over time (weekly snapshots)
  buildCumulativeFlow(epics, weeks = 12) {
    const now = new Date();
    const snapshots = [];

    for (let i = weeks - 1; i >= 0; i--) {
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() - i * 7);
      weekEnd.setHours(23, 59, 59, 999);

      const weekLabel = weekEnd.toISOString().split('T')[0];

      let done = 0, inProgress = 0, todo = 0;

      for (const epic of epics) {
        const createdDate = epic.created ? new Date(epic.created) : null;
        if (!createdDate || createdDate > weekEnd) continue; // didn't exist yet

        const resolutionDate = epic.resolutionDate ? new Date(epic.resolutionDate) : null;

        if (resolutionDate && resolutionDate <= weekEnd) {
          done++;
        } else if (epic.statusCategory === 'indeterminate') {
          // Approximate: if currently in progress and not resolved by weekEnd, count as in-progress
          // For historical accuracy, we'd need changelogs, but this is a reasonable approximation
          inProgress++;
        } else if (epic.statusCategory === 'done' && (!resolutionDate || resolutionDate > weekEnd)) {
          // Was done later, so at this point it was in progress
          inProgress++;
        } else {
          todo++;
        }
      }

      snapshots.push({ week: weekLabel, done, inProgress, todo });
    }

    return snapshots;
  }

  // Calculate lead time and cycle time for resolved epics
  calculateEpicLeadCycleTime(epics) {
    const resolvedEpics = epics.filter(e => e.statusCategory === 'done' && e.resolutionDate && e.created);

    const leadTimes = [];
    const epicDetails = [];

    for (const epic of resolvedEpics) {
      const created = new Date(epic.created);
      const resolved = new Date(epic.resolutionDate);
      const leadTimeDays = Math.round((resolved - created) / (1000 * 60 * 60 * 24));

      if (leadTimeDays >= 0) {
        leadTimes.push(leadTimeDays);
        epicDetails.push({
          key: epic.key,
          summary: epic.summary,
          created: epic.created,
          resolved: epic.resolutionDate,
          leadTimeDays
        });
      }
    }

    // Sort for percentile calculation
    const sorted = [...leadTimes].sort((a, b) => a - b);
    const percentile = (arr, p) => {
      if (arr.length === 0) return 0;
      const idx = Math.ceil(arr.length * p / 100) - 1;
      return arr[Math.max(0, idx)];
    };

    const avg = sorted.length > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0;

    // Build histogram (bucket by 7-day intervals)
    const histogram = [];
    if (sorted.length > 0) {
      const maxDays = sorted[sorted.length - 1];
      const bucketSize = 7;
      for (let start = 0; start <= maxDays; start += bucketSize) {
        const end = start + bucketSize;
        const count = sorted.filter(d => d >= start && d < end).length;
        histogram.push({ range: `${start}-${end}d`, start, end, count });
      }
    }

    return {
      totalResolved: resolvedEpics.length,
      average: avg,
      percentiles: {
        p50: percentile(sorted, 50),
        p70: percentile(sorted, 70),
        p85: percentile(sorted, 85),
        p95: percentile(sorted, 95)
      },
      histogram,
      epics: epicDetails.sort((a, b) => b.leadTimeDays - a.leadTimeDays)
    };
  }

  // Calculate WIP (Work in Progress) metrics
  calculateWIPMetrics(epics, initiatives) {
    const wipEpics = epics.filter(e => e.statusCategory === 'indeterminate');
    const wipByAssignee = {};
    const wipByInitiative = {};

    for (const epic of wipEpics) {
      // By assignee
      const assignee = epic.assignee || 'Unassigned';
      wipByAssignee[assignee] = (wipByAssignee[assignee] || 0) + 1;

      // By initiative
      const parentKey = epic.parentKey || '_unlinked';
      const initName = initiatives?.find(i => i.key === parentKey)?.summary || 'Unlinked';
      wipByInitiative[initName] = (wipByInitiative[initName] || 0) + 1;
    }

    // WIP age: how long each epic has been in progress (from created date)
    const wipAge = wipEpics.map(epic => {
      const created = new Date(epic.created);
      const ageDays = Math.round((new Date() - created) / (1000 * 60 * 60 * 24));
      return {
        key: epic.key,
        summary: epic.summary,
        assignee: epic.assignee,
        ageDays,
        health: epic.health
      };
    }).sort((a, b) => b.ageDays - a.ageDays);

    return {
      totalWIP: wipEpics.length,
      wipByAssignee: Object.entries(wipByAssignee)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      wipByInitiative: Object.entries(wipByInitiative)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      wipAge,
      avgAge: wipAge.length > 0
        ? Math.round(wipAge.reduce((sum, e) => sum + e.ageDays, 0) / wipAge.length)
        : 0
    };
  }

  // Build summary statistics
  buildSummary(epics) {
    const total = epics.length;
    const done = epics.filter(e => e.statusCategory === 'done').length;
    const inProgress = epics.filter(e => e.statusCategory === 'indeterminate').length;
    const todo = epics.filter(e => e.statusCategory === 'new' || e.statusCategory === 'undefined').length;
    const atRisk = epics.filter(e => e.health === 'at-risk').length;
    const blocked = epics.filter(e => e.health === 'blocked').length;
    const totalStoryPoints = epics.reduce((sum, e) => sum + (e.children?.totalPoints || 0), 0);
    const completedStoryPoints = epics.reduce((sum, e) => sum + (e.children?.completedPoints || 0), 0);

    return {
      total, done, inProgress, todo, atRisk, blocked,
      totalStoryPoints, completedStoryPoints
    };
  }
}

export default new EpicMetricsService();
