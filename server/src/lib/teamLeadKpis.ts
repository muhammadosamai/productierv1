export type TeamLeadKpiKey =
  | 'review_sla_adherence'
  | 'review_queue_age'
  | 'aging_wip_index'
  | 'dependency_delay_index'
  | 'commitment_reliability_iteration'
  | 'context_switch_pressure'
  | 'execution_focus_ratio'
  | 'defect_leakage_by_delivery'
  | 'handoff_latency'
  | 'overload_forecast_2w'
  | 'assignee_concentration_risk'

export type TeamLeadKpiUnit = 'percent' | 'days' | 'hours' | 'ratio' | 'count'
export type TeamLeadKpiTargetDirection = 'higher' | 'lower' | 'neutral'

export interface TeamLeadKpiDefinition {
  key: TeamLeadKpiKey
  widgetType: string
  label: string
  description: string
  unit: TeamLeadKpiUnit
  targetDirection: TeamLeadKpiTargetDirection
}

export const TEAM_LEAD_KPI_DEFINITIONS: TeamLeadKpiDefinition[] = [
  {
    key: 'review_sla_adherence',
    widgetType: 'metrics_team_lead_review_sla_adherence',
    label: 'Review SLA Adherence',
    description: 'Tasks reviewed within the configured SLA window.',
    unit: 'percent',
    targetDirection: 'higher',
  },
  {
    key: 'review_queue_age',
    widgetType: 'metrics_team_lead_review_queue_age',
    label: 'Review Queue Age',
    description: 'Median age in hours for tasks waiting in review.',
    unit: 'hours',
    targetDirection: 'lower',
  },
  {
    key: 'aging_wip_index',
    widgetType: 'metrics_team_lead_aging_wip_index',
    label: 'Aging WIP Index',
    description: 'Weighted index for stale in-progress and in-review work.',
    unit: 'ratio',
    targetDirection: 'lower',
  },
  {
    key: 'dependency_delay_index',
    widgetType: 'metrics_team_lead_dependency_delay_index',
    label: 'Dependency Delay Index',
    description: 'Dependency-blocked pressure and average unblock delay.',
    unit: 'days',
    targetDirection: 'lower',
  },
  {
    key: 'commitment_reliability_iteration',
    widgetType: 'metrics_team_lead_commitment_reliability_iteration',
    label: 'Commitment Reliability',
    description: 'Planned vs completed work reliability in active delivery windows.',
    unit: 'percent',
    targetDirection: 'higher',
  },
  {
    key: 'context_switch_pressure',
    widgetType: 'metrics_team_lead_context_switch_pressure',
    label: 'Context Switch Pressure',
    description: 'Per-member active load multiplied by type fragmentation.',
    unit: 'ratio',
    targetDirection: 'lower',
  },
  {
    key: 'execution_focus_ratio',
    widgetType: 'metrics_team_lead_execution_focus_ratio',
    label: 'Execution Focus Ratio',
    description: 'Planned execution share relative to interrupt inflow.',
    unit: 'percent',
    targetDirection: 'higher',
  },
  {
    key: 'defect_leakage_by_delivery',
    widgetType: 'metrics_team_lead_defect_leakage_by_delivery',
    label: 'Defect Leakage by Delivery',
    description: 'Defects opened outside test cycles as a share of total.',
    unit: 'percent',
    targetDirection: 'lower',
  },
  {
    key: 'handoff_latency',
    widgetType: 'metrics_team_lead_handoff_latency',
    label: 'Handoff Latency',
    description: 'Median hours from in-progress to review and review to done.',
    unit: 'hours',
    targetDirection: 'lower',
  },
  {
    key: 'overload_forecast_2w',
    widgetType: 'metrics_team_lead_overload_forecast_2w',
    label: 'Overload Forecast (2w)',
    description: 'Projected two-week load ratio from intake/departure trend.',
    unit: 'ratio',
    targetDirection: 'lower',
  },
  {
    key: 'assignee_concentration_risk',
    widgetType: 'metrics_team_lead_assignee_concentration_risk',
    label: 'Assignee Concentration Risk',
    description: 'Critical-path ownership concentration across top contributors.',
    unit: 'percent',
    targetDirection: 'lower',
  },
]

export const TEAM_LEAD_KPI_ORDER: TeamLeadKpiKey[] = TEAM_LEAD_KPI_DEFINITIONS.map((entry) => entry.key)

export const TEAM_LEAD_KPI_BY_KEY: Record<TeamLeadKpiKey, TeamLeadKpiDefinition> = Object.fromEntries(
  TEAM_LEAD_KPI_DEFINITIONS.map((entry) => [entry.key, entry]),
) as Record<TeamLeadKpiKey, TeamLeadKpiDefinition>
