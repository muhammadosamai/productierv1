import type { UserRole } from './user'

export type UiShellSection = 'global' | 'products'

export interface MetadataRoleEntry {
  key: UserRole
  label: string
  configurable: boolean
}

export interface MetadataPageEntry {
  key: string
  label: string
  selfViewOnlySupported: boolean
  shellSection: UiShellSection
}

export interface MetadataPagesResponse {
  pages: MetadataPageEntry[]
  roles: MetadataRoleEntry[]
  configurableRoles: MetadataRoleEntry[]
}

export interface MetadataRouteEntry {
  pathPrefix: string
  pageKey: string
  shellSection: UiShellSection
  routeName: string | null
}

export interface MetadataRoutesResponse {
  routes: MetadataRouteEntry[]
}

export interface MainSidebarNavigationEntry {
  id: string
  label: string
  iconToken: string
  route: string
  pageKey: string
  shellSection: UiShellSection
  placement: 'main' | 'footer'
  order: number
}

export interface ProductNavigationEntry {
  id: string
  label: string
  iconToken: string
  route: string
  pageKey: string
  expandable: boolean
  hasAdd: boolean
}

export interface ProductNavigationSection {
  id: string
  label: string
  order: number
  items: ProductNavigationEntry[]
}

export interface MetadataNavigationResponse {
  mainSidebar: MainSidebarNavigationEntry[]
  productSections: ProductNavigationSection[]
}

export interface MetadataEnumCatalog {
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

export interface MetadataEnumsResponse {
  enums: MetadataEnumCatalog
}

export type MetadataSettingsValueType = 'string' | 'boolean' | 'number' | 'json'
export type MetadataSettingsStorageType = 'localStorage' | 'serverSetting' | 'hybrid'

export interface MetadataSettingKeyEntry {
  key: string
  valueType: MetadataSettingsValueType
  storage: MetadataSettingsStorageType
  description: string
}

export interface MetadataSettingsKeysResponse {
  keys: MetadataSettingKeyEntry[]
}
