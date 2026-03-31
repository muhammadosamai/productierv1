export const STORAGE_KEYS = {
  auth: {
    token: 'productier_token',
    tokenSchema: 'productier_token_schema',
    tokenSchemaVersion: 'rs256-kid-v1',
  },
  products: {
    orderIds: 'productier_product_order_ids',
    legacyOrder: 'productier_product_order',
    activeProductId: 'productier_active_product_id',
    legacyActiveProduct: 'productier_active_product',
  },
  sidebar: {
    subSidebarCollapsed: 'productier_sub_sidebar_collapsed',
    subSidebarWidth: 'sub-sidebar-width',
    expandedGroups: 'productier_sidebar_expanded',
  },
  wiki: {
    expandedCategories: 'wiki-expanded-categories',
    expandedTypes: 'wiki-expanded-types',
  },
  views: {
    backlog: {
      viewMode: 'backlog-view-mode',
    },
    tasks: {
      viewMode: 'tasks-view-mode',
      columnConfig: 'tasks-column-config',
      columnWidths: 'tasks-column-widths',
    },
    deliveries: {
      viewMode: 'deliveries-view-mode',
      columnConfig: 'deliveries-column-config',
      columnWidths: 'deliveries-column-widths',
      filterState: 'deliveries-filter-state',
    },
    initiatives: {
      viewMode: 'initiatives-view-mode',
    },
    stories: {
      viewMode: 'stories-view-mode',
      columnConfig: 'stories-column-config',
      columnWidths: 'stories-column-widths',
      filterState: 'stories-filter-state',
    },
    metrics: {
      period: 'metrics-period',
      scopeMode: 'metrics-scope-mode',
      scopeTeamId: 'metrics-scope-team-id',
    },
    team: {
      viewMode: 'team-view-mode',
      columnConfig: 'team-column-config',
      columnWidths: 'team-column-widths',
    },
    home: {
      activeView: 'home-active-view',
      teamMemberFilter: 'home-team-member-filter',
      briefMode: 'home-brief-mode',
      briefScope: 'home-brief-scope',
      briefProductId: 'home-brief-product-id',
      briefEntityType: 'home-brief-entity-type',
      briefEntityId: 'home-brief-entity-id',
      briefTemplate: 'home-brief-template',
      scopeMode: 'home-scope-mode',
      scopeProductId: 'home-scope-product-id',
      scopeTeamId: 'home-scope-team-id',
    },
    releases: {
      viewMode: 'releases-view-mode',
    },
    testCycles: {
      viewMode: 'test-cycles-view-mode',
    },
    consumerFeedback: {
      viewMode: 'cf-view-mode',
    },
    featureRequests: {
      viewMode: 'fr-view-mode',
    },
  },
} as const
