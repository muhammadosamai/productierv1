import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { metadataApi } from '@/lib/apiClient'
import type {
  MainSidebarNavigationEntry,
  MetadataEnumCatalog,
  MetadataPageEntry,
  MetadataRoleEntry,
  MetadataRouteEntry,
  MetadataSettingKeyEntry,
  ProductNavigationSection,
} from '@/types/metadata'
import { useAuthStore } from './auth'

type MetadataSection = 'pages' | 'routes' | 'navigation' | 'enums' | 'settingsKeys'

const EMPTY_ENUMS: MetadataEnumCatalog = {
  story: { type: [], priority: [], status: [] },
  task: { type: [], priority: [], status: [] },
  delivery: { status: [] },
  release: { status: [], type: [] },
  testCycle: { status: [] },
  issue: { status: [], severity: [] },
}

export const useMetadataStore = defineStore('metadata', () => {
  const authStore = useAuthStore()

  const pages = ref<MetadataPageEntry[]>([])
  const roles = ref<MetadataRoleEntry[]>([])
  const configurableRoles = ref<MetadataRoleEntry[]>([])
  const routes = ref<MetadataRouteEntry[]>([])
  const mainSidebar = ref<MainSidebarNavigationEntry[]>([])
  const productSections = ref<ProductNavigationSection[]>([])
  const enums = ref<MetadataEnumCatalog>({ ...EMPTY_ENUMS })
  const settingsKeys = ref<MetadataSettingKeyEntry[]>([])
  const lastError = ref<string | null>(null)

  const loaded = reactive<Record<MetadataSection, boolean>>({
    pages: false,
    routes: false,
    navigation: false,
    enums: false,
    settingsKeys: false,
  })

  const loading = reactive<Record<MetadataSection, boolean>>({
    pages: false,
    routes: false,
    navigation: false,
    enums: false,
    settingsKeys: false,
  })

  const pageByKey = computed<Record<string, MetadataPageEntry>>(() => {
    const map: Record<string, MetadataPageEntry> = {}
    for (const page of pages.value) {
      map[page.key] = page
    }
    return map
  })

  const routeMatchers = computed(() => {
    return [...routes.value].sort((a, b) => b.pathPrefix.length - a.pathPrefix.length)
  })

  function normalizePath(path: string): string {
    if (!path) return '/'
    const stripped = path.split('?')[0]?.split('#')[0] || '/'
    return stripped.startsWith('/') ? stripped : `/${stripped}`
  }

  function resolveRouteEntry(path: string): MetadataRouteEntry | null {
    const normalized = normalizePath(path)
    for (const route of routeMatchers.value) {
      const prefix = route.pathPrefix
      if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
        return route
      }
    }
    return null
  }

  function resolvePageForPath(path: string): string | null {
    return resolveRouteEntry(path)?.pageKey || null
  }

  function isProductShellPath(path: string): boolean {
    return resolveRouteEntry(path)?.shellSection === 'products'
  }

  function findMainSidebarItemByPath(path: string): MainSidebarNavigationEntry | null {
    const normalized = normalizePath(path)
    const sorted = [...mainSidebar.value].sort((a, b) => b.route.length - a.route.length)
    for (const item of sorted) {
      if (normalized === item.route || normalized.startsWith(`${item.route}/`)) {
        return item
      }
    }
    return null
  }

  function findProductNavigationItemByPath(path: string) {
    const normalized = normalizePath(path)
    const items = productSections.value.flatMap((section) => section.items)
    const sorted = [...items].sort((a, b) => b.route.length - a.route.length)
    for (const item of sorted) {
      if (normalized === item.route || normalized.startsWith(`${item.route}/`)) {
        return item
      }
    }
    return null
  }

  async function fetchPages(force = false) {
    if (loading.pages) return
    if (loaded.pages && !force) return
    loading.pages = true
    try {
      const payload = await metadataApi.getPages(authStore.token)
      pages.value = Array.isArray(payload.pages) ? payload.pages : []
      roles.value = Array.isArray(payload.roles) ? payload.roles : []
      configurableRoles.value = Array.isArray(payload.configurableRoles) ? payload.configurableRoles : []
      loaded.pages = true
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
    } finally {
      loading.pages = false
    }
  }

  async function fetchRoutes(force = false) {
    if (loading.routes) return
    if (loaded.routes && !force) return
    loading.routes = true
    try {
      const payload = await metadataApi.getRoutes(authStore.token)
      routes.value = Array.isArray(payload.routes) ? payload.routes : []
      loaded.routes = true
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
    } finally {
      loading.routes = false
    }
  }

  async function fetchNavigation(force = false) {
    if (loading.navigation) return
    if (loaded.navigation && !force) return
    loading.navigation = true
    try {
      const payload = await metadataApi.getNavigation(authStore.token)
      mainSidebar.value = Array.isArray(payload.mainSidebar) ? payload.mainSidebar : []
      productSections.value = Array.isArray(payload.productSections) ? payload.productSections : []
      loaded.navigation = true
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
    } finally {
      loading.navigation = false
    }
  }

  async function fetchEnums(force = false) {
    if (loading.enums) return
    if (loaded.enums && !force) return
    loading.enums = true
    try {
      const payload = await metadataApi.getEnums(authStore.token)
      enums.value = payload.enums || { ...EMPTY_ENUMS }
      loaded.enums = true
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
    } finally {
      loading.enums = false
    }
  }

  async function fetchSettingsKeys(force = false) {
    if (loading.settingsKeys) return
    if (loaded.settingsKeys && !force) return
    loading.settingsKeys = true
    try {
      const payload = await metadataApi.getSettingsKeys(authStore.token)
      settingsKeys.value = Array.isArray(payload.keys) ? payload.keys : []
      loaded.settingsKeys = true
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
    } finally {
      loading.settingsKeys = false
    }
  }

  async function ensureLoaded(
    sections: MetadataSection[] = ['pages', 'routes', 'navigation', 'enums', 'settingsKeys'],
    force = false,
  ) {
    for (const section of sections) {
      if (section === 'pages') await fetchPages(force)
      if (section === 'routes') await fetchRoutes(force)
      if (section === 'navigation') await fetchNavigation(force)
      if (section === 'enums') await fetchEnums(force)
      if (section === 'settingsKeys') await fetchSettingsKeys(force)
    }
  }

  function reset() {
    pages.value = []
    roles.value = []
    configurableRoles.value = []
    routes.value = []
    mainSidebar.value = []
    productSections.value = []
    enums.value = { ...EMPTY_ENUMS }
    settingsKeys.value = []
    lastError.value = null
    loaded.pages = false
    loaded.routes = false
    loaded.navigation = false
    loaded.enums = false
    loaded.settingsKeys = false
  }

  return {
    pages,
    roles,
    configurableRoles,
    routes,
    mainSidebar,
    productSections,
    enums,
    settingsKeys,
    loaded,
    loading,
    lastError,
    pageByKey,
    routeMatchers,
    resolvePageForPath,
    resolveRouteEntry,
    isProductShellPath,
    findMainSidebarItemByPath,
    findProductNavigationItemByPath,
    fetchPages,
    fetchRoutes,
    fetchNavigation,
    fetchEnums,
    fetchSettingsKeys,
    ensureLoaded,
    reset,
  }
})
