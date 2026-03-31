export interface MetricGlossaryEntry {
  title: string
  formula: string
  caveat: string
  action: string
}

export const METRIC_GLOSSARY: Record<string, MetricGlossaryEntry> = {
  action_score: {
    title: 'Action Score',
    formula: '100 - weighted penalties (overdue, blocked, stale, review SLA, due soon)',
    caveat: 'Heuristic score; intended for prioritization, not performance ranking.',
    action: 'Focus on top penalties first to improve risk posture.',
  },
  net_flow: {
    title: 'Net Flow',
    formula: 'Arrival rate - Departure rate per period',
    caveat: 'Short windows can look noisy; read with rolling mean/std.',
    action: 'Sustained positive net flow means backlog growth risk.',
  },
  system_balance: {
    title: 'System Balance',
    formula: 'Arrival, departure, and rolling net-flow variability (±1σ)',
    caveat: 'Single buckets can spike during releases or migrations; evaluate slope and variability together.',
    action: 'If departure stays below arrival while variability widens, reduce intake or increase completion throughput.',
  },
  predictability_confidence: {
    title: 'Predictability Confidence',
    formula: 'Confidence score based on delivery variance and throughput stability',
    caveat: 'Projection range (`P50`/`P85`) reflects uncertainty, not guarantees.',
    action: 'Use low confidence as a trigger to reduce scope volatility.',
  },
  cycle_percentiles: {
    title: 'Cycle/Lead Percentiles',
    formula: 'p50/p85/p95 calculated by completion bucket',
    caveat: 'Low sample sizes increase percentile volatility.',
    action: 'Track p85 trend first to detect tail risk growth.',
  },
  flow_efficiency: {
    title: 'Flow Efficiency',
    formula: 'Active work time / Lead time',
    caveat: 'A high ratio can still mask long absolute lead times if scope is large.',
    action: 'Use alongside p85 lead/cycle percentiles to identify queueing bottlenecks.',
  },
  first_pass_rate: {
    title: 'First-Pass Rate',
    formula: 'Completed tasks without rework transitions / completed tasks',
    caveat: 'Depends on workflow transition accuracy; missing status events can inflate the value.',
    action: 'Use with reopen/rework trends to validate quality stability.',
  },
  reopen_rate: {
    title: 'Reopen Rate',
    formula: 'Reopen transitions (`done` -> active) / completed tasks',
    caveat: 'High rates may indicate quality leakage or unstable requirements.',
    action: 'Review acceptance criteria and review quality for reopened tasks.',
  },
  unblock_efficiency: {
    title: 'Unblock Efficiency',
    formula: 'Median time-to-unblock + SLA hit rate',
    caveat: 'Averages hide long-tail delays; percentile/histogram matters.',
    action: 'Prioritize recurring blocker reasons and SLA breaches.',
  },
  load_ratio: {
    title: 'Load Ratio',
    formula: 'Current WIP / Capacity threshold',
    caveat: 'Capacity is a proxy unless explicit per-user capacity is configured.',
    action: 'Rebalance ownership when ratio remains above 1.0.',
  },
  schedule_variance: {
    title: 'Schedule Variance',
    formula: 'Projected end date - planned end date (in days)',
    caveat: 'Projection depends on observed throughput and can shift with scope.',
    action: 'Escalate when variance worsens while scope keeps growing.',
  },
  at_risk_work: {
    title: 'At-Risk Work',
    formula: 'Overdue + Blocked + Aging WIP + Ownership/Review gaps',
    caveat: 'Aggregate risk view; investigate category chips for root causes.',
    action: 'Address categories in severity order to reduce concentration.',
  },
  on_time_rate: {
    title: 'On-Time Rate',
    formula: 'Completed tasks delivered on/before due date within selected window',
    caveat: 'Depends on due-date hygiene; missing or stale due dates reduce signal quality.',
    action: 'Track trend direction and pair with overdue ratio to spot scheduling risk.',
  },
}
