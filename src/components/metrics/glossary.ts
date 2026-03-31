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
    formula: '100 - penalties from scope churn, schedule variance, and completion stability',
    caveat: 'Projection range (`P50`/`P85`) reflects uncertainty, not guarantees.',
    action: 'Use the driver breakdown to target the dominant penalty first.',
  },
  cycle_percentiles: {
    title: 'Cycle/Lead Percentiles',
    formula: 'Median (p50), p85, p95, and sample size by completion bucket',
    caveat: 'Low sample sizes increase percentile volatility.',
    action: 'Read percentiles with sample size before acting on week-over-week swings.',
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
    formula: 'Reopen events per 100 completed tasks + trend slope',
    caveat: 'Short windows can spike when a few tasks churn repeatedly.',
    action: 'Escalate when threshold status is watch/breach for multiple periods.',
  },
  unblock_efficiency: {
    title: 'Unblock Efficiency',
    formula: 'Priority-weighted blocked days + open-blocker SLA breach rate',
    caveat: 'Raw blocked count alone can hide severity concentration.',
    action: 'Reduce weighted blocked days first, then optimize unblock cycle time.',
  },
  load_ratio: {
    title: 'Load Ratio',
    formula: 'Current WIP / calibrated capacity (base threshold x role factor x team factor)',
    caveat: 'Confidence badges indicate when member-level sample is too small to trust strongly.',
    action: 'Prioritize rebalance for overloads with medium/high confidence.',
  },
  schedule_variance: {
    title: 'Schedule Variance',
    formula: 'Projected end date - planned end date (days), combined with scope and blocked-pressure thresholds',
    caveat: 'Projection depends on observed throughput and can shift with scope.',
    action: 'Use risk breakdown evidence (variance, scope, blocked pressure) before changing commitment dates.',
  },
  at_risk_work: {
    title: 'At-Risk Work',
    formula: 'Overdue + Blocked + Aging WIP + Ownership/Review gaps with owner rollup and time-in-risk',
    caveat: 'Aggregate totals can hide concentration under a single team/member owner.',
    action: 'Use owner rollups and time-in-risk to assign mitigation ownership quickly.',
  },
  on_time_rate: {
    title: 'On-Time Rate',
    formula: 'Blended v2 on-time rate (planned + unplanned) using only completed tasks with valid due dates',
    caveat: 'Invalid or missing due dates are excluded; review due-date quality rate alongside on-time.',
    action: 'Use planned vs unplanned split to target intake planning vs execution slippage.',
  },
  exec_portfolio_health_score: {
    title: 'Portfolio Health Score',
    formula: 'Weighted composite of predictability, quality, blocker pressure, and workload balance.',
    caveat: 'Composite can hide regressions in a single dimension; inspect component subscores.',
    action: 'Use score drops as a trigger to inspect predictability, quality, blockers, and workload in parallel.',
  },
  exec_delivery_confidence_distribution: {
    title: 'Delivery Confidence Distribution',
    formula: 'Delivery confidence bands from confidence scores: high (>=75), medium (45..74), low (<45).',
    caveat: 'Band quality depends on delivery projection and scope-linking accuracy.',
    action: 'Reduce low-confidence concentration by controlling scope volatility and blocker pressure.',
  },
  exec_forecast_bias: {
    title: 'Forecast Bias',
    formula: 'Mean signed schedule variance days across scoped deliveries.',
    caveat: 'Early bias can be caused by scope deferral, not only execution gain.',
    action: 'Track bias trend and calibrate planning assumptions by product/team.',
  },
  exec_scope_volatility_burn: {
    title: 'Scope Volatility Burn',
    formula: 'Trend of scope added after start against delivery outcome quality.',
    caveat: 'Exploratory phases can legitimately raise volatility for short periods.',
    action: 'When volatility rises with worsening outcomes, freeze intake and re-baseline.',
  },
  exec_risk_burndown: {
    title: 'Risk Burndown',
    formula: 'Week-over-week net change in at-risk work volume.',
    caveat: 'Single-week deltas can be noisy; evaluate sustained direction.',
    action: 'Escalate when net at-risk work grows for multiple consecutive weeks.',
  },
  exec_initiative_execution_confidence: {
    title: 'Initiative Execution Confidence',
    formula: 'Initiative status score + linked delivery predictability - blocker pressure penalty.',
    caveat: 'Confidence is less reliable when initiatives have weak delivery/task linkage.',
    action: 'Prioritize low-confidence initiatives for dependency and scope intervention.',
  },
  exec_quality_cost_index: {
    title: 'Quality Cost Index',
    formula: 'Weighted blend of rework rate, reopen rate, and escaped defects intensity.',
    caveat: 'High throughput windows can inflate raw counts without normalization.',
    action: 'Use upward moves as an early warning of delivery-impacting quality debt.',
  },
  exec_throughput_stability_index: {
    title: 'Throughput Stability Index',
    formula: '100 minus throughput volatility coefficient (clamped to 0..100).',
    caveat: 'Low-volume streams are more sensitive to random variation.',
    action: 'Stabilize intake and WIP policy when stability index drops.',
  },
  exec_cross_product_bottleneck_heatmap: {
    title: 'Cross-Product Bottleneck Heatmap',
    formula: 'Per-product bottleneck score from blocked pressure and overload pressure.',
    caveat: 'Highlights concentration, not root cause.',
    action: 'Use hotspot products to target cross-team unblock and load-balancing actions.',
  },
  exec_customer_impact_proxy: {
    title: 'Customer-Impact Proxy',
    formula: 'Critical feedback backlog pressure + p85 acknowledge/resolve SLA pressure.',
    caveat: 'Requires lifecycle timestamps (`acknowledgedAt`, `resolvedAt`) for high confidence.',
    action: 'Escalate when customer-impact proxy rises with critical feedback backlog.',
  },
}
