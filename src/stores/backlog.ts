import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Story, CreateStoryPayload, CreateTaskPayload, Task, TaskComment } from '@/types/backlog'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'

const API_BASE = '/api'

function authHeaders() {
  const authStore = useAuthStore()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authStore.token}`,
  }
}

export const useBacklogStore = defineStore('backlog', () => {
  const stories = ref<Story[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const storyCount = computed(() => stories.value.length)

  // Flatten all tasks across all stories
  const allTasks = computed(() => {
    const result: (Task & { storyTitle: string })[] = []
    for (const story of stories.value) {
      for (const task of story.tasks) {
        result.push({ ...task, storyTitle: story.title })
      }
    }
    return result
  })

  async function fetchStories(productName?: string) {
    const product = productName || useProductStore().activeProductName
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/stories?product=${encodeURIComponent(product)}`)
      if (!res.ok) throw new Error('Failed to fetch stories')
      stories.value = await res.json()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function createStory(payload: CreateStoryPayload): Promise<Story | null> {
    try {
      const res = await fetch(`${API_BASE}/stories`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to create story')
      await fetchStories()
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function updateStory(id: string, payload: Partial<CreateStoryPayload>) {
    try {
      const res = await fetch(`${API_BASE}/stories/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to update story')
      await fetchStories()
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function deleteStory(id: string) {
    try {
      const res = await fetch(`${API_BASE}/stories/${id}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error('Failed to delete story')
      stories.value = stories.value.filter(s => s.id !== id)
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function createTask(storyId: string, payload: CreateTaskPayload) {
    try {
      const res = await fetch(`${API_BASE}/tasks/by-story/${storyId}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to create task')
      await fetchStories()
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function updateTask(taskId: string, payload: Partial<CreateTaskPayload>) {
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to update task')
      await fetchStories()
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function deleteTask(taskId: string) {
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Failed to delete task')
      await fetchStories()
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function fetchTaskComments(taskId: string): Promise<TaskComment[]> {
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}/comments`, {
        headers: authHeaders(),
      })
      if (!res.ok) return []
      return await res.json()
    } catch {
      return []
    }
  }

  async function createTaskComment(taskId: string, content: string): Promise<TaskComment | null> {
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error('Failed to create comment')
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function deleteTaskComment(commentId: string) {
    try {
      const res = await fetch(`${API_BASE}/tasks/comments/${commentId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Failed to delete comment')
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  return {
    stories, loading, error, storyCount, allTasks,
    fetchStories, createStory, updateStory, deleteStory,
    createTask, updateTask, deleteTask,
    fetchTaskComments, createTaskComment, deleteTaskComment,
  }
})
