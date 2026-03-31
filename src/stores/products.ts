import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import { useOnboardingStore } from './onboarding'
import { productsApi } from '@/lib/apiClient'
import { STORAGE_KEYS } from '@/constants/storageKeys'
import { assertPageAction } from '@/lib/storeAuthz'
import {
  storageGet,
  storageGetBoolean,
  storageGetJson,
  storageRemove,
  storageSet,
  storageSetJson,
} from '@/lib/browserStorage'

export interface Product {
  id?: string
  organizationId?: string | null
  name: string
  logo: string
  members: number
  dotColor: string
  description?: string
}

const STORAGE_KEY = STORAGE_KEYS.products.orderIds
const LEGACY_STORAGE_KEY = STORAGE_KEYS.products.legacyOrder
const ACTIVE_PRODUCT_ID_KEY = STORAGE_KEYS.products.activeProductId
const LEGACY_ACTIVE_PRODUCT_KEY = STORAGE_KEYS.products.legacyActiveProduct

const FALLBACK_PRODUCT: Product = {
  name: 'No Product',
  logo: '',
  members: 0,
  dotColor: '',
}

function loadSavedOrderKeys(): string[] {
  const saved = storageGetJson<string[] | null>(STORAGE_KEY, null)
  if (Array.isArray(saved)) return saved
  const legacy = storageGetJson<string[] | null>(LEGACY_STORAGE_KEY, null)
  return Array.isArray(legacy) ? legacy : []
}

function saveOrder(products: Product[]) {
  storageSetJson(
    STORAGE_KEY,
    products.map((p) => p.id).filter((id): id is string => !!id),
  )
}

export const useProductStore = defineStore('products', () => {
  const products = ref<Product[]>([])
  const activeProductId = ref(storageGet(ACTIVE_PRODUCT_ID_KEY) || '')
  const loaded = ref(false)
  const loading = ref(false)

  // Persist order whenever products array changes
  watch(products, (newProducts) => {
    saveOrder(newProducts)
  }, { deep: true })

  const activeIndex = computed(() =>
    products.value.findIndex(p => p.id === activeProductId.value)
  )

  const activeProduct = computed(() =>
    products.value.find(p => p.id === activeProductId.value) || products.value[0] || FALLBACK_PRODUCT
  )
  const activeProductName = computed(() => activeProduct.value.name)

  function applySavedOrder(fetchedProducts: Product[]): Product[] {
    const savedKeys = loadSavedOrderKeys()
    if (savedKeys.length === 0) return fetchedProducts

    const byId = new Map(
      fetchedProducts
        .filter((p): p is Product & { id: string } => !!p.id)
        .map((p) => [p.id, p]),
    )
    const byName = new Map(fetchedProducts.map((p) => [p.name, p]))
    const ordered: Product[] = []

    for (const key of savedKeys) {
      const p = byId.get(key) || byName.get(key)
      if (p) {
        ordered.push(p)
        if (p.id) byId.delete(p.id)
        byName.delete(p.name)
      }
    }

    for (const p of byName.values()) ordered.push(p)
    return ordered
  }

  function syncActiveProduct() {
    if (products.value.length === 0) {
      activeProductId.value = ''
      storageRemove(ACTIVE_PRODUCT_ID_KEY)
      return
    }

    if (activeProductId.value && products.value.some((p) => p.id === activeProductId.value)) {
      return
    }

    const legacyName = storageGet(LEGACY_ACTIVE_PRODUCT_KEY)
    const resolvedLegacy = legacyName ? products.value.find((p) => p.name === legacyName) : null
    const fallback = resolvedLegacy || products.value[0] || null
    activeProductId.value = fallback?.id || ''

    if (activeProductId.value) {
      storageSet(ACTIVE_PRODUCT_ID_KEY, activeProductId.value)
    } else {
      storageRemove(ACTIVE_PRODUCT_ID_KEY)
    }
    storageRemove(LEGACY_ACTIVE_PRODUCT_KEY)
  }

  async function fetchProducts(): Promise<void> {
    if (loading.value) return
    assertPageAction('home', 'read', 'products')
    loading.value = true

    const authStore = useAuthStore()
    const onboardingStore = useOnboardingStore()
    const organizationId = onboardingStore.activeOrganizationId?.trim() || null
    try {
      if (!organizationId) {
        products.value = []
        syncActiveProduct()
        return
      }
      const data = await productsApi.list(organizationId, authStore.token)
      const mapped = data
        .filter(p => p.name)
        .map((p) => ({
          id: p.id,
          organizationId: p.organizationId ?? null,
          name: p.name,
          logo: p.logo || '',
          members: 0,
          dotColor: '',
          description: p.description || undefined,
        }))

      products.value = applySavedOrder(mapped)
      syncActiveProduct()
    } catch {
      // Keep existing UI state if fetch fails.
    } finally {
      loaded.value = true
      loading.value = false
    }
  }

  function selectProduct(index: number) {
    if (!products.value[index]) return
    activeProductId.value = products.value[index]!.id || ''
    if (activeProductId.value) {
      storageSet(ACTIVE_PRODUCT_ID_KEY, activeProductId.value)
    }
  }

  async function createProduct(data: {
    name: string
    logo?: string | null
    description?: string | null
    members?: { userId: string; role?: string }[]
  }): Promise<Product | null> {
    const authStore = useAuthStore()
    const onboardingStore = useOnboardingStore()
    const organizationId = onboardingStore.activeOrganizationId?.trim() || null
    try {
      assertPageAction('home', 'create', 'products')
      if (!organizationId) return null
      const created = await productsApi.create(organizationId, data, authStore.token)
      const newProduct: Product = {
        id: created.id,
        organizationId: created.organizationId ?? null,
        name: created.name,
        logo: created.logo || '',
        members: (data.members?.length || 0) + 1, // +1 for creator
        dotColor: '',
        description: created.description ?? undefined,
      }
      await fetchProducts()
      // Select the new product
      activeProductId.value = newProduct.id || ''
      if (activeProductId.value) {
        storageSet(ACTIVE_PRODUCT_ID_KEY, activeProductId.value)
      }
      return newProduct
    } catch {
      return null
    }
  }

  const subSidebarCollapsed = ref(storageGetBoolean(STORAGE_KEYS.sidebar.subSidebarCollapsed, false))

  function toggleSubSidebar() {
    subSidebarCollapsed.value = !subSidebarCollapsed.value
    storageSet(STORAGE_KEYS.sidebar.subSidebarCollapsed, String(subSidebarCollapsed.value))
  }

  return {
    products,
    activeIndex,
    activeProduct,
    activeProductId,
    activeProductName,
    loaded,
    loading,
    fetchProducts,
    selectProduct,
    createProduct,
    subSidebarCollapsed,
    toggleSubSidebar,
  }
})
