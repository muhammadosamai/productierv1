import type { TeamLeadKpiKey } from '@/types/metrics'

export interface TeamLeadKpiDefinition {
  key: TeamLeadKpiKey
  widgetType: string
  label: string
  description: string
  defaultGridW: number
  defaultGridH: number
}

export const TEAM_LEAD_KPI_DEFINITIONS: TeamLeadKpiDefinition[] = [
  {
    key: 'review_sla_adherence',
    widgetType: 'metrics_team_lead_review_sla_adherence',
    label: 'Review SLA Adherence',
    description: 'Tasks reviewed within SLA window',
    defaultGridW: 1,
    defaultGridH: 1,
  },
  {
    key: 'review_queue_age',
    widgetType: 'metrics_team_lead_review_queue_age',
    label: 'Review Queue Age',
    description: 'Median age of tasks waiting review',
    defaultGridW: 1,
    defaultGridH: 1,
  },
  {
    key: 'aging_wip_index',
    widgetType: 'metrics_team_lead_aging_wip_index',
    label: 'Aging WIP Index',
    description: 'Weighted stale work in progress score',
    defaultGridW: 1,
    defaultGridH: 1,
  },
  {
    key: 'dependency_delay_index',
    widgetType: 'metrics_team_lead_dependency_delay_index',
    label: 'Dependency Delay Index',
    description: 'Blocked dependency pressure and unblock delay',
    defaultGridW: 1,
    defaultGridH: 1,
  },
  {
    key: 'commitment_reliability_iteration',
    widgetType: 'metrics_team_lead_commitment_reliability_iteration',
    label: 'Commitment Reliability',
    description: 'Planned vs completed iteration commitment',
    defaultGridW: 1,
    defaultGridH: 1,
  },
  {
    key: 'context_switch_pressure',
    widgetType: 'metrics_team_lead_context_switch_pressure',
    label: 'Context Switch Pressure',
    description: 'Active WIP and task-type fragmentation',
    defaultGridW: 1,
    defaultGridH: 1,
  },
  {
    key: 'execution_focus_ratio',
    widgetType: 'metrics_team_lead_execution_focus_ratio',
    label: 'Execution Focus Ratio',
    description: 'Planned work share vs interrupt load',
    defaultGridW: 1,
    defaultGridH: 1,
  },
  {
    key: 'defect_leakage_by_delivery',
    widgetType: 'metrics_team_lead_defect_leakage_by_delivery',
    label: 'Defect Leakage by Delivery',
    description: 'Post-release defect share by delivery',
    defaultGridW: 1,
    defaultGridH: 1,
  },
  {
    key: 'handoff_latency',
    widgetType: 'metrics_team_lead_handoff_latency',
    label: 'Handoff Latency',
    description: 'Assignee->review and review->done delay',
    defaultGridW: 1,
    defaultGridH: 1,
  },
  {
    key: 'overload_forecast_2w',
    widgetType: 'metrics_team_lead_overload_forecast_2w',
    label: 'Overload Forecast (2w)',
    description: 'Projected near-term load ratio trend',
    defaultGridW: 1,
    defaultGridH: 1,
  },
  {
    key: 'assignee_concentration_risk',
    widgetType: 'metrics_team_lead_assignee_concentration_risk',
    label: 'Assignee Concentration Risk',
    description: 'Critical-path ownership concentration',
    defaultGridW: 1,
    defaultGridH: 1,
  },
]

export const TEAM_LEAD_KPI_WIDGET_TYPES = TEAM_LEAD_KPI_DEFINITIONS.map((entry) => entry.widgetType)

export const TEAM_LEAD_KPI_BY_WIDGET_TYPE: Record<string, TeamLeadKpiDefinition> = Object.fromEntries(
  TEAM_LEAD_KPI_DEFINITIONS.map((entry) => [entry.widgetType, entry]),
)

export const TEAM_LEAD_KPI_BY_KEY: Record<TeamLeadKpiKey, TeamLeadKpiDefinition> = Object.fromEntries(
  TEAM_LEAD_KPI_DEFINITIONS.map((entry) => [entry.key, entry]),
) as Record<TeamLeadKpiKey, TeamLeadKpiDefinition>
