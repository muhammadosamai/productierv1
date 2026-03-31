import {
  CONTROLLABLE_PAGE_KEYS as METADATA_PAGE_KEYS,
  PAGE_CATALOG as METADATA_PAGES,
  ROLE_CATALOG,
  ROUTE_CATALOG,
} from './metadataCatalog'

export type ControllablePageKey = (typeof METADATA_PAGE_KEYS)[number]

export interface PageCatalogEntry {
  key: ControllablePageKey
  label: string
  routePrefixes: string[]
  selfViewConfigurable: boolean
}

export type ConfigurableRoleKey =
  | 'admin'
  | 'product_admin'
  | 'product_manager'
  | 'business_analyst'
  | 'developer'
  | 'viewer'

export interface ConfigurableRoleCatalogEntry {
  key: ConfigurableRoleKey
  label: string
}

const routePrefixesByPage = ROUTE_CATALOG.reduce<Record<string, string[]>>((acc, route) => {
  if (!acc[route.pageKey]) acc[route.pageKey] = []
  acc[route.pageKey].push(route.pathPrefix)
  return acc
}, {})

export const PAGE_CATALOG: PageCatalogEntry[] = METADATA_PAGES.map((page) => ({
  key: page.key,
  label: page.label,
  routePrefixes: routePrefixesByPage[page.key] ?? [],
  selfViewConfigurable: page.selfViewOnlySupported,
}))

export const CONTROLLABLE_PAGE_KEYS: ControllablePageKey[] = [...METADATA_PAGE_KEYS]
export const CONTROLLABLE_PAGE_SET: ReadonlySet<string> = new Set(CONTROLLABLE_PAGE_KEYS)
export const SELF_VIEW_CONFIGURABLE_PAGE_KEYS: ControllablePageKey[] = PAGE_CATALOG
  .filter((entry) => entry.selfViewConfigurable)
  .map((entry) => entry.key)
export const SELF_VIEW_CONFIGURABLE_PAGE_SET: ReadonlySet<string> = new Set(SELF_VIEW_CONFIGURABLE_PAGE_KEYS)

export const CONFIGURABLE_ROLE_CATALOG: ConfigurableRoleCatalogEntry[] = ROLE_CATALOG
  .filter((entry) => entry.configurable)
  .map((entry) => ({
    key: entry.key as ConfigurableRoleKey,
    label: entry.label,
  }))

export function isControllablePageKey(value: string): value is ControllablePageKey {
  return CONTROLLABLE_PAGE_SET.has(value)
}

