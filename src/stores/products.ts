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
}

const STORAGE_KEY = 'productier_product_order'
const ACTIVE_PRODUCT_KEY = 'productier_active_product'

function saveOrder(products: Product[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products.map(p => p.name)))
}

export const useProductStore = defineStore('products', () => {
  const products = ref<Product[]>([])
  const activeProductName = ref(localStorage.getItem(ACTIVE_PRODUCT_KEY) || '')

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
        logo: p.logo || '',
        members: 0,
        dotColor: '',
        description: p.description,
        createdByUserId: p.createdByUserId,
      }))

      // Apply saved order if available
      const savedOrder = localStorage.getItem(STORAGE_KEY)
      if (savedOrder) {
        try {
          const savedNames: string[] = JSON.parse(savedOrder)
          const ordered: Product[] = []
          for (const name of savedNames) {
            const product = fetched.find(p => p.name === name)
            if (product) ordered.push(product)
          }
          for (const product of fetched) {
            if (!ordered.find(p => p.name === product.name)) {
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
        if (!products.value.some(p => p.name === activeProductName.value)) {
          activeProductName.value = products.value[0]!.name
          localStorage.setItem(ACTIVE_PRODUCT_KEY, activeProductName.value)
        }
      } else {
        activeProductName.value = ''
      }
    } catch {
      // Keep current state on error
    }
  }

  // Fetch from DB on store init
  fetchProducts()

  // Persist order whenever products array changes
  watch(products, (newProducts) => {
    saveOrder(newProducts)
  }, { deep: true })

  const activeIndex = computed(() =>
    products.value.findIndex(p => p.name === activeProductName.value)
  )

  const activeProduct = computed(() =>
    products.value.find(p => p.name === activeProductName.value) || products.value[0]
  )

  function selectProduct(index: number) {
    activeProductName.value = products.value[index]!.name
    localStorage.setItem(ACTIVE_PRODUCT_KEY, activeProductName.value)
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
      }
      products.value.push(newProduct)
      activeProductName.value = newProduct.name
      localStorage.setItem(ACTIVE_PRODUCT_KEY, activeProductName.value)
      return newProduct
    } catch {
      return null
    }
  }

  async function updateProduct(currentName: string, data: { name?: string; description?: string | null; logo?: string | null }): Promise<boolean> {
    const authStore = useAuthStore()
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(currentName)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`,
        },
        body: JSON.stringify(data),
      })
      if (!res.ok) return false

      const updated = await res.json()
      const idx = products.value.findIndex(p => p.name === currentName)
      if (idx !== -1) {
        products.value[idx] = {
          ...products.value[idx]!,
          name: updated.name,
          description: updated.description,
          logo: updated.logo || '',
        }
      }
      if (activeProductName.value === currentName && updated.name !== currentName) {
        activeProductName.value = updated.name
        localStorage.setItem(ACTIVE_PRODUCT_KEY, updated.name)
      }
      return true
    } catch {
      return false
    }
  }

  async function deleteProduct(productName: string): Promise<boolean> {
    const authStore = useAuthStore()
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(productName)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authStore.token}`,
        },
      })
      if (!res.ok) return false

      products.value = products.value.filter(p => p.name !== productName)
      if (activeProductName.value === productName && products.value.length > 0) {
        activeProductName.value = products.value[0]!.name
        localStorage.setItem(ACTIVE_PRODUCT_KEY, activeProductName.value)
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

  return { products, activeIndex, activeProduct, activeProductName, selectProduct, createProduct, updateProduct, deleteProduct, fetchProducts, subSidebarCollapsed, toggleSubSidebar }
})
