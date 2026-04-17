import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'

export interface Product {
  id?: string
  name: string
  logo: string
  members: number
  dotColor: string
  description?: string
  createdByUserId?: string
  /** Current user's role in this product (product_members.role); null if not a member. */
  myRole?: string | null
}

const STORAGE_KEY = 'productier_product_order'
const ACTIVE_PRODUCT_ID_KEY = 'productier_active_product_id'
/** Legacy: stored display name only — migrated once to id */
const LEGACY_ACTIVE_KEY = 'productier_active_product'

function saveOrder(products: Product[]) {
  const ids = products.map((p) => p.id).filter(Boolean) as string[]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
}

export const useProductStore = defineStore('products', () => {
  const products = ref<Product[]>([])
  const activeProductId = ref(localStorage.getItem(ACTIVE_PRODUCT_ID_KEY) || '')

  function migrateLegacyActive(fetched: Product[]) {
    if (activeProductId.value) return
    const legacy = localStorage.getItem(LEGACY_ACTIVE_KEY)
    if (!legacy) return
    const matches = fetched.filter((p) => p.name === legacy)
    if (matches.length === 1 && matches[0]!.id) {
      activeProductId.value = matches[0]!.id
      localStorage.setItem(ACTIVE_PRODUCT_ID_KEY, activeProductId.value)
    }
    localStorage.removeItem(LEGACY_ACTIVE_KEY)
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

      const fetched: Product[] = dbProducts.map((p) => ({
        id: p.id,
        name: p.name,
        logo: p.logo || '',
        members: 0,
        dotColor: '',
        description: p.description,
        createdByUserId: p.createdByUserId,
        myRole: p.myRole ?? null,
      }))

      migrateLegacyActive(fetched)

      // Apply saved order if available (ids preferred; names for legacy order files)
      const savedOrder = localStorage.getItem(STORAGE_KEY)
      if (savedOrder) {
        try {
          const savedKeys: string[] = JSON.parse(savedOrder)
          const ordered: Product[] = []
          for (const key of savedKeys) {
            const product =
              fetched.find((p) => p.id === key) || fetched.find((p) => p.name === key)
            if (product) ordered.push(product)
          }
          for (const product of fetched) {
            if (!ordered.find((p) => p.id === product.id)) {
              ordered.push(product)
            }
          }
          products.value = ordered
        } catch {
          products.value = fetched
        }
      } else {
        products.value = fetched
      }

      // Ensure active product is still valid
      if (products.value.length > 0) {
        if (!activeProductId.value || !products.value.some((p) => p.id === activeProductId.value)) {
          activeProductId.value = products.value[0]!.id || ''
          if (activeProductId.value) {
            localStorage.setItem(ACTIVE_PRODUCT_ID_KEY, activeProductId.value)
          }
        }
      } else {
        activeProductId.value = ''
        localStorage.removeItem(ACTIVE_PRODUCT_ID_KEY)
      }
    } catch {
      // Keep current state on error
    }
  }

  // Fetch from DB on store init
  fetchProducts()

  // Persist order whenever products array changes
  watch(
    products,
    (newProducts) => {
      saveOrder(newProducts)
    },
    { deep: true },
  )

  const activeIndex = computed(() =>
    products.value.findIndex((p) => p.id === activeProductId.value),
  )

  const activeProduct = computed(
    () =>
      products.value.find((p) => p.id === activeProductId.value) || products.value[0],
  )

  /** Display name of the active product (empty if none). */
  const activeProductName = computed(() => activeProduct.value?.name ?? '')

  /** Use for API paths and `?product=` — prefers stable id so duplicate display names resolve correctly. */
  const activeProductApiRef = computed(
    () => activeProductId.value || activeProduct.value?.name || '',
  )

  function selectProduct(index: number) {
    const p = products.value[index]
    if (!p?.id) return
    activeProductId.value = p.id
    localStorage.setItem(ACTIVE_PRODUCT_ID_KEY, p.id)
  }

  /** Select by exact product name; returns false if not found or ambiguous. */
  function selectProductByName(name: string): boolean {
    const matches = products.value.filter((p) => p.name === name)
    if (matches.length !== 1 || !matches[0]!.id) return false
    const idx = products.value.findIndex((p) => p.id === matches[0]!.id)
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
        localStorage.setItem(ACTIVE_PRODUCT_ID_KEY, newProduct.id)
      }
      return newProduct
    } catch {
      return null
    }
  }

  async function updateProduct(
    productRef: string,
    data: { name?: string; description?: string | null; logo?: string | null },
  ): Promise<{ success: true } | { success: false; error: string }> {
    const authStore = useAuthStore()
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(productRef)}`, {
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
      const idx = products.value.findIndex((p) => p.id === updated.id)
      if (idx !== -1) {
        const prev = products.value[idx]!
        products.value[idx] = {
          ...prev,
          name: updated.name,
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

  async function deleteProduct(productRef: string): Promise<boolean> {
    const authStore = useAuthStore()
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(productRef)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authStore.token}`,
        },
      })
      if (!res.ok) return false

      const deleted = products.value.find(
        (p) => p.id === productRef || p.name === productRef,
      )
      products.value = products.value.filter((p) => p.id !== deleted?.id)

      if (activeProductId.value === deleted?.id && products.value.length > 0) {
        activeProductId.value = products.value[0]!.id || ''
        if (activeProductId.value) {
          localStorage.setItem(ACTIVE_PRODUCT_ID_KEY, activeProductId.value)
        }
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
    activeIndex,
    activeProduct,
    activeProductName,
    activeProductApiRef,
    activeProductId,
    selectProduct,
    selectProductByName,
    createProduct,
    updateProduct,
    deleteProduct,
    fetchProducts,
    subSidebarCollapsed,
    toggleSubSidebar,
  }
})
