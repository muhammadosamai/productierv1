<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ChevronRight, ChevronDown, Plus, Frown, PanelLeftClose } from 'lucide-vue-next'
import TaskStatusIcon from '@/components/shared/TaskStatusIcon.vue'
import { useProductStore } from '@/stores/products'
import { useInitiativesStore } from '@/stores/initiatives'
import { useBacklogStore } from '@/stores/backlog'
import { useAuthStore } from '@/stores/auth'
import { useDeliveriesStore } from '@/stores/deliveries'
import { useReleasesStore } from '@/stores/releases'
import { useTestCyclesStore } from '@/stores/testCycles'
import { useIssuesStore } from '@/stores/issues'
import { useActivitiesStore } from '@/stores/activities'
import { useFavoritesStore } from '@/stores/favorites'
import { useRolesStore } from '@/stores/roles'
import { STORAGE_KEYS } from '@/constants/storageKeys'
import { useNavigationRegistry } from '@/registry/navigation'
import {
  buildChildRoute,
  iconForProductToken,
  normalizeExpandedState,
  toggleSectionByIds,
} from '@/registry/navigationUi'
import { useDomainPresentation } from '@/composables/useDomainPresentation'
import { organizationTeamsApi, type ApiOrganizationTeam } from '@/lib/apiClient'
import { parseDeliveryPrefix, qualityStatusDot, qualityStatusText } from '@/components/layout/subProductSidebarUtils'
import {
  storageGetJson,
  storageGetNumber,
  storageSet,
  storageSetJson,
} from '@/lib/browserStorage'
import type { ProductNavigationEntry } from '@/types/metadata'
import type { FavoriteEntityType } from '@/types/favorite'
import CreateInitiativeDialog from '@/components/initiative/CreateInitiativeDialog.vue'
import CreateDeliveryDialog from '@/components/delivery/CreateDeliveryDialog.vue'
import AddStoryDialog from '@/components/backlog/AddStoryDialog.vue'
import CreateTaskDialog from '@/components/delivery/CreateTaskDialog.vue'
import CreateReleaseDialog from '@/components/release/CreateReleaseDialog.vue'
import CreateTestCycleDialog from '@/components/testCycle/CreateTestCycleDialog.vue'

const router = useRouter()
const route = useRoute()
const productStore = useProductStore()
const initiativesStore = useInitiativesStore()
const backlogStore = useBacklogStore()
const authStore = useAuthStore()
const deliveriesStore = useDeliveriesStore()
const releasesStore = useReleasesStore()
const testCyclesStore = useTestCyclesStore()
const issuesStore = useIssuesStore()
const activitiesStore = useActivitiesStore()
const favoritesStore = useFavoritesStore()
const rolesStore = useRolesStore()
const navigationRegistry = useNavigationRegistry()
const domainPresentation = useDomainPresentation()

const lastActivityTime = computed(() => {
  if (activitiesStore.activities.length === 0) return 'No activity'
  const latest = activitiesStore.activities[0]
  if (!latest?.createdAt) return 'No activity'
  const d = new Date(latest.createdAt)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  return `${diffDays}d ago`
})

const activeProductLogoFailed = ref(false)
const activeProductLogoVisible = computed(
  () => Boolean(productStore.activeProduct.logo) && !activeProductLogoFailed.value,
)

function onActiveProductLogoError(): void {
  activeProductLogoFailed.value = true
}

watch(() => productStore.activeProduct.id, () => {
  activeProductLogoFailed.value = false
})

watch(() => productStore.activeProduct.logo, () => {
  activeProductLogoFailed.value = false
})

const organizationTeams = ref<ApiOrganizationTeam[]>([])

async function fetchOrganizationTeams() {
  const organizationId = productStore.activeProduct.organizationId
  if (!organizationId) {
    organizationTeams.value = []
    return
  }
  try {
    const payload = await organizationTeamsApi.list(organizationId, {}, authStore.token)
    organizationTeams.value = Array.isArray(payload) ? payload : []
  } catch {
    organizationTeams.value = []
  }
}

const showCreateDialog = ref(false)
const showCreateDeliveryDialog = ref(false)
const showCreateStoryDialog = ref(false)
const showCreateTaskDialog = ref(false)
const showCreateReleaseDialog = ref(false)
const showCreateTestCycleDialog = ref(false)

// Resizable sidebar
const SIDEBAR_STORAGE_KEY = STORAGE_KEYS.sidebar.subSidebarWidth
const MIN_WIDTH = 200
const MAX_WIDTH = 420
const DEFAULT_WIDTH = 260
const sidebarWidth = ref(storageGetNumber(SIDEBAR_STORAGE_KEY, DEFAULT_WIDTH, { min: MIN_WIDTH, max: MAX_WIDTH }))
const isResizing = ref(false)

function onResizeStart(e: MouseEvent) {
  e.preventDefault()
  isResizing.value = true
  const startX = e.clientX
  const startWidth = sidebarWidth.value

  function onMouseMove(e: MouseEvent) {
    const newWidth = startWidth + (e.clientX - startX)
    sidebarWidth.value = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth))
  }

  function onMouseUp() {
    isResizing.value = false
    storageSet(SIDEBAR_STORAGE_KEY, String(sidebarWidth.value))
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

interface NavChild {
  label: string
  avatar?: string
  avatarUrl?: string | null
  id?: string
  status?: string
  type?: string
}

interface NavItem {
  id: string
  label: string
  iconToken: string
  route: string
  pageKey: string
  hasAdd?: boolean
  children?: NavChild[]
  totalCount?: number
  expandable?: boolean
  dynamic?: boolean
}

const TOP_N = 3

function favoritedOrRecent(allChildren: NavChild[], entityType: FavoriteEntityType): NavChild[] | undefined {
  if (allChildren.length === 0) return undefined
  const favIds = favoritesStore.getFavoritesByType(entityType)
  if (favIds.size > 0) {
    const favs = allChildren.filter(c => favIds.has(c.id!))
    if (favs.length > 0) return favs
  }
  return allChildren.slice(0, TOP_N)
}

const initiativeChildren = computed(() =>
  initiativesStore.initiatives
    .filter(i => i.status !== 'archived')
    .map(i => ({
      label: i.title,
      id: i.id,
      status: i.status,
    }))
)

const storyChildren = computed(() =>
  backlogStore.stories.map(s => ({
    label: s.title,
    id: s.id,
    status: s.status,
    type: s.type,
  }))
)

const taskChildren = computed(() => {
  const result: NavChild[] = []
  for (const story of backlogStore.stories) {
    for (const task of story.tasks) {
      if (task.status === 'archived') continue
      result.push({
        label: task.title,
        id: task.id,
        status: task.status,
      })
    }
  }
  return result
})

const deliveryChildren = computed(() =>
  deliveriesStore.deliveries
    .filter(d => d.status !== 'archived')
    .map(d => ({
      label: d.title,
      id: d.id,
      status: d.status,
    }))
)

const releaseChildren = computed(() =>
  releasesStore.releases
    .filter(r => r.status !== 'completed' && r.status !== 'failed')
    .map(r => ({
      label: r.title,
      id: r.id,
      status: r.status,
    }))
)

const testCycleChildren = computed(() =>
  testCyclesStore.cycles
    .filter(c => c.status !== 'archived')
    .map(c => ({
      label: c.title,
      id: c.id,
      status: c.status,
    }))
)

const issueChildren = computed(() =>
  issuesStore.issues
    .filter((issue) => issue.source === 'standalone')
    .map((issue) => ({
      label: issue.title,
      id: issue.id,
      status: issue.status,
    }))
)

// Context menu state
const contextMenu = ref<{ show: boolean; x: number; y: number; parentItemId: string; child: NavChild | null }>({
  show: false, x: 0, y: 0, parentItemId: '', child: null,
})

function showContextMenu(parentItem: NavItem, child: NavChild, event: MouseEvent) {
  if (parentItem.id !== 'initiatives' && parentItem.id !== 'deliveries' && parentItem.id !== 'tasks') return
  if (!canDeleteItem(parentItem)) return
  event.preventDefault()
  contextMenu.value = { show: true, x: event.clientX, y: event.clientY, parentItemId: parentItem.id, child }
}

function hideContextMenu() {
  contextMenu.value = { show: false, x: 0, y: 0, parentItemId: '', child: null }
}

async function archiveFromContextMenu() {
  const { parentItemId, child } = contextMenu.value
  if (!child?.id) return
  const parentItem = allNavItems.value.find((item) => item.id === parentItemId)
  if (!parentItem || !canDeleteItem(parentItem)) return
  if (parentItemId === 'initiatives') {
    await initiativesStore.updateInitiative(child.id, { status: 'archived' })
  } else if (parentItemId === 'deliveries') {
    await deliveriesStore.updateDelivery(child.id, { status: 'archived' })
  } else if (parentItemId === 'tasks') {
    await backlogStore.updateTask(child.id, { status: 'archived' })
  }
  hideContextMenu()
}

// Close context menu on click anywhere
function onDocumentClick() {
  if (contextMenu.value.show) hideContextMenu()
}

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})

const teamChildren = computed<NavChild[]>(() =>
  organizationTeams.value.map((team) => ({
    label: team.name,
    avatar: team.name.split(' ').map((word) => word[0]).join('').toUpperCase().slice(0, 2),
    id: team.id,
  }))
)

const topBaseItems = computed<ProductNavigationEntry[]>(() => navigationRegistry.productItemsBySection.value.top || [])
const managementBaseItems = computed<ProductNavigationEntry[]>(() => navigationRegistry.productItemsBySection.value.management || [])
const qualityBaseItems = computed<ProductNavigationEntry[]>(() => navigationRegistry.productItemsBySection.value.quality || [])

const managementSectionLabel = computed(
  () => navigationRegistry.productSections.value.find((section) => section.id === 'management')?.label || 'Management',
)
const qualitySectionLabel = computed(
  () => navigationRegistry.productSections.value.find((section) => section.id === 'quality')?.label || 'Quality',
)

function hydrateNavItem(base: ProductNavigationEntry): NavItem {
  if (base.id === 'team') {
    return {
      id: base.id,
      label: base.label,
      iconToken: base.iconToken,
      route: base.route,
      pageKey: base.pageKey,
      expandable: base.expandable,
      hasAdd: base.hasAdd,
      totalCount: teamChildren.value.length,
      children: favoritedOrRecent(teamChildren.value, 'team_member'),
    }
  }
  if (base.id === 'initiatives') {
    return {
      id: base.id,
      label: base.label,
      iconToken: base.iconToken,
      route: base.route,
      pageKey: base.pageKey,
      expandable: base.expandable,
      hasAdd: base.hasAdd,
      dynamic: true,
      totalCount: initiativeChildren.value.length,
      children: favoritedOrRecent(initiativeChildren.value, 'initiative'),
    }
  }
  if (base.id === 'stories') {
    return {
      id: base.id,
      label: base.label,
      iconToken: base.iconToken,
      route: base.route,
      pageKey: base.pageKey,
      expandable: base.expandable,
      hasAdd: base.hasAdd,
      totalCount: storyChildren.value.length,
      children: favoritedOrRecent(storyChildren.value, 'story'),
    }
  }
  if (base.id === 'tasks') {
    return {
      id: base.id,
      label: base.label,
      iconToken: base.iconToken,
      route: base.route,
      pageKey: base.pageKey,
      expandable: base.expandable,
      hasAdd: base.hasAdd,
      totalCount: taskChildren.value.length,
      children: favoritedOrRecent(taskChildren.value, 'task'),
    }
  }
  if (base.id === 'deliveries') {
    return {
      id: base.id,
      label: base.label,
      iconToken: base.iconToken,
      route: base.route,
      pageKey: base.pageKey,
      expandable: base.expandable,
      hasAdd: base.hasAdd,
      dynamic: true,
      totalCount: deliveryChildren.value.length,
      children: favoritedOrRecent(deliveryChildren.value, 'delivery'),
    }
  }
  if (base.id === 'releases') {
    return {
      id: base.id,
      label: base.label,
      iconToken: base.iconToken,
      route: base.route,
      pageKey: base.pageKey,
      expandable: base.expandable,
      hasAdd: base.hasAdd,
      dynamic: true,
      totalCount: releaseChildren.value.length,
      children: favoritedOrRecent(releaseChildren.value, 'release'),
    }
  }
  if (base.id === 'test-cycles') {
    return {
      id: base.id,
      label: base.label,
      iconToken: base.iconToken,
      route: base.route,
      pageKey: base.pageKey,
      expandable: base.expandable,
      hasAdd: base.hasAdd,
      dynamic: true,
      totalCount: testCycleChildren.value.length,
      children: favoritedOrRecent(testCycleChildren.value, 'test_cycle'),
    }
  }
  if (base.id === 'issues') {
    return {
      id: base.id,
      label: base.label,
      iconToken: base.iconToken,
      route: base.route,
      pageKey: base.pageKey,
      expandable: base.expandable,
      hasAdd: base.hasAdd,
      dynamic: true,
      totalCount: issueChildren.value.length,
      children: issueChildren.value.slice(0, TOP_N),
    }
  }
  return {
    id: base.id,
    label: base.label,
    iconToken: base.iconToken,
    route: base.route,
    pageKey: base.pageKey,
    expandable: base.expandable,
    hasAdd: base.hasAdd,
  }
}

const topItems = computed<NavItem[]>(() => topBaseItems.value.map(hydrateNavItem))
const managementItems = computed<NavItem[]>(() => managementBaseItems.value.map(hydrateNavItem))
const qualityItems = computed<NavItem[]>(() => qualityBaseItems.value.map(hydrateNavItem))
const allNavItems = computed<NavItem[]>(() => [
  ...topItems.value,
  ...managementItems.value,
  ...qualityItems.value,
])
const managementExpanded = computed(
  () => managementItems.value.filter((item) => item.expandable).some((item) => isItemExpanded(item)),
)
const qualityExpanded = computed(
  () => qualityItems.value.filter((item) => item.expandable).some((item) => isItemExpanded(item)),
)

function loadExpandedState(): Record<string, boolean> {
  const saved = storageGetJson<Record<string, boolean>>(STORAGE_KEYS.sidebar.expandedGroups, {})
  return normalizeExpandedState(saved, allNavItems.value)
}

function saveExpandedState() {
  storageSetJson(STORAGE_KEYS.sidebar.expandedGroups, expandedItems.value)
}

const expandedItems = ref<Record<string, boolean>>(loadExpandedState())

watch(allNavItems, (items) => {
  expandedItems.value = normalizeExpandedState(expandedItems.value, items)
}, { deep: true })

function isItemExpanded(item: NavItem): boolean {
  return !!expandedItems.value[item.id]
}

function toggleSection(sectionId: 'management' | 'quality') {
  const items = sectionId === 'management' ? managementItems.value : qualityItems.value
  expandedItems.value = toggleSectionByIds(expandedItems.value, items)
  saveExpandedState()
}

function currentChildIdFromRoute(): string | undefined {
  if (typeof route.params.id === 'string') return route.params.id
  if (typeof route.query.story === 'string') return route.query.story
  if (typeof route.query.task === 'string') return route.query.task
  if (typeof route.query.issue === 'string') return route.query.issue
  if (typeof route.query.team === 'string') return route.query.team
  return undefined
}

function getActiveItemIdFromRoute(): string {
  const resolved = navigationRegistry.resolveProductItem(route.path)
  if (resolved) return resolved.id
  return topItems.value[0]?.id || 'overview'
}

const activeItemId = ref(getActiveItemIdFromRoute())
const activeChildId = ref(currentChildIdFromRoute())

// Sync active nav IDs when route changes (e.g. browser back/forward)
watch(() => route.fullPath, () => {
  activeItemId.value = getActiveItemIdFromRoute()
  activeChildId.value = currentChildIdFromRoute()
})

function refreshForActiveProduct() {
  if (!productStore.products.length) return
  initiativesStore.fetchInitiatives()
  backlogStore.fetchStories()
  deliveriesStore.fetchDeliveries()
  releasesStore.fetchReleases()
  testCyclesStore.fetchCycles()
  issuesStore.fetchIssues()
  fetchOrganizationTeams()
  const productId = productStore.activeProduct.id
  if (productId) favoritesStore.fetchFavorites(productId)
}

onMounted(async () => {
  await navigationRegistry.ensureNavigationLoaded()
  await productStore.fetchProducts()
  refreshForActiveProduct()
  document.addEventListener('click', onDocumentClick)
})

// When active product changes, refetch all data and navigate home
watch(() => productStore.activeIndex, () => {
  refreshForActiveProduct()
  // Navigate to overview if on a detail page (it may belong to another product)
  if (
    route.params.id
    && (
      route.path.startsWith('/initiatives/')
      || route.path.startsWith('/deliveries/')
      || route.path.startsWith('/releases/')
      || route.path.startsWith('/test-cycles/')
    )
  ) {
    router.push('/dashboard')
  }
  activeItemId.value = topItems.value[0]?.id || 'overview'
})

function toggleItem(itemId: string) {
  expandedItems.value[itemId] = !expandedItems.value[itemId]
  saveExpandedState()
}

function canAccessItem(item: NavItem): boolean {
  return rolesStore.canAccess(item.pageKey)
}

function canCreateItem(item: NavItem): boolean {
  return rolesStore.canCreate(item.pageKey)
}

function canDeleteItem(item: NavItem): boolean {
  return rolesStore.canDelete(item.pageKey)
}

function selectItem(item: NavItem) {
  activeItemId.value = item.id
  activeChildId.value = undefined
  const routePath = item.route
  if (routePath) {
    // If already on the same base path, force navigation by replacing with clean path (no query)
    if (route.path === routePath) {
      router.replace({ path: routePath, query: {} })
    } else {
      router.push(routePath)
    }
  }
}

function handleAddClick(item: NavItem, event: Event) {
  event.stopPropagation()
  if (!canCreateItem(item)) return
  if (item.id === 'initiatives') {
    showCreateDialog.value = true
  } else if (item.id === 'deliveries') {
    showCreateDeliveryDialog.value = true
  } else if (item.id === 'stories') {
    showCreateStoryDialog.value = true
  } else if (item.id === 'tasks') {
    showCreateTaskDialog.value = true
  } else if (item.id === 'releases') {
    showCreateReleaseDialog.value = true
  } else if (item.id === 'test-cycles') {
    showCreateTestCycleDialog.value = true
  }
}

function handleChildClick(parentItem: NavItem, child: NavChild, event: Event) {
  event.stopPropagation()
  if (!child.id) return
  const destination = buildChildRoute(parentItem.id, child.id)
  if (!destination) return
  activeItemId.value = parentItem.id
  activeChildId.value = child.id
  router.push(destination)
}

function onInitiativeCreated(id: string) {
  expandedItems.value.initiatives = true
  activeItemId.value = 'initiatives'
  saveExpandedState()
  router.push(`/initiatives/${id}`)
}

function onDeliveryCreated(id: string) {
  expandedItems.value.deliveries = true
  activeItemId.value = 'deliveries'
  saveExpandedState()
  router.push(`/deliveries/${id}`)
}

function onStoryCreated(id: string) {
  expandedItems.value.stories = true
  activeItemId.value = 'stories'
  saveExpandedState()
  router.push({ path: '/stories', query: { story: id } })
}

function onTaskCreated() {
  expandedItems.value.tasks = true
  activeItemId.value = 'tasks'
  saveExpandedState()
  router.push('/tasks')
}

function onReleaseCreated(id: string) {
  expandedItems.value.releases = true
  activeItemId.value = 'releases'
  saveExpandedState()
  router.push(`/releases/${id}`)
}

function onTestCycleCreated(id: string) {
  expandedItems.value['test-cycles'] = true
  activeItemId.value = 'test-cycles'
  saveExpandedState()
  testCyclesStore.fetchCycles()
  router.push(`/test-cycles/${id}`)
}
</script>

<template>
  <div class="relative flex shrink-0" :style="{ width: sidebarWidth + 'px' }">
  <aside class="flex flex-col w-full overflow-y-auto shadow-[2px_0_8px_-2px_rgba(0,0,0,0.06)]"
  style="background-color: rgb(255 255 255)"
  >
    <!-- Product header -->
    <div class="flex items-center gap-3 px-5 pt-4 pb-3">
      <div class="flex items-center justify-center w-10 h-10 rounded-xl overflow-hidden shrink-0">
        <img
          v-if="activeProductLogoVisible"
          :src="productStore.activeProduct.logo"
          :alt="productStore.activeProduct.name"
          class="w-full h-full object-cover"
          @error="onActiveProductLogoError"
        />
        <div
          v-else
          class="w-full h-full flex items-center justify-center bg-linear-to-br from-[#4857FE] to-[#7C5CFC] text-white text-xs font-bold"
        >
          {{ productStore.activeProduct.name.slice(0, 2).toUpperCase() }}
        </div>
      </div>
      <div class="flex-1 min-w-0">
        <h2 class="text-[15px] font-semibold text-gray-900 truncate">{{ productStore.activeProduct.name }}</h2>
        <p class="text-xs text-gray-400 mt-0.5">{{ lastActivityTime }}</p>
      </div>
      <button
        class="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer p-1 rounded-md hover:bg-gray-100"
        title="Collapse sidebar"
        @click="productStore.toggleSubSidebar()"
      >
        <PanelLeftClose :size="16" />
      </button>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 px-4 pb-4">
      <!-- Top items (Overview, Team) -->
      <div class="border-t border-gray-100 mx-3 mt-3 mb-5"></div>
      <ul class="space-y-1 mb-2">
        <li v-for="item in topItems" :key="item.id" v-show="canAccessItem(item)">
          <button
            class="w-full flex items-center gap-3 px-3 py-[10px] rounded-lg text-[15px] transition-all duration-200"
            :class="[
              activeItemId === item.id
                ? 'bg-[#4857FE]/10 text-[#4857FE] font-medium'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            ]"
            @click="selectItem(item)"
          >
            <span class="flex items-center shrink-0" :class="activeItemId === item.id ? 'text-[#4857FE]' : 'text-gray-400'">
              <component :is="iconForProductToken(item.iconToken)" :size="20" />
            </span>
            <span class="flex-1 text-left truncate">{{ item.label }}<span v-if="item.totalCount != null" class="text-gray-400 font-normal text-[13px] ml-1">({{ item.totalCount }})</span></span>

            <span
              v-if="item.expandable"
              class="text-gray-400 shrink-0 p-0.5 rounded hover:bg-gray-200/50 transition-colors"
              @click.stop="toggleItem(item.id)"
            >
              <component :is="isItemExpanded(item) ? ChevronDown : ChevronRight" :size="16" />
            </span>

            <Plus
              v-if="item.hasAdd && canCreateItem(item)"
              :size="16"
              class="text-gray-300 hover:text-[#4857FE] transition-colors shrink-0"
              @click.stop="handleAddClick(item, $event)"
            />
          </button>

          <!-- Children (Team members) -->
          <ul v-if="item.children && isItemExpanded(item)" class="mt-1 ml-4 pl-4 border-l border-gray-100 space-y-0.5">
            <li
              v-for="child in item.children"
              :key="child.id || child.label"
              class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer text-[14px] text-gray-500 hover:text-gray-700 transition-colors min-w-0"
              :class="(child.id && activeChildId === child.id) ? 'bg-[#4857FE]/5 text-[#4857FE]' : ''"
              @click="handleChildClick(item, child, $event)"
            >
              <div
                v-if="child.avatar"
                class="flex items-center justify-center w-5 h-5 rounded-full bg-[#7C5CFC] text-white text-[8px] font-medium overflow-hidden shrink-0"
              >
                <img v-if="child.avatarUrl" :src="child.avatarUrl" class="w-5 h-5 rounded-full object-cover" :alt="child.label" />
                <span v-else>{{ child.avatar }}</span>
              </div>
              <span class="truncate">{{ child.label }}</span>
            </li>
          </ul>
        </li>
      </ul>

      <!-- Management section -->
      <div class="mb-4 mt-3">
        <div class="border-t border-gray-100 mx-3 mb-5"></div>
        <button
          class="w-full flex items-center justify-between px-1 mb-3 group cursor-pointer"
          @click="toggleSection('management')"
        >
          <div class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">{{ managementSectionLabel }}</span>
          </div>
          <svg v-if="managementExpanded" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400 hover:text-gray-600 transition-colors"><path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400 hover:text-gray-600 transition-colors"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>
        </button>

        <ul class="space-y-1">
          <li v-for="item in managementItems" :key="item.id" v-show="canAccessItem(item)">
            <!-- Nav item -->
            <button
              class="w-full flex items-center gap-3 px-3 py-[10px] rounded-lg text-[15px] transition-all duration-200"
              :class="[
                activeItemId === item.id
                  ? 'bg-[#4857FE]/10 text-[#4857FE] font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              ]"
              @click="selectItem(item)"
            >
              <!-- Icon -->
              <span class="flex items-center shrink-0" :class="activeItemId === item.id ? 'text-[#4857FE]' : 'text-gray-400'">
                <component :is="iconForProductToken(item.iconToken)" :size="20" />
              </span>

              <span class="flex-1 text-left truncate">{{ item.label }}<span v-if="item.totalCount != null" class="text-gray-400 font-normal text-[13px] ml-1">({{ item.totalCount }})</span></span>

              <!-- Chevron for expandable -->
              <span
                v-if="item.expandable"
                class="text-gray-400 shrink-0 p-0.5 rounded hover:bg-gray-200/50 transition-colors"
                @click.stop="toggleItem(item.id)"
              >
                <component
                  :is="isItemExpanded(item) ? ChevronDown : ChevronRight"
                  :size="16"
                />
              </span>

              <!-- Add button -->
              <Plus
                v-if="item.hasAdd && canCreateItem(item)"
                :size="16"
                class="text-gray-300 hover:text-[#4857FE] transition-colors shrink-0"
                @click="handleAddClick(item, $event)"
              />
            </button>

            <!-- Children -->
            <ul v-if="item.children && isItemExpanded(item)" class="mt-1 ml-4 pl-4 border-l border-gray-100 space-y-0.5">
              <li
                v-for="child in item.children"
                :key="child.id || child.label"
                class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer text-[14px] text-gray-500 hover:text-gray-700 transition-colors min-w-0"
                :class="(child.id && activeChildId === child.id) ? 'bg-[#4857FE]/5 text-[#4857FE]' : ''"
                @click="handleChildClick(item, child, $event)"
                @contextmenu="showContextMenu(item, child, $event)"
              >
                <!-- Avatar for team members -->
                <div
                  v-if="child.avatar"
                  class="flex items-center justify-center w-5 h-5 rounded-full bg-[#7C5CFC] text-white text-[8px] font-medium overflow-hidden shrink-0"
                >
                  <img
                    v-if="child.avatarUrl"
                    :src="child.avatarUrl"
                    class="w-5 h-5 rounded-full object-cover"
                    :alt="child.label"
                  />
                  <span v-else>{{ child.avatar }}</span>
                </div>

                <!-- Task status icons -->
                <TaskStatusIcon v-if="!child.avatar && child.status && item.id === 'tasks'" :status="child.status" :size="16" />

                <!-- Story type icons -->
                <component
                  v-if="!child.avatar && item.id === 'stories' && child.type"
                  :is="domainPresentation.storyTypeIcon(child.type)"
                  :size="16"
                  class="shrink-0"
                  :class="domainPresentation.storyTypeIconColor(child.type)"
                />

                <!-- Status dot indicator for releases -->
                <div
                  v-if="!child.avatar && child.status && item.id === 'releases'"
                  class="w-2 h-2 rounded-full shrink-0"
                  :class="domainPresentation.releaseStatusDot(child.status)"
                ></div>

                <!-- Status bar indicator (non-task, non-story, non-delivery, non-release items) -->
                <div
                  v-if="!child.avatar && child.status && item.id !== 'tasks' && item.id !== 'stories' && item.id !== 'deliveries' && item.id !== 'releases'"
                  class="w-[3px] h-5 rounded-full shrink-0"
                  :class="item.id === 'issues' ? domainPresentation.storyStatusDot(child.status) : qualityStatusDot(child.status)"
                ></div>

                <!-- Feedback icon -->
                <Frown
                  v-if="!child.avatar && !child.status"
                  :size="18"
                  class="text-gray-400 shrink-0"
                />

                <!-- Delivery title with color-coded #N prefix -->
                <span v-if="item.id === 'deliveries'" class="truncate">
                  <span v-if="parseDeliveryPrefix(child.label).prefix" class="font-medium" :class="domainPresentation.deliveryStatusText(child.status)">{{ parseDeliveryPrefix(child.label).prefix }}</span>{{ parseDeliveryPrefix(child.label).prefix ? ' - ' : '' }}{{ parseDeliveryPrefix(child.label).rest }}
                </span>
                <!-- Default label -->
                <span v-else class="truncate">{{ child.label }}</span>
              </li>


            </ul>
          </li>
        </ul>
      </div>

      <!-- Quality section -->
      <div class="mt-5">
        <div class="border-t border-gray-100 mx-3 mb-5"></div>
        <button
          class="w-full flex items-center justify-between px-1 mb-3 group cursor-pointer"
          @click="toggleSection('quality')"
        >
          <div class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>
            <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">{{ qualitySectionLabel }}</span>
          </div>
          <svg v-if="qualityExpanded" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400 hover:text-gray-600 transition-colors"><path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400 hover:text-gray-600 transition-colors"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>
        </button>

        <ul class="space-y-1">
          <li v-for="item in qualityItems" :key="item.id" v-show="canAccessItem(item)">
            <button
              class="w-full flex items-center gap-3 px-3 py-[10px] rounded-lg text-[15px] transition-all duration-200"
              :class="[
                activeItemId === item.id
                  ? 'bg-[#4857FE]/10 text-[#4857FE] font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              ]"
              @click="selectItem(item)"
            >
              <span class="flex items-center shrink-0" :class="activeItemId === item.id ? 'text-[#4857FE]' : 'text-gray-400'">
                <component :is="iconForProductToken(item.iconToken)" :size="20" />
              </span>

              <span class="flex-1 text-left truncate">{{ item.label }}<span v-if="item.totalCount != null" class="text-gray-400 font-normal text-[13px] ml-1">({{ item.totalCount }})</span></span>

              <!-- Chevron for expandable -->
              <span
                v-if="item.expandable"
                class="text-gray-400 shrink-0 p-0.5 rounded hover:bg-gray-200/50 transition-colors"
                @click.stop="toggleItem(item.id)"
              >
                <component
                  :is="isItemExpanded(item) ? ChevronDown : ChevronRight"
                  :size="16"
                />
              </span>

              <Plus
                v-if="item.hasAdd && canCreateItem(item)"
                :size="16"
                class="text-gray-300 hover:text-[#4857FE] transition-colors shrink-0"
                @click.stop
              />
            </button>

            <!-- Children -->
            <ul v-if="item.children && isItemExpanded(item)" class="mt-1 ml-4 pl-4 border-l border-gray-100 space-y-0.5">
              <li
                v-for="child in item.children"
                :key="child.id || child.label"
                class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer text-[14px] text-gray-500 hover:text-gray-700 transition-colors"
                @click="handleChildClick(item, child, $event)"
                :class="(child.id && activeChildId === child.id) ? 'bg-[#4857FE]/5 text-[#4857FE]' : ''"
              >
                <div
                  class="w-1 h-4 rounded-full shrink-0"
                  :class="qualityStatusDot(child.status)"
                />
                <!-- Testing Cycle with #N prefix -->
                <span v-if="item.id === 'test-cycles'" class="truncate">
                  <span v-if="parseDeliveryPrefix(child.label).prefix" class="font-medium" :class="qualityStatusText(child.status)">{{ parseDeliveryPrefix(child.label).prefix }}</span>{{ parseDeliveryPrefix(child.label).prefix ? ' - ' : '' }}{{ parseDeliveryPrefix(child.label).rest }}
                </span>
                <span v-else class="truncate">{{ child.label }}</span>
              </li>
            </ul>
          </li>
        </ul>
      </div>
    </nav>

    <!-- Create Initiative Dialog -->
    <CreateInitiativeDialog v-model:open="showCreateDialog" @created="onInitiativeCreated" />
    <!-- Create Delivery Dialog -->
    <CreateDeliveryDialog v-model:open="showCreateDeliveryDialog" @created="onDeliveryCreated" />
    <!-- Create Story Dialog -->
    <AddStoryDialog v-model:open="showCreateStoryDialog" @created="onStoryCreated" />
    <!-- Create Task Dialog -->
    <CreateTaskDialog v-model:open="showCreateTaskDialog" @created="onTaskCreated" />
    <!-- Create Release Dialog -->
    <CreateReleaseDialog v-model:open="showCreateReleaseDialog" @created="onReleaseCreated" />
    <CreateTestCycleDialog v-model:open="showCreateTestCycleDialog" @created="onTestCycleCreated" />

    <!-- Context Menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu.show"
        class="fixed z-9999 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px]"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <button
          class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          @click="archiveFromContextMenu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
          Archive
        </button>
      </div>
    </Teleport>
  </aside>

  <!-- Resize handle -->
  <div
    class="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-10 group"
    @mousedown="onResizeStart"
  >
    <div
      class="w-full h-full transition-colors"
      :class="isResizing ? 'bg-[#4857FE]/30' : 'group-hover:bg-[#4857FE]/20'"
    ></div>
  </div>
  </div>
</template>
