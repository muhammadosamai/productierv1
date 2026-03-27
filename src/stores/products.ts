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
}

const STORAGE_KEY = 'productier_product_order'
const ACTIVE_PRODUCT_KEY = 'productier_active_product'

const defaultProducts: Product[] = [
  { name: 'Traderboards', logo: '/products/Traderboards.png', members: 8, dotColor: '' },
  { name: 'Traderguilds', logo: '/products/Traderguilds.png', members: 14, dotColor: '' },
  { name: 'Traderverse', logo: '/products/Traderverse.png', members: 12, dotColor: '' },
  { name: 'VIZT', logo: '/products/VIZT.png', members: 5, dotColor: '' },
  { name: 'VitalWallet', logo: '/products/VitalWallet.png', members: 9, dotColor: '' },
  { name: 'TradersGPT', logo: '/products/TradersGPT.png', members: 17, dotColor: '' },
]

function loadSavedOrder(): Product[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return defaultProducts
    const savedNames: string[] = JSON.parse(saved)
    const ordered: Product[] = []
    for (const name of savedNames) {
      const product = defaultProducts.find(p => p.name === name)
      if (product) ordered.push(product)
    }
    for (const product of defaultProducts) {
      if (!ordered.find(p => p.name === product.name)) {
        ordered.push(product)
      }
    }
    return ordered
  } catch {
    return defaultProducts
  }
}

function saveOrder(products: Product[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products.map(p => p.name)))
}

export const useProductStore = defineStore('products', () => {
  const products = ref<Product[]>(loadSavedOrder())
  const savedActive = localStorage.getItem(ACTIVE_PRODUCT_KEY)
  const activeProductName = ref(
    savedActive && products.value.some(p => p.name === savedActive)
      ? savedActive
      : products.value[0]!.name
  )

  // Persist order whenever products array changes
  watch(products, (newProducts) => {
    saveOrder(newProducts)
  }, { deep: true })

  const activeIndex = computed(() =>
    products.value.findIndex(p => p.name === activeProductName.value)
  )

  const activeProduct = computed(() =>
    products.value.find(p => p.name === activeProductName.value) || products.value[0]!
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
  }): Promise<Product | null> {
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
      if (!res.ok) return null

      const created = await res.json()
      const newProduct: Product = {
        id: created.id,
        name: created.name,
        logo: created.logo || '',
        members: (data.members?.length || 0) + 1, // +1 for creator
        dotColor: '',
        description: created.description,
      }
      products.value.push(newProduct)
      // Select the new product
      activeProductName.value = newProduct.name
      localStorage.setItem(ACTIVE_PRODUCT_KEY, activeProductName.value)
      return newProduct
    } catch {
      return null
    }
  }

  const subSidebarCollapsed = ref(localStorage.getItem('productier_sub_sidebar_collapsed') === 'true')

  function toggleSubSidebar() {
    subSidebarCollapsed.value = !subSidebarCollapsed.value
    localStorage.setItem('productier_sub_sidebar_collapsed', String(subSidebarCollapsed.value))
  }

  return { products, activeIndex, activeProduct, activeProductName, selectProduct, createProduct, subSidebarCollapsed, toggleSubSidebar }
})
