import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import {
  findProductIndexByDenormRef,
  findProductRowByDenormRef,
  normalizeProjectKeyCompare,
} from '@/utils/productDeepLink'

export interface Product {
  id?: string
  name: string
  /** Short stable key for URLs (optional for legacy rows until backfilled). */
  projectKey?: string | null
  logo: string
  members: number
  dotColor: string
  description?: string
  createdByUserId?: string
  /** Current user's role in this product (product_members.role); null if not a member. */
  myRole?: string | null
}

const STORAGE_KEY = 'productier_product_order'
/** Legacy: was display name only; migrated to id-based selection. */
const ACTIVE_PRODUCT_KEY = 'productier_active_product'
const ACTIVE_PRODUCT_ID_KEY = 'productier_active_product_id'

function saveOrder(products: Product[]) {
  const tokens = products.map(p => {
    if (p.id) return p.id
    const pk = p.projectKey?.trim()
    if (pk) return pk
    return p.name
  })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
}

function persistActiveProductId(id: string) {
  if (id) localStorage.setItem(ACTIVE_PRODUCT_ID_KEY, id)
  else localStorage.removeItem(ACTIVE_PRODUCT_ID_KEY)
}

export const useProductStore = defineStore('products', () => {
  const products = ref<Product[]>([])
  const activeProductId = ref(localStorage.getItem(ACTIVE_PRODUCT_ID_KEY) || '')

  const activeProduct = computed(() => {
    const list = products.value
    if (list.length === 0) return undefined
    const id = activeProductId.value
    if (id) {
      const hit = list.find(p => p.id === id)
      if (hit) return hit
    }
    return list[0]
  })

  /** Display name of the selected product (for UI). */
  const activeProductName = computed(() => activeProduct.value?.name ?? '')

  /**
   * Value to pass as `?product=`, `productId`, or `/api/products/:scope` so the server resolves
   * the correct row when display names are duplicated (prefers `projectKey`).
   */
  const activeProductScopeForApi = computed(() => {
    const p = activeProduct.value
    if (!p) return ''
    const pk = p.projectKey?.trim()
    if (pk) return pk
    return p.name
  })

  function hydrateActiveProductId() {
    const list = products.value
    if (list.length === 0) {
      activeProductId.value = ''
      persistActiveProductId('')
      return
    }
    const savedId = localStorage.getItem(ACTIVE_PRODUCT_ID_KEY)
    if (savedId && list.some(p => p.id === savedId)) {
      activeProductId.value = savedId
      return
    }
    const legacyName = localStorage.getItem(ACTIVE_PRODUCT_KEY)
    if (legacyName) {
      const pick = findProductRowByDenormRef(list, legacyName)
      if (pick?.id) {
        activeProductId.value = pick.id
        persistActiveProductId(pick.id)
        localStorage.removeItem(ACTIVE_PRODUCT_KEY)
        return
      }
    }
    const first = list[0]!
    activeProductId.value = first.id || ''
    if (first.id) persistActiveProductId(first.id)
  }

  // Fetch products from database (filtered by membership on backend)
  async function fetchProducts() {
    const authStore = useAuthStore()
    if (!authStore.token) return

    try {
      const res = await fetch('/api/products', {
        headers: {
          Authorization: `Bearer ${authStore.token}`,
        },
      })
      if (!res.ok) return

      const dbProducts: any[] = await res.json()

      const fetched: Product[] = dbProducts.map(p => ({
        id: p.id,
        name: p.name,
        projectKey: p.projectKey ?? null,
        logo: p.logo || '',
        members: 0,
        dotColor: '',
        description: p.description,
        createdByUserId: p.createdByUserId,
        myRole: p.myRole ?? null,
      }))

      const savedOrder = localStorage.getItem(STORAGE_KEY)
      if (savedOrder) {
        try {
          const saved: string[] = JSON.parse(savedOrder)
          const ordered: Product[] = []
          const isUuid = (s: string) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)

          for (const token of saved) {
            if (isUuid(token)) {
              const product = fetched.find(p => p.id === token)
              if (product) ordered.push(product)
            } else {
              const product = findProductRowByDenormRef(fetched, token)
              if (product) ordered.push(product)
            }
          }
          for (const product of fetched) {
            const id = product.id
            if (id && !ordered.some(p => p.id === id)) ordered.push(product)
            if (!id) {
              const pk = product.projectKey?.trim()
                ? normalizeProjectKeyCompare(String(product.projectKey))
                : ''
              const dup = ordered.some(
                p =>
                  !p.id
                  && p.name === product.name
                  && (pk
                    ? !!(p.projectKey?.trim()
                      && normalizeProjectKeyCompare(String(p.projectKey)) === pk)
                    : !p.projectKey?.trim()),
              )
              if (!dup) ordered.push(product)
            }
          }
          products.value = ordered
        } catch {
          products.value = fetched
        }
      } else {
        products.value = fetched
      }

      hydrateActiveProductId()
    } catch {
      // Keep current state on error
    }
  }

  fetchProducts()

  watch(products, (newProducts) => {
    saveOrder(newProducts)
  }, { deep: true })

  const activeIndex = computed(() => {
    const id = activeProductId.value
    if (id) return products.value.findIndex(p => p.id === id)
    return products.value.length > 0 ? 0 : -1
  })

  function selectProduct(index: number) {
    const p = products.value[index]
    if (!p?.id) return
    activeProductId.value = p.id
    persistActiveProductId(p.id)
  }

  function selectProductById(id: string): boolean {
    const idx = products.value.findIndex(p => p.id === id)
    if (idx === -1) return false
    selectProduct(idx)
    return true
  }

  /** Select by display name, project key, or UUID (same rules as denormalized refs). */
  function selectProductByName(name: string): boolean {
    const idx = findProductIndexByDenormRef(products.value, name)
    if (idx === -1) return false
    selectProduct(idx)
    return true
  }

  async function createProduct(data: {
    name: string
    logo?: string | null
    description?: string | null
    members?: { userId: string; role?: string }[]
  }): Promise<Product | { error: string } | null> {
    const authStore = useAuthStore()
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`,
        },
        body: JSON.stringify(data),
      })
      const body = await res.json()
      if (!res.ok) return { error: body.error || 'Failed to create product' }

      const newProduct: Product = {
        id: body.id,
        name: body.name,
        projectKey: body.projectKey ?? null,
        logo: body.logo || '',
        members: (data.members?.length || 0) + 1,
        dotColor: '',
        description: body.description,
        createdByUserId: body.createdByUserId,
        myRole: 'admin',
      }
      products.value.push(newProduct)
      if (newProduct.id) {
        activeProductId.value = newProduct.id
        persistActiveProductId(newProduct.id)
      }
      return newProduct
    } catch {
      return null
    }
  }

  /**
   * `currentScopeForUrl` should be `activeProductScopeForApi` when updating the loaded product
   * so duplicate display names hit the correct row on the server.
   */
  async function updateProduct(
    currentScopeForUrl: string,
    data: { name?: string; description?: string | null; logo?: string | null },
  ): Promise<{ success: true } | { success: false; error: string }> {
    const authStore = useAuthStore()
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(currentScopeForUrl)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`,
        },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string }
        return { success: false, error: errBody.error || 'Failed to update product' }
      }

      const updated = await res.json()
      const id = activeProduct.value?.id
      const idx = id
        ? products.value.findIndex(p => p.id === id)
        : findProductIndexByDenormRef(products.value, currentScopeForUrl)
      if (idx !== -1) {
        const prev = products.value[idx]!
        products.value[idx] = {
          ...prev,
          name: updated.name,
          projectKey: updated.projectKey ?? prev.projectKey ?? null,
          description: updated.description,
          logo: updated.logo || '',
          myRole: prev.myRole ?? null,
        }
      }
      return { success: true }
    } catch {
      return { success: false, error: 'Network error. Please try again.' }
    }
  }

  /** Deletes product identified by scope segment (defaults to current `activeProductScopeForApi`). */
  async function deleteProduct(scopeForUrl?: string): Promise<boolean> {
    const authStore = useAuthStore()
    const scope = scopeForUrl ?? activeProductScopeForApi.value
    const removedId = activeProduct.value?.id
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(scope)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authStore.token}`,
        },
      })
      if (!res.ok) return false

      if (removedId) {
        products.value = products.value.filter(p => p.id !== removedId)
      } else {
        products.value = products.value.filter(p => p.name !== scope)
      }
      if (removedId && activeProductId.value === removedId && products.value.length > 0) {
        const next = products.value[0]!
        activeProductId.value = next.id || ''
        if (next.id) persistActiveProductId(next.id)
      } else if (products.value.length === 0) {
        activeProductId.value = ''
        persistActiveProductId('')
      }
      return true
    } catch {
      return false
    }
  }

  const subSidebarCollapsed = ref(localStorage.getItem('productier_sub_sidebar_collapsed') === 'true')

  function toggleSubSidebar() {
    subSidebarCollapsed.value = !subSidebarCollapsed.value
    localStorage.setItem('productier_sub_sidebar_collapsed', String(subSidebarCollapsed.value))
  }

  return {
    products,
    activeProductId,
    activeIndex,
    activeProduct,
    activeProductName,
    activeProductScopeForApi,
    selectProduct,
    selectProductById,
    selectProductByName,
    createProduct,
    updateProduct,
    deleteProduct,
    fetchProducts,
    subSidebarCollapsed,
    toggleSubSidebar,
  }
})
