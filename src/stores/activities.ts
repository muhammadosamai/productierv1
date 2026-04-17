import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useProductStore } from './products'

export interface ActivityChange {
  field: string
  from: string | null
  to: string | null
}

export interface Activity {
  id: string
  product: string
  userId: string | null
  userName: string
  userAvatar: string | null
  action: string
  entityType: string
  entityId: string | null
  entityTitle: string
  changes: ActivityChange[] | null
  createdAt: string
}

const API_BASE = '/api'

export const useActivitiesStore = defineStore('activities', () => {
  const activities = ref<Activity[]>([])
  const loading = ref(false)

  async function fetchActivities(product?: string) {
    const productStore = useProductStore()
    const p = product || productStore.activeProductApiRef || ''
    loading.value = true
    try {
      const res = await fetch(`${API_BASE}/activities?product=${encodeURIComponent(p)}&limit=50`)
      if (res.ok) {
        activities.value = await res.json()
      }
    } catch (e) {
      console.error('Failed to fetch activities:', e)
    } finally {
      loading.value = false
    }
  }

  return { activities, loading, fetchActivities }
})
