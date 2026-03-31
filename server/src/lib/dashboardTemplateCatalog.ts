import { TEAM_LEAD_KPI_DEFINITIONS } from './teamLeadKpis'

export type DashboardTemplateScopeType = 'product' | 'workspace'
export type DashboardTemplateSource = 'system' | 'user'
export type DashboardTemplateVisibility = 'personal' | 'team'

export interface DashboardTemplateWidgetBlueprint {
  widgetType: string
  widgetTitle: string | null
  configJson: Record<string, unknown>
  gridX: number
  gridY: number
  gridW: number
  gridH: number
  sortOrder: number
}

export interface DashboardTemplatePageBlueprint {
  name: string
  slug: string
  visibility: DashboardTemplateVisibility
  sortOrder: number
  widgets: DashboardTemplateWidgetBlueprint[]
}

export interface DashboardTemplateDefinition {
  id: string
  scopeType: DashboardTemplateScopeType
  source: DashboardTemplateSource
  visibility: DashboardTemplateVisibility
  name: string
  slug: string
  description: string
  pages: DashboardTemplatePageBlueprint[]
}

const TEAM_LEAD_TEMPLATE_WIDGETS: DashboardTemplateWidgetBlueprint[] = TEAM_LEAD_KPI_DEFINITIONS.map((entry, index) => ({
  widgetType: entry.widgetType,
  widgetTitle: entry.label,
  configJson: {},
  gridX: index % 2,
  gridY: Math.floor(index / 2),
  gridW: 1,
  gridH: 1,
  sortOrder: index,
}))

const PRODUCT_TEMPLATES: DashboardTemplateDefinition[] = [
  {
    id: 'system:product:feed-delivery',
    scopeType: 'product',
    source: 'system',
    visibility: 'team',
    name: 'Feed, Productivity, and Workload',
    slug: 'feed-productivity-workload',
    description: 'Core operating pages built from atomic feed and delivery widgets.',
    pages: [
      {
        name: 'Feed',
        slug: 'feed',
        visibility: 'team',
        sortOrder: 0,
        widgets: [
          { widgetType: 'product_feed_summary', widgetTitle: 'Feed Summary', configJson: {}, gridX: 0, gridY: 0, gridW: 2, gridH: 1, sortOrder: 0 },
          { widgetType: 'product_feed_activities', widgetTitle: 'Activities', configJson: {}, gridX: 0, gridY: 1, gridW: 2, gridH: 2, sortOrder: 1 },
          { widgetType: 'product_feed_team_members', widgetTitle: 'Team Members', configJson: {}, gridX: 0, gridY: 3, gridW: 1, gridH: 2, sortOrder: 2 },
        ],
      },
      {
        name: 'Productivity',
        slug: 'productivity',
        visibility: 'team',
        sortOrder: 1,
        widgets: [
          { widgetType: 'metrics_tasks_dashboard', widgetTitle: 'Tasks Dashboard', configJson: {}, gridX: 0, gridY: 0, gridW: 2, gridH: 2, sortOrder: 0 },
          { widgetType: 'metrics_throughput', widgetTitle: 'Throughput', configJson: {}, gridX: 0, gridY: 2, gridW: 1, gridH: 2, sortOrder: 1 },
          { widgetType: 'metrics_deliveries', widgetTitle: 'Deliveries', configJson: {}, gridX: 1, gridY: 2, gridW: 1, gridH: 2, sortOrder: 2 },
        ],
      },
      {
        name: 'Workload',
        slug: 'workload',
        visibility: 'team',
        sortOrder: 2,
        widgets: [
          { widgetType: 'metrics_workload', widgetTitle: 'Workload', configJson: {}, gridX: 0, gridY: 0, gridW: 2, gridH: 2, sortOrder: 0 },
        ],
      },
    ],
  },
  {
    id: 'system:product:team-lead-kpis',
    scopeType: 'product',
    source: 'system',
    visibility: 'team',
    name: 'Team Lead KPIs',
    slug: 'team-lead-kpis',
    description: 'Dedicated team-lead operational KPI board with draggable KPI cards.',
    pages: [
      {
        name: 'Team Lead KPIs',
        slug: 'team-lead-kpis',
        visibility: 'team',
        sortOrder: 0,
        widgets: TEAM_LEAD_TEMPLATE_WIDGETS,
      },
    ],
  },
  {
    id: 'system:product:execution-health',
    scopeType: 'product',
    source: 'system',
    visibility: 'team',
    name: 'Flow, Quality, and Blockers',
    slug: 'execution-health',
    description: 'Execution health pages for delivery flow, quality, and blocker visibility.',
    pages: [
      {
        name: 'Flow',
        slug: 'flow',
        visibility: 'team',
        sortOrder: 0,
        widgets: [
          { widgetType: 'metrics_flow', widgetTitle: 'Flow', configJson: {}, gridX: 0, gridY: 0, gridW: 2, gridH: 2, sortOrder: 0 },
        ],
      },
      {
        name: 'Quality',
        slug: 'quality',
        visibility: 'team',
        sortOrder: 1,
        widgets: [
          { widgetType: 'metrics_quality', widgetTitle: 'Quality', configJson: {}, gridX: 0, gridY: 0, gridW: 1, gridH: 2, sortOrder: 0 },
          { widgetType: 'metrics_predictability', widgetTitle: 'Predictability', configJson: {}, gridX: 1, gridY: 0, gridW: 1, gridH: 2, sortOrder: 1 },
        ],
      },
      {
        name: 'Blockers',
        slug: 'blockers',
        visibility: 'team',
        sortOrder: 2,
        widgets: [
          { widgetType: 'metrics_blockers', widgetTitle: 'Blockers', configJson: {}, gridX: 0, gridY: 0, gridW: 2, gridH: 2, sortOrder: 0 },
        ],
      },
    ],
  },
]

const WORKSPACE_TEMPLATES: DashboardTemplateDefinition[] = [
  {
    id: 'system:workspace:personal-focus',
    scopeType: 'workspace',
    source: 'system',
    visibility: 'personal',
    name: 'Personal Focus',
    slug: 'personal-focus',
    description: 'A lightweight starting point for daily individual execution.',
    pages: [
      {
        name: 'Personal Focus',
        slug: 'personal-focus',
        visibility: 'personal',
        sortOrder: 0,
        widgets: [
          { widgetType: 'home_my_tasks', widgetTitle: 'My Tasks', configJson: {}, gridX: 0, gridY: 0, gridW: 2, gridH: 2, sortOrder: 0 },
        ],
      },
    ],
  },
  {
    id: 'system:workspace:leadership-cadence',
    scopeType: 'workspace',
    source: 'system',
    visibility: 'team',
    name: 'Leadership Cadence',
    slug: 'leadership-cadence',
    description: 'Team and executive checkpoints in one reusable setup.',
    pages: [
      {
        name: 'Team Operating View',
        slug: 'team-operating-view',
        visibility: 'team',
        sortOrder: 0,
        widgets: [
          { widgetType: 'home_team', widgetTitle: 'Team View', configJson: {}, gridX: 0, gridY: 0, gridW: 2, gridH: 2, sortOrder: 0 },
        ],
      },
      {
        name: 'Executive Snapshot',
        slug: 'executive-snapshot',
        visibility: 'team',
        sortOrder: 1,
        widgets: [
          { widgetType: 'home_executive', widgetTitle: 'Executive Overview', configJson: {}, gridX: 0, gridY: 0, gridW: 2, gridH: 2, sortOrder: 0 },
        ],
      },
    ],
  },
]

export function listSystemDashboardTemplates(scopeType: DashboardTemplateScopeType): DashboardTemplateDefinition[] {
  const source = scopeType === 'product' ? PRODUCT_TEMPLATES : WORKSPACE_TEMPLATES
  return source.map((template) => ({
    ...template,
    pages: template.pages.map((page) => ({
      ...page,
      widgets: page.widgets.map((widget) => ({
        ...widget,
        configJson: { ...widget.configJson },
      })),
    })),
  }))
}

export function getSystemDashboardTemplateById(
  scopeType: DashboardTemplateScopeType,
  templateId: string,
): DashboardTemplateDefinition | null {
  const templates = listSystemDashboardTemplates(scopeType)
  return templates.find((template) => template.id === templateId) || null
}
