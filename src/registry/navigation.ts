import { computed } from 'vue'
import { useMetadataStore } from '@/stores/metadata'
import type {
  MainSidebarNavigationEntry,
  MetadataRouteEntry,
  ProductNavigationEntry,
  ProductNavigationSection,
  UiShellSection,
} from '@/types/metadata'

type ProductSectionId = 'top' | 'management' | 'quality'

interface FallbackRouteEntry {
  pathPrefix: string
  pageKey: string
  shellSection: UiShellSection
}

const FALLBACK_MAIN_SIDEBAR: MainSidebarNavigationEntry[] = [
  { id: 'home', label: 'Home', iconToken: 'home', route: '/home', pageKey: 'home', shellSection: 'global', placement: 'main', order: 0 },
  { id: 'products', label: 'Products', iconToken: 'products', route: '/dashboard', pageKey: 'overview', shellSection: 'products', placement: 'main', order: 1 },
  { id: 'users', label: 'Users', iconToken: 'users', route: '/users', pageKey: 'users', shellSection: 'global', placement: 'main', order: 2 },
  { id: 'integrations', label: 'Integrations', iconToken: 'integrations', route: '/integrations', pageKey: 'integrations', shellSection: 'global', placement: 'main', order: 3 },
  { id: 'settings', label: 'Settings', iconToken: 'settings', route: '/settings', pageKey: 'settings', shellSection: 'products', placement: 'footer', order: 0 },
]

const FALLBACK_PRODUCT_SECTIONS: ProductNavigationSection[] = [
  {
    id: 'top',
    label: 'Top',
    order: 0,
    items: [
      { id: 'overview', label: 'Dashboard Metrics', iconToken: 'overview', route: '/dashboard', pageKey: 'overview', expandable: false, hasAdd: false },
      { id: 'wiki', label: 'Wiki', iconToken: 'wiki', route: '/wiki', pageKey: 'wiki', expandable: false, hasAdd: false },
      { id: 'team', label: 'Team', iconToken: 'team', route: '/team', pageKey: 'team', expandable: true, hasAdd: true },
    ],
  },
  {
    id: 'management',
    label: 'Management',
    order: 1,
    items: [
      { id: 'initiatives', label: 'Initiatives', iconToken: 'initiatives', route: '/initiatives', pageKey: 'initiatives', expandable: true, hasAdd: true },
      { id: 'stories', label: 'Backlog (Stories)', iconToken: 'stories', route: '/stories', pageKey: 'stories', expandable: true, hasAdd: true },
      { id: 'tasks', label: 'Tasks', iconToken: 'tasks', route: '/tasks', pageKey: 'tasks', expandable: true, hasAdd: true },
      { id: 'deliveries', label: 'Deliveries', iconToken: 'deliveries', route: '/deliveries', pageKey: 'deliveries', expandable: true, hasAdd: true },
      { id: 'releases', label: 'Releases', iconToken: 'releases', route: '/releases', pageKey: 'releases', expandable: true, hasAdd: true },
    ],
  },
  {
    id: 'quality',
    label: 'Quality',
    order: 2,
    items: [
      { id: 'test-cycles', label: 'Testing Cycles', iconToken: 'test-cycles', route: '/test-cycles', pageKey: 'test-cycles', expandable: true, hasAdd: true },
      { id: 'issues', label: 'Issues', iconToken: 'issues', route: '/issues', pageKey: 'issues', expandable: true, hasAdd: false },
      { id: 'feedbacks', label: 'Consumer Feedback', iconToken: 'feedbacks', route: '/feedbacks', pageKey: 'feedbacks', expandable: false, hasAdd: true },
      { id: 'feature-requests', label: 'Feature Requests', iconToken: 'feature-requests', route: '/feature-requests', pageKey: 'feature-requests', expandable: false, hasAdd: true },
    ],
  },
]

const FALLBACK_ROUTE_MATCHERS: FallbackRouteEntry[] = [
  { pathPrefix: '/home', pageKey: 'home', shellSection: 'global' },
  { pathPrefix: '/users', pageKey: 'users', shellSection: 'global' },
  { pathPrefix: '/integrations', pageKey: 'integrations', shellSection: 'global' },
  { pathPrefix: '/dashboard', pageKey: 'overview', shellSection: 'products' },
  { pathPrefix: '/metrics', pageKey: 'overview', shellSection: 'products' },
  { pathPrefix: '/overview', pageKey: 'overview', shellSection: 'products' },
  { pathPrefix: '/wiki', pageKey: 'wiki', shellSection: 'products' },
  { pathPrefix: '/team', pageKey: 'team', shellSection: 'products' },
  { pathPrefix: '/initiatives', pageKey: 'initiatives', shellSection: 'products' },
  { pathPrefix: '/stories', pageKey: 'stories', shellSection: 'products' },
  { pathPrefix: '/backlog', pageKey: 'stories', shellSection: 'products' },
  { pathPrefix: '/tasks', pageKey: 'tasks', shellSection: 'products' },
  { pathPrefix: '/deliveries', pageKey: 'deliveries', shellSection: 'products' },
  { pathPrefix: '/releases', pageKey: 'releases', shellSection: 'products' },
  { pathPrefix: '/test-cycles', pageKey: 'test-cycles', shellSection: 'products' },
  { pathPrefix: '/issues', pageKey: 'issues', shellSection: 'products' },
  { pathPrefix: '/feedbacks', pageKey: 'feedbacks', shellSection: 'products' },
  { pathPrefix: '/feature-requests', pageKey: 'feature-requests', shellSection: 'products' },
  { pathPrefix: '/settings', pageKey: 'settings', shellSection: 'products' },
]

function normalizePath(path: string): string {
  if (!path) return '/'
  const stripped = path.split('?')[0]?.split('#')[0] || '/'
  return stripped.startsWith('/') ? stripped : `/${stripped}`
}

function sortByRouteLength<T extends { route: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.route.length - a.route.length)
}

function normalizeProductItemLabel(item: ProductNavigationEntry): string {
  if (item.pageKey === 'overview') return 'Dashboard Metrics'
  if (item.pageKey === 'stories') return 'Backlog (Stories)'
  return item.label
}

function normalizeProductSections(
  sections: ProductNavigationSection[],
): ProductNavigationSection[] {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      label: normalizeProductItemLabel(item),
    })),
  }))
}

function matchByPrefix<T extends { pathPrefix: string }>(path: string, entries: T[]): T | null {
  const normalized = normalizePath(path)
  const sorted = [...entries].sort((a, b) => b.pathPrefix.length - a.pathPrefix.length)
  for (const entry of sorted) {
    if (normalized === entry.pathPrefix || normalized.startsWith(`${entry.pathPrefix}/`)) {
      return entry
    }
  }
  return null
}

export function useNavigationRegistry() {
  const metadataStore = useMetadataStore()

  const mainSidebarItems = computed(() => (
    metadataStore.mainSidebar.length > 0 ? metadataStore.mainSidebar : FALLBACK_MAIN_SIDEBAR
  ))

  const productSections = computed(() => (
    normalizeProductSections(
      metadataStore.productSections.length > 0 ? metadataStore.productSections : FALLBACK_PRODUCT_SECTIONS,
    )
  ))

  const productItemsBySection = computed<Record<ProductSectionId, ProductNavigationEntry[]>>(() => {
    const result: Record<ProductSectionId, ProductNavigationEntry[]> = {
      top: [],
      management: [],
      quality: [],
    }
    for (const section of productSections.value) {
      const sectionId = section.id as ProductSectionId
      if (!result[sectionId]) continue
      result[sectionId] = section.items
    }
    return result
  })

  const allProductItems = computed(() => productSections.value.flatMap((section) => section.items))

  const routeMatchers = computed(() => (
    metadataStore.routes.length > 0 ? metadataStore.routes : FALLBACK_ROUTE_MATCHERS
  ))

  function resolveRouteEntry(path: string): MetadataRouteEntry | FallbackRouteEntry | null {
    return matchByPrefix(path, routeMatchers.value)
  }

  function isProductShellPath(path: string): boolean {
    return resolveRouteEntry(path)?.shellSection === 'products'
  }

  function resolveMainSidebarItem(path: string): MainSidebarNavigationEntry | null {
    const normalized = normalizePath(path)
    const items = sortByRouteLength(mainSidebarItems.value)
    for (const item of items) {
      if (normalized === item.route || normalized.startsWith(`${item.route}/`)) {
        return item
      }
    }
    return null
  }

  function resolveProductItem(path: string): ProductNavigationEntry | null {
    const normalized = normalizePath(path)
    const items = sortByRouteLength(allProductItems.value)
    for (const item of items) {
      if (normalized === item.route || normalized.startsWith(`${item.route}/`)) {
        return item
      }
    }
    if (normalized === '/backlog') {
      return allProductItems.value.find((item) => item.id === 'stories') || null
    }
    if (normalized.startsWith('/settings')) {
      return allProductItems.value.find((item) => item.id === 'overview') || null
    }
    return null
  }

  async function ensureNavigationLoaded() {
    await metadataStore.ensureLoaded(['routes', 'navigation'])
  }

  return {
    mainSidebarItems,
    productSections,
    productItemsBySection,
    allProductItems,
    routeMatchers,
    resolveRouteEntry,
    isProductShellPath,
    resolveMainSidebarItem,
    resolveProductItem,
    ensureNavigationLoaded,
  }
}
