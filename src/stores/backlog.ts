import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  Story,
  StoryStatus,
  CreateStoryPayload,
  CreateTaskPayload,
  Task,
  TaskComment,
} from '@/types/backlog'
import { useAuthStore } from '@/stores/auth'
import { assertPageAction, ensureOk } from '@/lib/storeAuthz'
import { apiFetch } from '@/lib/apiClient'
import { buildProductScopedPath, resolveProductScope } from '@/lib/productScopeApi'

export const useBacklogStore = defineStore('backlog', () => {
  const stories = ref<Story[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const nextCursor = ref<string | null>(null)
  const hasMore = ref(false)
  const totalApprox = ref<number | null>(null)
  const lastQuery = ref<{
    productId?: string
    q?: string
    sort?: string
    limit: number
  } | null>(null)

  const storyCount = computed(() => stories.value.length)

  function normalizeStory(story: Story): Story {
    return {
      ...story,
      tasks: Array.isArray(story.tasks) ? story.tasks : [],
      owner: story.ownerUser?.name ?? null,
      ownerAvatar: story.ownerUser?.avatar ?? null,
    }
  }

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

  function extractStoriesEnvelope(payload: unknown): {
    items: Story[]
    nextCursor: string | null
    hasMore: boolean
    totalApprox: number | null
  } {
    if (Array.isArray(payload)) {
      return {
        items: payload as Story[],
        nextCursor: null,
        hasMore: false,
        totalApprox: null,
      }
    }
    if (payload && typeof payload === 'object') {
      const envelope = payload as {
        items?: Story[]
        nextCursor?: string | null
        hasMore?: boolean
        totalApprox?: number
      }
      return {
        items: Array.isArray(envelope.items) ? envelope.items : [],
        nextCursor: typeof envelope.nextCursor === 'string' ? envelope.nextCursor : null,
        hasMore: Boolean(envelope.hasMore),
        totalApprox: typeof envelope.totalApprox === 'number' ? envelope.totalApprox : null,
      }
    }
    return {
      items: [],
      nextCursor: null,
      hasMore: false,
      totalApprox: null,
    }
  }

  function mergeStories(base: Story[], incoming: Story[]) {
    const byId = new Map<string, Story>()
    for (const story of base) byId.set(story.id, story)
    for (const story of incoming) byId.set(story.id, story)
    return [...byId.values()]
  }

  function patchStoryInState(updatedStory: Story): boolean {
    const index = stories.value.findIndex((story) => story.id === updatedStory.id)
    if (index < 0) return false
    const existing = stories.value[index]!
    stories.value[index] = {
      ...existing,
      ...normalizeStory(updatedStory),
      tasks: Array.isArray(updatedStory.tasks) ? updatedStory.tasks : existing.tasks,
    }
    return true
  }

  function patchTaskInState(taskId: string, patch: Partial<Task>): boolean {
    let patched = false
    stories.value = stories.value.map((story) => {
      const taskIndex = story.tasks.findIndex((task) => task.id === taskId)
      if (taskIndex < 0) return story
      const nextTasks = [...story.tasks]
      const existingTask = nextTasks[taskIndex]!
      nextTasks[taskIndex] = { ...existingTask, ...patch }
      patched = true
      return { ...story, tasks: nextTasks }
    })
    return patched
  }

  async function fetchStories(
    productId?: string,
    options: {
      q?: string
      sort?: string
      cursor?: string | null
      limit?: number
      append?: boolean
    } = {},
  ) {
    assertPageAction('stories', 'read', 'stories')
    const scope = resolveProductScope(productId)
    if (!scope) {
      stories.value = []
      nextCursor.value = null
      hasMore.value = false
      totalApprox.value = null
      return
    }
    const authStore = useAuthStore()
    loading.value = true
    error.value = null
    const resolvedLimit = options.limit ?? 80
    lastQuery.value = {
      productId: scope.productId,
      q: options.q,
      sort: options.sort,
      limit: resolvedLimit,
    }
    try {
      const res = await apiFetch(buildProductScopedPath(scope, '/stories'), {
        token: authStore.token,
        query: {
          paged: 1,
          q: options.q,
          sort: options.sort,
          cursor: options.cursor,
          limit: resolvedLimit,
        },
      })
      await ensureOk(res, 'Failed to fetch stories')
      const parsed = extractStoriesEnvelope(await res.json())
      const normalized = parsed.items.map(normalizeStory)
      stories.value = options.append
        ? mergeStories(stories.value, normalized)
        : normalized
      nextCursor.value = parsed.nextCursor
      hasMore.value = parsed.hasMore
      totalApprox.value = parsed.totalApprox
    } catch (e) {
      error.value = (e as Error).message
      if (!options.append) {
        stories.value = []
      }
      nextCursor.value = null
      hasMore.value = false
      totalApprox.value = null
    } finally {
      loading.value = false
    }
  }

  async function reloadStories() {
    const previous = lastQuery.value
    await fetchStories(previous?.productId, {
      q: previous?.q,
      sort: previous?.sort,
      limit: previous?.limit,
    })
  }

  async function createStory(payload: CreateStoryPayload): Promise<Story | null> {
    try {
      assertPageAction('stories', 'create', 'stories')
      const authStore = useAuthStore()
      const scope = resolveProductScope((payload as { productId?: string | null }).productId)
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, '/stories'), {
        method: 'POST',
        token: authStore.token,
        json: {
          ...payload,
          productId: scope.productId,
        },
      })
      await ensureOk(res, 'Failed to create story')
      await reloadStories()
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function updateStory(
    id: string,
    payload: Partial<CreateStoryPayload>,
    options: { reload?: boolean } = {},
  ) {
    try {
      assertPageAction('stories', 'edit', 'stories')
      const authStore = useAuthStore()
      const scope = resolveProductScope()
      if (!scope) {
        error.value = 'No active product selected'
        return
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/stories/${id}`), {
        method: 'PUT',
        token: authStore.token,
        json: payload,
      })
      await ensureOk(res, 'Failed to update story')
      const updatedStory = await res.json() as Story
      const patched = patchStoryInState(updatedStory)
      if (!patched || options.reload === true) {
        await reloadStories()
      }
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function deleteStory(id: string) {
    try {
      assertPageAction('stories', 'delete', 'stories')
      const authStore = useAuthStore()
      const scope = resolveProductScope()
      if (!scope) {
        error.value = 'No active product selected'
        return
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/stories/${id}`), {
        method: 'DELETE',
        token: authStore.token,
      })
      await ensureOk(res, 'Failed to delete story')
      stories.value = stories.value.filter((story) => story.id !== id)
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function createTask(storyId: string, payload: CreateTaskPayload) {
    try {
      assertPageAction('tasks', 'create', 'tasks')
      const authStore = useAuthStore()
      const scope = resolveProductScope()
      if (!scope) {
        error.value = 'No active product selected'
        return
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/tasks/by-story/${storyId}`), {
        method: 'POST',
        token: authStore.token,
        json: payload,
      })
      await ensureOk(res, 'Failed to create task')
      const createdTask = await res.json() as Task
      const hasParentStory = stories.value.some((story) => story.id === storyId)
      if (hasParentStory) {
        stories.value = stories.value.map((story) => (
          story.id === storyId
            ? { ...story, tasks: [...story.tasks, createdTask] }
            : story
        ))
      } else {
        await reloadStories()
      }
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function updateTask(taskId: string, payload: Partial<CreateTaskPayload>) {
    try {
      assertPageAction('tasks', 'edit', 'tasks')
      const authStore = useAuthStore()
      const scope = resolveProductScope()
      if (!scope) {
        error.value = 'No active product selected'
        return
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/tasks/${taskId}`), {
        method: 'PUT',
        token: authStore.token,
        json: payload,
      })
      await ensureOk(res, 'Failed to update task')
      const updatedTask = await res.json() as Task
      const patched = patchTaskInState(taskId, updatedTask)
      if (!patched) {
        await reloadStories()
      }
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function deleteTask(taskId: string) {
    try {
      assertPageAction('tasks', 'delete', 'tasks')
      const authStore = useAuthStore()
      const scope = resolveProductScope()
      if (!scope) {
        error.value = 'No active product selected'
        return
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/tasks/${taskId}`), {
        method: 'DELETE',
        token: authStore.token,
      })
      await ensureOk(res, 'Failed to delete task')
      stories.value = stories.value.map((story) => ({
        ...story,
        tasks: story.tasks.filter((task) => task.id !== taskId),
      }))
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function bulkUpdateStories(storyIds: string[], payload: Partial<CreateStoryPayload>) {
    if (storyIds.length === 0) return
    for (const storyId of storyIds) {
      await updateStory(storyId, payload, { reload: false })
    }
    await reloadStories()
  }

  async function reorderStories(orderedStoryIds: string[], status?: StoryStatus) {
    if (orderedStoryIds.length === 0) return
    const scope = resolveProductScope()
    if (!scope) return
    const authStore = useAuthStore()
    const res = await apiFetch(buildProductScopedPath(scope, '/stories/reorder'), {
      method: 'PUT',
      token: authStore.token,
      json: {
        productId: scope.productId,
        status,
        orderedStoryIds,
      },
    })
    await ensureOk(res, 'Failed to reorder stories')
    await reloadStories()
  }

  async function fetchTaskComments(taskId: string): Promise<TaskComment[]> {
    try {
      assertPageAction('tasks', 'read', 'task comments')
      const authStore = useAuthStore()
      const scope = resolveProductScope()
      if (!scope) return []
      const res = await apiFetch(buildProductScopedPath(scope, `/tasks/${taskId}/comments`), {
        token: authStore.token,
      })
      await ensureOk(res, 'Failed to fetch comments')
      return await res.json()
    } catch {
      return []
    }
  }

  async function createTaskComment(taskId: string, content: string): Promise<TaskComment | null> {
    try {
      assertPageAction('tasks', 'create', 'comments')
      const authStore = useAuthStore()
      const scope = resolveProductScope()
      if (!scope) {
        error.value = 'No active product selected'
        return null
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/tasks/${taskId}/comments`), {
        method: 'POST',
        token: authStore.token,
        json: { content },
      })
      await ensureOk(res, 'Failed to create comment')
      return await res.json()
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function deleteTaskComment(commentId: string) {
    try {
      assertPageAction('tasks', 'delete', 'comments')
      const authStore = useAuthStore()
      const scope = resolveProductScope()
      if (!scope) {
        error.value = 'No active product selected'
        return
      }
      const res = await apiFetch(buildProductScopedPath(scope, `/tasks/comments/${commentId}`), {
        method: 'DELETE',
        token: authStore.token,
      })
      await ensureOk(res, 'Failed to delete comment')
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  return {
    stories, loading, error, storyCount, allTasks,
    nextCursor, hasMore, totalApprox,
    fetchStories, createStory, updateStory, deleteStory,
    bulkUpdateStories, reorderStories,
    createTask, updateTask, deleteTask,
    fetchTaskComments, createTaskComment, deleteTaskComment,
  }
})
