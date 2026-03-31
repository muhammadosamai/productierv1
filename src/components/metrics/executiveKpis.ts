import type { ExecutiveKpiKey } from '@/types/metrics'

export interface ExecutiveKpiDefinition {
  key: ExecutiveKpiKey
  widgetType: string
  label: string
  description: string
  defaultGridW: number
  defaultGridH: number
}

export const EXECUTIVE_KPI_DEFINITIONS: ExecutiveKpiDefinition[] = [
  {
    key: 'portfolioHealthScore',
    widgetType: 'metrics_exec_portfolio_health_score',
    label: 'Portfolio Health Score',
    description: 'Composite health across predictability, quality, blockers, and load balance',
    defaultGridW: 1,
    defaultGridH: 1,
  },
  {
    key: 'deliveryConfidenceDistribution',
    widgetType: 'metrics_exec_delivery_confidence_distribution',
    label: 'Delivery Confidence Distribution',
    description: 'High/medium/low confidence split of scoped deliveries',
    defaultGridW: 1,
    defaultGridH: 1,
  },
  {
    key: 'forecastBias',
    widgetType: 'metrics_exec_forecast_bias',
    label: 'Forecast Bias',
    description: 'Systematic early/late schedule variance direction',
    defaultGridW: 1,
    defaultGridH: 1,
  },
  {
    key: 'scopeVolatilityBurn',
    widgetType: 'metrics_exec_scope_volatility_burn',
    label: 'Scope Volatility Burn',
    description: 'Scope added-after-start pressure vs outcomes',
    defaultGridW: 1,
    defaultGridH: 1,
  },
  {
    key: 'riskBurndown',
    widgetType: 'metrics_exec_risk_burndown',
    label: 'Risk Burndown',
    description: 'Week-over-week net change of at-risk work',
    defaultGridW: 1,
    defaultGridH: 1,
  },
  {
    key: 'initiativeExecutionConfidence',
    widgetType: 'metrics_exec_initiative_execution_confidence',
    label: 'Initiative Execution Confidence',
    description: 'Initiative confidence from status, predictability, and blocker pressure',
    defaultGridW: 1,
    defaultGridH: 1,
  },
  {
    key: 'qualityCostIndex',
    widgetType: 'metrics_exec_quality_cost_index',
    label: 'Quality Cost Index',
    description: 'Rework, reopen, and escaped defect impact score',
    defaultGridW: 1,
    defaultGridH: 1,
  },
  {
    key: 'throughputStabilityIndex',
    widgetType: 'metrics_exec_throughput_stability_index',
    label: 'Throughput Stability Index',
    description: 'Volatility-adjusted throughput stability',
    defaultGridW: 1,
    defaultGridH: 1,
  },
  {
    key: 'crossProductBottleneckHeatmap',
    widgetType: 'metrics_exec_cross_product_bottleneck_heatmap',
    label: 'Cross-Product Bottleneck Heatmap',
    description: 'Bottleneck concentration score by product',
    defaultGridW: 1,
    defaultGridH: 1,
  },
  {
    key: 'customerImpactProxy',
    widgetType: 'metrics_exec_customer_impact_proxy',
    label: 'Customer-Impact Proxy',
    description: 'Critical feedback pressure and acknowledge/resolve latency',
    defaultGridW: 1,
    defaultGridH: 1,
  },
]

export const EXECUTIVE_KPI_WIDGET_TYPES = EXECUTIVE_KPI_DEFINITIONS.map((entry) => entry.widgetType)

export const EXECUTIVE_KPI_BY_WIDGET_TYPE: Record<string, ExecutiveKpiDefinition> = Object.fromEntries(
  EXECUTIVE_KPI_DEFINITIONS.map((entry) => [entry.widgetType, entry]),
)

export const EXECUTIVE_KPI_BY_KEY: Record<ExecutiveKpiKey, ExecutiveKpiDefinition> = Object.fromEntries(
  EXECUTIVE_KPI_DEFINITIONS.map((entry) => [entry.key, entry]),
) as Record<ExecutiveKpiKey, ExecutiveKpiDefinition>

