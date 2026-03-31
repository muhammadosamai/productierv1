import {
  deliveryStatusEnum,
  issueSeverityEnum,
  issueStatusEnum,
  releaseStatusEnum,
  releaseTypeEnum,
  storyPriorityEnum,
  storyStatusEnum,
  storyTypeEnum,
  taskPriorityEnum,
  taskStatusEnum,
  taskTypeEnum,
  testCycleStatusEnum,
  userRoleEnum,
} from '../db/schema'

export type UiShellSection = 'global' | 'products'

export const PAGE_CATALOG = [
  { key: 'home', label: 'Home', selfViewOnlySupported: false, shellSection: 'global' as UiShellSection },
  { key: 'overview', label: 'Dashboard', selfViewOnlySupported: false, shellSection: 'products' as UiShellSection },
  { key: 'wiki', label: 'Wiki', selfViewOnlySupported: false, shellSection: 'products' as UiShellSection },
  { key: 'team', label: 'Team', selfViewOnlySupported: false, shellSection: 'products' as UiShellSection },
  { key: 'initiatives', label: 'Initiatives', selfViewOnlySupported: true, shellSection: 'products' as UiShellSection },
  { key: 'stories', label: 'Stories', selfViewOnlySupported: true, shellSection: 'products' as UiShellSection },
  { key: 'tasks', label: 'Tasks', selfViewOnlySupported: true, shellSection: 'products' as UiShellSection },
  { key: 'deliveries', label: 'Deliveries', selfViewOnlySupported: true, shellSection: 'products' as UiShellSection },
  { key: 'releases', label: 'Releases', selfViewOnlySupported: true, shellSection: 'products' as UiShellSection },
  { key: 'test-cycles', label: 'Testing Cycles', selfViewOnlySupported: false, shellSection: 'products' as UiShellSection },
  { key: 'issues', label: 'Issues', selfViewOnlySupported: false, shellSection: 'products' as UiShellSection },
  { key: 'feedbacks', label: 'Consumer Feedback', selfViewOnlySupported: false, shellSection: 'products' as UiShellSection },
  { key: 'feature-requests', label: 'Feature Requests', selfViewOnlySupported: false, shellSection: 'products' as UiShellSection },
  { key: 'users', label: 'Users', selfViewOnlySupported: false, shellSection: 'global' as UiShellSection },
  { key: 'integrations', label: 'Integrations', selfViewOnlySupported: false, shellSection: 'global' as UiShellSection },
  { key: 'settings', label: 'Settings', selfViewOnlySupported: false, shellSection: 'products' as UiShellSection },
] as const

export type PageCatalogEntry = (typeof PAGE_CATALOG)[number]
export type PageKey = PageCatalogEntry['key']
export const CONTROLLABLE_PAGE_KEYS: PageKey[] = PAGE_CATALOG.map((page) => page.key)

export const ROUTE_CATALOG = [
  { pathPrefix: '/home', pageKey: 'home' as PageKey, shellSection: 'global' as UiShellSection, routeName: 'home' },
  { pathPrefix: '/users', pageKey: 'users' as PageKey, shellSection: 'global' as UiShellSection, routeName: 'users' },
  { pathPrefix: '/integrations', pageKey: 'integrations' as PageKey, shellSection: 'global' as UiShellSection, routeName: 'integrations' },
  { pathPrefix: '/dashboard', pageKey: 'overview' as PageKey, shellSection: 'products' as UiShellSection, routeName: 'dashboard' },
  { pathPrefix: '/overview', pageKey: 'overview' as PageKey, shellSection: 'products' as UiShellSection, routeName: null },
  { pathPrefix: '/metrics', pageKey: 'overview' as PageKey, shellSection: 'products' as UiShellSection, routeName: null },
  { pathPrefix: '/wiki', pageKey: 'wiki' as PageKey, shellSection: 'products' as UiShellSection, routeName: 'wiki' },
  { pathPrefix: '/team', pageKey: 'team' as PageKey, shellSection: 'products' as UiShellSection, routeName: 'team' },
  { pathPrefix: '/initiatives', pageKey: 'initiatives' as PageKey, shellSection: 'products' as UiShellSection, routeName: 'initiatives' },
  { pathPrefix: '/stories', pageKey: 'stories' as PageKey, shellSection: 'products' as UiShellSection, routeName: 'stories' },
  { pathPrefix: '/backlog', pageKey: 'stories' as PageKey, shellSection: 'products' as UiShellSection, routeName: null },
  { pathPrefix: '/tasks', pageKey: 'tasks' as PageKey, shellSection: 'products' as UiShellSection, routeName: 'tasks-list' },
  { pathPrefix: '/deliveries', pageKey: 'deliveries' as PageKey, shellSection: 'products' as UiShellSection, routeName: 'deliveries' },
  { pathPrefix: '/releases', pageKey: 'releases' as PageKey, shellSection: 'products' as UiShellSection, routeName: 'releases' },
  { pathPrefix: '/test-cycles', pageKey: 'test-cycles' as PageKey, shellSection: 'products' as UiShellSection, routeName: 'test-cycles' },
  { pathPrefix: '/issues', pageKey: 'issues' as PageKey, shellSection: 'products' as UiShellSection, routeName: 'issues' },
  { pathPrefix: '/feedbacks', pageKey: 'feedbacks' as PageKey, shellSection: 'products' as UiShellSection, routeName: 'feedbacks' },
  { pathPrefix: '/feature-requests', pageKey: 'feature-requests' as PageKey, shellSection: 'products' as UiShellSection, routeName: 'feature-requests' },
  { pathPrefix: '/settings', pageKey: 'settings' as PageKey, shellSection: 'products' as UiShellSection, routeName: 'settings' },
] as const

export type RouteCatalogEntry = (typeof ROUTE_CATALOG)[number]

export const MAIN_NAVIGATION_ITEMS = [
  {
    id: 'home',
    label: 'Home',
    iconToken: 'home',
    route: '/home',
    pageKey: 'home' as PageKey,
    shellSection: 'global' as UiShellSection,
    placement: 'main' as const,
    order: 0,
  },
  {
    id: 'products',
    label: 'Products',
    iconToken: 'products',
    route: '/dashboard',
    pageKey: 'overview' as PageKey,
    shellSection: 'products' as UiShellSection,
    placement: 'main' as const,
    order: 1,
  },
  {
    id: 'users',
    label: 'Users',
    iconToken: 'users',
    route: '/users',
    pageKey: 'users' as PageKey,
    shellSection: 'global' as UiShellSection,
    placement: 'main' as const,
    order: 2,
  },
  {
    id: 'integrations',
    label: 'Integrations',
    iconToken: 'integrations',
    route: '/integrations',
    pageKey: 'integrations' as PageKey,
    shellSection: 'global' as UiShellSection,
    placement: 'main' as const,
    order: 3,
  },
  {
    id: 'settings',
    label: 'Settings',
    iconToken: 'settings',
    route: '/settings',
    pageKey: 'settings' as PageKey,
    shellSection: 'products' as UiShellSection,
    placement: 'footer' as const,
    order: 0,
  },
] as const

export const PRODUCT_NAVIGATION_SECTIONS = [
  {
    id: 'top',
    label: 'Top',
    order: 0,
    items: [
      {
        id: 'overview',
        label: 'Dashboard',
        iconToken: 'overview',
        route: '/dashboard',
        pageKey: 'overview' as PageKey,
        expandable: false,
        hasAdd: false,
      },
      {
        id: 'wiki',
        label: 'Wiki',
        iconToken: 'wiki',
        route: '/wiki',
        pageKey: 'wiki' as PageKey,
        expandable: false,
        hasAdd: false,
      },
      {
        id: 'team',
        label: 'Team',
        iconToken: 'team',
        route: '/team',
        pageKey: 'team' as PageKey,
        expandable: true,
        hasAdd: true,
      },
    ],
  },
  {
    id: 'management',
    label: 'Management',
    order: 1,
    items: [
      {
        id: 'initiatives',
        label: 'Initiatives',
        iconToken: 'initiatives',
        route: '/initiatives',
        pageKey: 'initiatives' as PageKey,
        expandable: true,
        hasAdd: true,
      },
      {
        id: 'stories',
        label: 'Stories',
        iconToken: 'stories',
        route: '/stories',
        pageKey: 'stories' as PageKey,
        expandable: true,
        hasAdd: true,
      },
      {
        id: 'tasks',
        label: 'Tasks',
        iconToken: 'tasks',
        route: '/tasks',
        pageKey: 'tasks' as PageKey,
        expandable: true,
        hasAdd: true,
      },
      {
        id: 'deliveries',
        label: 'Deliveries',
        iconToken: 'deliveries',
        route: '/deliveries',
        pageKey: 'deliveries' as PageKey,
        expandable: true,
        hasAdd: true,
      },
      {
        id: 'releases',
        label: 'Releases',
        iconToken: 'releases',
        route: '/releases',
        pageKey: 'releases' as PageKey,
        expandable: true,
        hasAdd: true,
      },
    ],
  },
  {
    id: 'quality',
    label: 'Quality',
    order: 2,
    items: [
      {
        id: 'test-cycles',
        label: 'Testing Cycles',
        iconToken: 'test-cycles',
        route: '/test-cycles',
        pageKey: 'test-cycles' as PageKey,
        expandable: true,
        hasAdd: true,
      },
      {
        id: 'issues',
        label: 'Issues',
        iconToken: 'issues',
        route: '/issues',
        pageKey: 'issues' as PageKey,
        expandable: true,
        hasAdd: false,
      },
      {
        id: 'feedbacks',
        label: 'Consumer Feedback',
        iconToken: 'feedbacks',
        route: '/feedbacks',
        pageKey: 'feedbacks' as PageKey,
        expandable: false,
        hasAdd: true,
      },
      {
        id: 'feature-requests',
        label: 'Feature Requests',
        iconToken: 'feature-requests',
        route: '/feature-requests',
        pageKey: 'feature-requests' as PageKey,
        expandable: false,
        hasAdd: true,
      },
    ],
  },
] as const

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  product_admin: 'Product Admin',
  product_manager: 'Product Manager',
  business_analyst: 'Business Analyst',
  developer: 'Developer',
  viewer: 'Viewer',
}

export interface RoleCatalogEntry {
  key: (typeof userRoleEnum.enumValues)[number]
  label: string
  configurable: boolean
}

export const ROLE_CATALOG: RoleCatalogEntry[] = userRoleEnum.enumValues.map((role) => ({
  key: role,
  label: ROLE_LABELS[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
  configurable: role !== 'super_admin',
}))

export interface EnumCatalog {
  story: {
    type: string[]
    priority: string[]
    status: string[]
  }
  task: {
    type: string[]
    priority: string[]
    status: string[]
  }
  delivery: {
    status: string[]
  }
  release: {
    status: string[]
    type: string[]
  }
  testCycle: {
    status: string[]
  }
  issue: {
    status: string[]
    severity: string[]
  }
}

export const ENUM_CATALOG: EnumCatalog = {
  story: {
    type: [...storyTypeEnum.enumValues],
    priority: [...storyPriorityEnum.enumValues],
    status: [...storyStatusEnum.enumValues],
  },
  task: {
    type: [...taskTypeEnum.enumValues],
    priority: [...taskPriorityEnum.enumValues],
    status: [...taskStatusEnum.enumValues],
  },
  delivery: {
    status: [...deliveryStatusEnum.enumValues],
  },
  release: {
    status: [...releaseStatusEnum.enumValues],
    type: [...releaseTypeEnum.enumValues],
  },
  testCycle: {
    status: [...testCycleStatusEnum.enumValues],
  },
  issue: {
    status: [...issueStatusEnum.enumValues],
    severity: [...issueSeverityEnum.enumValues],
  },
}

export type SettingValueType = 'string' | 'boolean' | 'number' | 'json'
export type SettingStorageType = 'localStorage' | 'serverSetting' | 'hybrid'

export interface SettingKeySchemaEntry {
  key: string
  valueType: SettingValueType
  storage: SettingStorageType
  description: string
}

export const SETTINGS_KEY_SCHEMA: SettingKeySchemaEntry[] = [
  { key: 'productier_token', valueType: 'string', storage: 'localStorage', description: 'JWT auth token cache.' },
  { key: 'productier_token_schema', valueType: 'string', storage: 'localStorage', description: 'Token format version marker.' },
  { key: 'productier_product_order_ids', valueType: 'json', storage: 'localStorage', description: 'Ordered product ids in sidebar switcher.' },
  { key: 'productier_product_order', valueType: 'json', storage: 'localStorage', description: 'Legacy product order key for migration.' },
  { key: 'productier_active_product_id', valueType: 'string', storage: 'localStorage', description: 'Current active product id.' },
  { key: 'productier_active_product', valueType: 'string', storage: 'localStorage', description: 'Legacy active product key for migration.' },
  { key: 'productier_sub_sidebar_collapsed', valueType: 'boolean', storage: 'localStorage', description: 'Sub sidebar collapsed state.' },
  { key: 'sub-sidebar-width', valueType: 'number', storage: 'localStorage', description: 'Sub sidebar width in pixels.' },
  { key: 'productier_sidebar_expanded', valueType: 'json', storage: 'localStorage', description: 'Expanded tree groups in sub sidebar.' },
  { key: 'wiki-expanded-categories', valueType: 'json', storage: 'localStorage', description: 'Expanded wiki categories.' },
  { key: 'wiki-expanded-types', valueType: 'json', storage: 'localStorage', description: 'Expanded wiki asset types.' },
  { key: 'backlog-view-mode', valueType: 'string', storage: 'localStorage', description: 'Backlog table/card toggle.' },
  { key: 'tasks-view-mode', valueType: 'string', storage: 'hybrid', description: 'Tasks table/card toggle.' },
  { key: 'tasks-column-config', valueType: 'json', storage: 'hybrid', description: 'Tasks table visible columns and ordering.' },
  { key: 'tasks-column-widths', valueType: 'json', storage: 'hybrid', description: 'Tasks table column width map.' },
  { key: 'stories-view-mode', valueType: 'string', storage: 'hybrid', description: 'Stories table/card toggle.' },
  { key: 'stories-column-config', valueType: 'json', storage: 'hybrid', description: 'Stories table visible columns and ordering.' },
  { key: 'stories-column-widths', valueType: 'json', storage: 'hybrid', description: 'Stories table column width map.' },
  { key: 'deliveries-view-mode', valueType: 'string', storage: 'hybrid', description: 'Deliveries table/card toggle.' },
  { key: 'deliveries-column-config', valueType: 'json', storage: 'hybrid', description: 'Deliveries table visible columns and ordering.' },
  { key: 'deliveries-column-widths', valueType: 'json', storage: 'hybrid', description: 'Deliveries table column width map.' },
  { key: 'team-view-mode', valueType: 'string', storage: 'hybrid', description: 'Team table/card toggle.' },
  { key: 'team-column-config', valueType: 'json', storage: 'hybrid', description: 'Team table visible columns and ordering.' },
  { key: 'team-column-widths', valueType: 'json', storage: 'hybrid', description: 'Team table column width map.' },
  { key: 'initiatives-view-mode', valueType: 'string', storage: 'localStorage', description: 'Initiatives table/card toggle.' },
  { key: 'test-cycles-view-mode', valueType: 'string', storage: 'localStorage', description: 'Testing cycles table/card toggle.' },
  { key: 'releases-view-mode', valueType: 'string', storage: 'localStorage', description: 'Releases table/card toggle.' },
  { key: 'cf-view-mode', valueType: 'string', storage: 'localStorage', description: 'Consumer feedback table/card toggle.' },
  { key: 'fr-view-mode', valueType: 'string', storage: 'localStorage', description: 'Feature requests table/card toggle.' },
]
