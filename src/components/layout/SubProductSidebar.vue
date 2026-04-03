<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ChevronRight, ChevronDown, Plus, Frown, Sparkles, Bug, Lightbulb, FlaskConical, FolderOpen, Wrench, Server, TestTube2, FileText, BugPlay, Gauge, MessageSquareWarning, PanelLeftClose, LayoutDashboard, Users, BookOpen } from 'lucide-vue-next'
import TaskStatusIcon from '@/components/shared/TaskStatusIcon.vue'
import { useProductStore } from '@/stores/products'
import { useInitiativesStore } from '@/stores/initiatives'
import { useBacklogStore } from '@/stores/backlog'
import { useAuthStore } from '@/stores/auth'
import { useDeliveriesStore } from '@/stores/deliveries'
import { useReleasesStore } from '@/stores/releases'
import { useTestCyclesStore } from '@/stores/testCycles'
import { useActivitiesStore } from '@/stores/activities'
import { useFavoritesStore } from '@/stores/favorites'
import { useRolesStore } from '@/stores/roles'
import type { FavoriteEntityType } from '@/types/favorite'
import CreateInitiativeDialog from '@/components/initiative/CreateInitiativeDialog.vue'
import CreateDeliveryDialog from '@/components/delivery/CreateDeliveryDialog.vue'
import AddStoryDialog from '@/components/backlog/AddStoryDialog.vue'
import CreateTaskDialog from '@/components/delivery/CreateTaskDialog.vue'
import CreateReleaseDialog from '@/components/release/CreateReleaseDialog.vue'
import CreateTestCycleDialog from '@/components/testCycle/CreateTestCycleDialog.vue'
import InviteMemberDialog from '@/components/team/InviteMemberDialog.vue'
import CreateIssueDialog from '@/components/issue/CreateIssueDialog.vue'
import { useIssuesStore } from '@/stores/issues'

const router = useRouter()
const route = useRoute()
const productStore = useProductStore()
const initiativesStore = useInitiativesStore()
const backlogStore = useBacklogStore()
const authStore = useAuthStore()
const deliveriesStore = useDeliveriesStore()
const releasesStore = useReleasesStore()
const testCyclesStore = useTestCyclesStore()
const activitiesStore = useActivitiesStore()
const favoritesStore = useFavoritesStore()
const rolesStore = useRolesStore()
const issuesStore = useIssuesStore()

const hasProducts = computed(() => productStore.products.length > 0)
const activeProduct = computed(() => productStore.activeProduct)
const activeProductName = computed(() => activeProduct.value?.name ?? '')
const activeProductLogo = computed(() => activeProduct.value?.logo ?? '')

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

// Team members fetched from API
interface TeamUser {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
}
const teamMembers = ref<TeamUser[]>([])

async function fetchTeamMembers() {
  const productName = productStore.activeProduct?.name
  if (!productName) {
    teamMembers.value = []
    return
  }
  try {
    const res = await fetch(`/api/products/${encodeURIComponent(productName)}/members`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) {
      const data = await res.json()
      teamMembers.value = data.map((m: any) => ({
        id: m.userId,
        name: m.userName,
        email: m.userEmail,
        role: m.userRole,
        avatar: m.userAvatar,
      }))
    }
  } catch {
    teamMembers.value = []
  }
}

const showCreateDialog = ref(false)
const showCreateDeliveryDialog = ref(false)
const showCreateStoryDialog = ref(false)
const showCreateTaskDialog = ref(false)
const showCreateReleaseDialog = ref(false)
const showCreateTestCycleDialog = ref(false)
const showInviteMemberDialog = ref(false)
const showCreateIssueDialog = ref(false)

// Resizable sidebar
const SIDEBAR_STORAGE_KEY = 'sub-sidebar-width'
const MIN_WIDTH = 200
const MAX_WIDTH = 420
const DEFAULT_WIDTH = 260
const sidebarWidth = ref(parseInt(localStorage.getItem(SIDEBAR_STORAGE_KEY) || String(DEFAULT_WIDTH)))
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
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth.value))
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
  label: string
  hasAdd?: boolean
  children?: NavChild[]
  totalCount?: number
  expandable?: boolean
  dynamic?: boolean
}

// Computed children for the sidebar
const statusColors: Record<string, string> = {
  initialized: 'bg-[#ff69b4]',
  pending: 'bg-[#a25ddc]',
  planning: 'bg-[#fdab3d]',
  active: 'bg-[#00c875]',
  paused: 'bg-[#e2445c]',
  completed: 'bg-[#00c875]',
  // Story/task statuses
  backlog: 'bg-[#c4c4c4]',
  ready: 'bg-[#00c875]',
  in_progress: 'bg-[#fdab3d]',
  done: 'bg-[#00c875]',
  archived: 'bg-[#c4c4c4]',
  todo: 'bg-[#c4c4c4]',
  review: 'bg-[#e2445c]',
  canceled: 'bg-[#e2445c]',
  overdue: 'bg-[#e2445c]',
  blocked: 'bg-[#a25ddc]',
  draft: 'bg-gray-400',
  planned: 'bg-[#a25ddc]',
  failed: 'bg-[#e2445c]',
}

const deliveryStatusTextColor: Record<string, string> = {
  initialized: 'text-[#ff69b4]',
  in_progress: 'text-[#fdab3d]',
  overdue: 'text-[#e2445c]',
  blocked: 'text-[#a25ddc]',
  completed: 'text-[#00c875]',
  archived: 'text-gray-400',
}

function parseDeliveryPrefix(title: string) {
  const match = title.match(/^(#\d+)\s+(.*)$/)
  if (match) return { prefix: match[1], rest: match[2] }
  return { prefix: '', rest: title }
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
  backlogStore.stories
    .filter(s => s.status !== 'archived')
    .map(s => ({
      label: s.title,
      id: s.id,
      status: s.status,
      type: s.type,
    }))
)

const issueChildren = computed(() =>
  issuesStore.issues.map(i => ({
    label: i.title,
    id: i.id,
    status: i.status,
    type: i.type,
  }))
)

const storyTypeIcons: Record<string, any> = {
  feature: Sparkles,
  bug: Bug,
  improvement: Lightbulb,
  technical_debt: Wrench,
  research: FlaskConical,
  infrastructure: Server,
  testing: TestTube2,
  documentation: FileText,
}

function storyTypeIconColor(type: string): string {
  switch (type) {
    case 'feature': return 'text-blue-500'
    case 'bug': return 'text-red-500'
    case 'improvement': return 'text-purple-500'
    case 'technical_debt': return 'text-orange-500'
    case 'research': return 'text-yellow-500'
    case 'infrastructure': return 'text-gray-600'
    case 'testing': return 'text-green-500'
    case 'documentation': return 'text-gray-400'
    default: return 'text-gray-400'
  }
}

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

// Context menu state
const contextMenu = ref<{ show: boolean; x: number; y: number; parentLabel: string; child: NavChild | null }>({
  show: false, x: 0, y: 0, parentLabel: '', child: null,
})

function showContextMenu(parentLabel: string, child: NavChild, event: MouseEvent) {
  if (parentLabel !== 'Initiatives' && parentLabel !== 'Deliveries' && parentLabel !== 'Tasks') return
  event.preventDefault()
  contextMenu.value = { show: true, x: event.clientX, y: event.clientY, parentLabel, child }
}

function hideContextMenu() {
  contextMenu.value = { show: false, x: 0, y: 0, parentLabel: '', child: null }
}

async function archiveFromContextMenu() {
  const { parentLabel, child } = contextMenu.value
  if (!child?.id) return
  if (parentLabel === 'Initiatives') {
    await initiativesStore.updateInitiative(child.id, { status: 'archived' })
  } else if (parentLabel === 'Deliveries') {
    await deliveriesStore.updateDelivery(child.id, { status: 'archived' })
  } else if (parentLabel === 'Tasks') {
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
  teamMembers.value.map(u => ({
    label: u.name,
    avatar: u.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
    avatarUrl: u.avatar,
    id: u.id,
  }))
)

const topItems = computed<NavItem[]>(() => [
  { label: 'Overview', expandable: false, hasAdd: false },
  { label: 'Wiki', expandable: false, hasAdd: false },
  {
    label: 'Team',
    expandable: true,
    hasAdd: true,
    totalCount: teamChildren.value.length,
    children: favoritedOrRecent(teamChildren.value, 'team_member'),
  },
])

const managementItems = computed<NavItem[]>(() => [
  {
    label: 'Initiatives',
    expandable: true,
    hasAdd: true,
    dynamic: true,
    totalCount: initiativeChildren.value.length,
    children: favoritedOrRecent(initiativeChildren.value, 'initiative'),
  },
  {
    label: 'Stories',
    expandable: true,
    hasAdd: true,
    totalCount: storyChildren.value.length,
    children: favoritedOrRecent(storyChildren.value, 'story'),
  },
  {
    label: 'Issues',
    expandable: true,
    hasAdd: true,
    totalCount: issueChildren.value.length,
    children: favoritedOrRecent(issueChildren.value, 'issue'),
  },
  {
    label: 'Tasks',
    expandable: true,
    hasAdd: true,
    totalCount: taskChildren.value.length,
    children: favoritedOrRecent(taskChildren.value, 'task'),
  },
  {
    label: 'Deliveries',
    expandable: true,
    hasAdd: true,
    dynamic: true,
    totalCount: deliveryChildren.value.length,
    children: favoritedOrRecent(deliveryChildren.value, 'delivery'),
  },
  {
    label: 'Releases',
    expandable: true,
    hasAdd: true,
    dynamic: true,
    totalCount: releaseChildren.value.length,
    children: favoritedOrRecent(releaseChildren.value, 'release'),
  },
])

const qualityItems = computed<NavItem[]>(() => [
  {
    label: 'Testing Cycles',
    expandable: true,
    hasAdd: true,
    dynamic: true,
    totalCount: testCycleChildren.value.length,
    children: favoritedOrRecent(testCycleChildren.value, 'test_cycle'),
  },
  { label: 'Performance Cycles', expandable: false, hasAdd: true },
  { label: 'Consumer Feedback', expandable: false, hasAdd: true },
  { label: 'Feature Requests', expandable: false, hasAdd: true },
])

const defaultExpanded: Record<string, boolean> = {
  Initiatives: true,
  Stories: true,
  Tasks: true,
  Deliveries: true,
  Releases: true,
  Team: true,
  'Testing Cycles': true,
  'Consumer Feedback': true,
}

function loadExpandedState(): Record<string, boolean> {
  try {
    const saved = localStorage.getItem('productier_sidebar_expanded')
    if (saved) return { ...defaultExpanded, ...JSON.parse(saved) }
  } catch {}
  return { ...defaultExpanded }
}

function saveExpandedState() {
  localStorage.setItem('productier_sidebar_expanded', JSON.stringify(expandedItems.value))
}

const expandedItems = ref<Record<string, boolean>>(loadExpandedState())


function toggleSection(section: string) {
  const items = section === 'Management' ? managementItems.value : qualityItems.value
  const expandableLabels = items.filter(i => i.expandable).map(i => i.label)
  const allCollapsed = expandableLabels.every(l => !expandedItems.value[l])
  for (const label of expandableLabels) {
    expandedItems.value[label] = allCollapsed
  }
  saveExpandedState()
}

function getActiveItemFromRoute(): string {
  const path = route.path
  if (path.startsWith('/stories') || path.startsWith('/backlog') || path === '/') return 'Stories'
  if (path.startsWith('/tasks')) return 'Tasks'
  if (path === '/initiatives' || path.startsWith('/initiatives/')) return 'Initiatives'
  if (path === '/deliveries' || path.startsWith('/deliveries/')) return 'Deliveries'
  if (path === '/team' || path.startsWith('/team/')) return 'Team'
  if (path === '/metrics' || path.startsWith('/metrics/')) return 'Overview'
  if (path === '/releases' || path.startsWith('/releases/')) return 'Releases'
  if (path === '/test-cycles' || path.startsWith('/test-cycles/')) return 'Testing Cycles'
  if (path === '/issues' || path.startsWith('/issues/')) return 'Issues'
  if (path === '/feedbacks' || path.startsWith('/feedbacks/')) return 'Consumer Feedback'
  if (path === '/feature-requests' || path.startsWith('/feature-requests/')) return 'Feature Requests'
  if (path === '/wiki' || path.startsWith('/wiki/')) return 'Wiki'
  if (path.startsWith('/settings')) return 'Overview'
  return 'Overview'
}

const activeItem = ref(getActiveItemFromRoute())
const activeChildId = ref(route.params.id as string | undefined)

// Sync activeItem when route changes (e.g. browser back/forward)
watch(() => route.path, () => {
  activeItem.value = getActiveItemFromRoute()
  activeChildId.value = route.params.id as string | undefined
})

onMounted(() => {
  initiativesStore.fetchInitiatives()
  backlogStore.fetchStories()
  deliveriesStore.fetchDeliveries()
  releasesStore.fetchReleases()
  testCyclesStore.fetchCycles()
  issuesStore.fetchIssues(productStore.activeProduct?.name)
  fetchTeamMembers()
  favoritesStore.fetchFavorites(productStore.activeProduct?.name || '')
  document.addEventListener('click', onDocumentClick)
})

// When active product changes, refetch all data and navigate home
watch(() => productStore.activeIndex, () => {
  initiativesStore.fetchInitiatives()
  backlogStore.fetchStories()
  deliveriesStore.fetchDeliveries()
  releasesStore.fetchReleases()
  testCyclesStore.fetchCycles()
  issuesStore.fetchIssues(productStore.activeProduct?.name)
  fetchTeamMembers()
  favoritesStore.fetchFavorites(productStore.activeProduct?.name || '')
  // Navigate to overview if on a detail page (it may belong to another product)
  if (route.params.id && (route.path.startsWith('/initiatives/') || route.path.startsWith('/deliveries/') || route.path.startsWith('/releases/'))) {
    router.push('/metrics')
  }
  activeItem.value = 'Overview'
})

function toggleItem(label: string) {
  expandedItems.value[label] = !expandedItems.value[label]
  saveExpandedState()
}

const labelToRoute: Record<string, string> = {
  'Stories': '/stories',
  'Issues': '/issues',
  'Tasks': '/tasks',
  'Initiatives': '/initiatives',
  'Deliveries': '/deliveries',
  'Team': '/team',
  'Overview': '/metrics',
  'Wiki': '/wiki',
  'Releases': '/releases',
  'Testing Cycles': '/test-cycles',
  'Performance Cycles': '/issues',
  'Consumer Feedback': '/feedbacks',
  'Feature Requests': '/feature-requests',
}

// Map sidebar labels to role permission page keys
const labelToPageKey: Record<string, string> = {
  'Overview': 'overview',
  'Wiki': 'wiki',
  'Team': 'team',
  'Initiatives': 'initiatives',
  'Stories': 'stories',
  'Issues': 'issues',
  'Tasks': 'tasks',
  'Deliveries': 'deliveries',
  'Releases': 'releases',
  'Testing Cycles': 'test-cycles',
  'Performance Cycles': 'issues',
  'Consumer Feedback': 'feedbacks',
  'Feature Requests': 'feature-requests',
}

function canAccessItem(label: string): boolean {
  const pageKey = labelToPageKey[label]
  if (!pageKey) return true
  return rolesStore.canAccess(pageKey)
}

function selectItem(label: string) {
  activeItem.value = label
  activeChildId.value = undefined
  const routePath = labelToRoute[label]
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
  if (item.label === 'Initiatives') {
    showCreateDialog.value = true
  } else if (item.label === 'Deliveries') {
    showCreateDeliveryDialog.value = true
  } else if (item.label === 'Stories') {
    showCreateStoryDialog.value = true
  } else if (item.label === 'Tasks') {
    showCreateTaskDialog.value = true
  } else if (item.label === 'Releases') {
    showCreateReleaseDialog.value = true
  } else if (item.label === 'Testing Cycles') {
    showCreateTestCycleDialog.value = true
  } else if (item.label === 'Team') {
    showInviteMemberDialog.value = true
  } else if (item.label === 'Issues') {
    showCreateIssueDialog.value = true
  }
}

function handleChildClick(parentLabel: string, child: NavChild, event: Event) {
  event.stopPropagation()
  if (parentLabel === 'Initiatives' && child.id) {
    activeItem.value = child.label
    router.push(`/initiatives/${child.id}`)
  } else if (parentLabel === 'Deliveries' && child.id) {
    activeItem.value = child.label
    router.push(`/deliveries/${child.id}`)
  } else if (parentLabel === 'Stories' && child.id) {
    activeItem.value = 'Stories'
    activeChildId.value = child.id
    router.push({ path: '/stories', query: { story: child.id } })
  } else if (parentLabel === 'Issues' && child.id) {
    activeItem.value = 'Issues'
    activeChildId.value = child.id
    router.push({ path: '/issues', query: { issue: child.id } })
  } else if (parentLabel === 'Tasks' && child.id) {
    activeItem.value = 'Tasks'
    activeChildId.value = child.id
    router.push({ path: '/tasks', query: { task: child.id } })
  } else if (parentLabel === 'Releases' && child.id) {
    activeItem.value = child.label
    router.push(`/releases/${child.id}`)
  } else if (parentLabel === 'Testing Cycles' && child.id) {
    activeItem.value = child.label
    router.push(`/test-cycles/${child.id}`)
  } else if (parentLabel === 'Team' && child.id) {
    activeItem.value = 'Team'
    activeChildId.value = child.id
    router.push({ path: '/team', query: { member: child.id } })
  }
}

function onInitiativeCreated(id: string) {
  expandedItems.value['Initiatives'] = true
  activeItem.value = 'Initiatives'
  router.push(`/initiatives/${id}`)
}

function onDeliveryCreated(id: string) {
  expandedItems.value['Deliveries'] = true
  activeItem.value = 'Deliveries'
  router.push(`/deliveries/${id}`)
}

function onStoryCreated(id: string) {
  expandedItems.value['Stories'] = true
  activeItem.value = 'Stories'
  router.push({ path: '/stories', query: { story: id } })
}

function onTaskCreated() {
  expandedItems.value['Tasks'] = true
  activeItem.value = 'Tasks'
  router.push('/tasks')
}

function onReleaseCreated(id: string) {
  expandedItems.value['Releases'] = true
  activeItem.value = 'Releases'
  router.push(`/releases/${id}`)
}

function onTestCycleCreated(id: string) {
  expandedItems.value['Testing Cycles'] = true
  activeItem.value = 'Testing Cycles'
  testCyclesStore.fetchCycles()
  router.push(`/test-cycles/${id}`)
}

function onIssueCreated() {
  activeItem.value = 'Issues'
  issuesStore.fetchIssues(productStore.activeProduct?.name)
  router.push('/issues')
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
          v-if="activeProductLogo"
          :src="activeProductLogo"
          :alt="activeProductName || 'Product'"
          class="w-full h-full object-cover"
        />
        <div
          v-else
          class="w-full h-full flex items-center justify-center bg-[#4857FE] text-white text-sm font-semibold"
        >
          {{ activeProductName ? activeProductName.charAt(0).toUpperCase() : '?' }}
        </div>
      </div>
      <div class="flex-1 min-w-0">
        <h2 class="text-[15px] font-semibold text-gray-900 truncate">{{ activeProductName || 'No product selected' }}</h2>
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
    <nav v-if="hasProducts" class="flex-1 px-4 pb-4">
      <!-- Top items (Overview, Team) -->
      <div class="border-t border-gray-100 mx-3 mt-3 mb-5"></div>
      <ul class="space-y-1 mb-2">
        <li v-for="item in topItems" :key="item.label" v-show="canAccessItem(item.label)">
          <button
            class="w-full flex items-center gap-3 px-3 py-[10px] rounded-lg text-[15px] transition-all duration-200"
            :class="[
              activeItem === item.label
                ? 'bg-[#4857FE]/10 text-[#4857FE] font-medium'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            ]"
            @click="selectItem(item.label)"
          >
            <span class="flex items-center shrink-0" :class="activeItem === item.label ? 'text-[#4857FE]' : 'text-gray-400'">
              <LayoutDashboard v-if="item.label === 'Overview'" :size="20" />
              <BookOpen v-if="item.label === 'Wiki'" :size="20" />
              <Users v-if="item.label === 'Team'" :size="20" />
            </span>
            <span class="flex-1 text-left truncate">{{ item.label }}<span v-if="item.totalCount != null" class="text-gray-400 font-normal text-[13px] ml-1">({{ item.totalCount }})</span></span>

            <span
              v-if="item.expandable"
              class="text-gray-400 shrink-0 p-0.5 rounded hover:bg-gray-200/50 transition-colors"
              @click.stop="toggleItem(item.label)"
            >
              <component :is="expandedItems[item.label] ? ChevronDown : ChevronRight" :size="16" />
            </span>

            <Plus
              v-if="item.hasAdd"
              :size="16"
              class="text-gray-300 hover:text-[#4857FE] transition-colors shrink-0"
              @click.stop="handleAddClick(item, $event)"
            />
          </button>

          <!-- Children (Team members) -->
          <ul v-if="item.children && expandedItems[item.label]" class="mt-1 ml-4 pl-4 border-l border-gray-100 space-y-0.5">
            <li
              v-for="child in item.children"
              :key="child.id || child.label"
              class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer text-[14px] text-gray-500 hover:text-gray-700 transition-colors min-w-0"
              :class="(child.id && activeChildId === child.id) ? 'bg-[#4857FE]/5 text-[#4857FE]' : ''"
              @click="handleChildClick(item.label, child, $event)"
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
          @click="toggleSection('Management')"
        >
          <div class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Management</span>
          </div>
          <svg v-if="managementItems.filter(i => i.expandable).some(i => expandedItems[i.label])" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400 hover:text-gray-600 transition-colors"><path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400 hover:text-gray-600 transition-colors"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>
        </button>

        <ul class="space-y-1">
          <li v-for="item in managementItems" :key="item.label" v-show="canAccessItem(item.label)">
            <!-- Nav item -->
            <button
              class="w-full flex items-center gap-3 px-3 py-[10px] rounded-lg text-[15px] transition-all duration-200"
              :class="[
                activeItem === item.label
                  ? 'bg-[#4857FE]/10 text-[#4857FE] font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              ]"
              @click="selectItem(item.label)"
            >
              <!-- Icon -->
              <span class="flex items-center shrink-0" :class="activeItem === item.label ? 'text-[#4857FE]' : 'text-gray-400'">
                <svg v-if="item.label === 'Stories'" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
                <Bug v-if="item.label === 'Issues'" :size="20" />
                <svg v-if="item.label === 'Tasks'" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <svg v-if="item.label === 'Initiatives'" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/></svg>
                <svg v-if="item.label === 'Deliveries'" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                <svg v-if="item.label === 'Releases'" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
              </span>

              <span class="flex-1 text-left truncate">{{ item.label }}<span v-if="item.totalCount != null" class="text-gray-400 font-normal text-[13px] ml-1">({{ item.totalCount }})</span></span>

              <!-- Chevron for expandable -->
              <span
                v-if="item.expandable"
                class="text-gray-400 shrink-0 p-0.5 rounded hover:bg-gray-200/50 transition-colors"
                @click.stop="toggleItem(item.label)"
              >
                <component
                  :is="expandedItems[item.label] ? ChevronDown : ChevronRight"
                  :size="16"
                />
              </span>

              <!-- Add button -->
              <Plus
                v-if="item.hasAdd"
                :size="16"
                class="text-gray-300 hover:text-[#4857FE] transition-colors shrink-0"
                @click="handleAddClick(item, $event)"
              />
            </button>

            <!-- Children -->
            <ul v-if="item.children && expandedItems[item.label]" class="mt-1 ml-4 pl-4 border-l border-gray-100 space-y-0.5">
              <li
                v-for="child in item.children"
                :key="child.id || child.label"
                class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer text-[14px] text-gray-500 hover:text-gray-700 transition-colors min-w-0"
                :class="(child.id && activeChildId === child.id) ? 'bg-[#4857FE]/5 text-[#4857FE]' : ''"
                @click="handleChildClick(item.label, child, $event)"
                @contextmenu="showContextMenu(item.label, child, $event)"
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
                <TaskStatusIcon v-if="!child.avatar && child.status && item.label === 'Tasks'" :status="child.status" :size="16" />

                <!-- Story type icons -->
                <component
                  v-if="!child.avatar && item.label === 'Stories' && child.type"
                  :is="storyTypeIcons[child.type] || FolderOpen"
                  :size="16"
                  class="shrink-0"
                  :class="storyTypeIconColor(child.type)"
                />

                <!-- Status dot indicator for releases -->
                <div
                  v-if="!child.avatar && child.status && item.label === 'Releases'"
                  class="w-2 h-2 rounded-full shrink-0"
                  :class="statusColors[child.status || ''] || 'bg-blue-400'"
                ></div>

                <!-- Status bar indicator (non-task, non-story, non-delivery, non-release items) -->
                <div
                  v-if="!child.avatar && child.status && item.label !== 'Tasks' && item.label !== 'Stories' && item.label !== 'Deliveries' && item.label !== 'Releases'"
                  class="w-[3px] h-5 rounded-full shrink-0"
                  :class="statusColors[child.status || ''] || 'bg-blue-400'"
                ></div>

                <!-- Feedback icon -->
                <Frown
                  v-if="!child.avatar && !child.status"
                  :size="18"
                  class="text-gray-400 shrink-0"
                />

                <!-- Delivery title with color-coded #N prefix -->
                <span v-if="item.label === 'Deliveries'" class="truncate">
                  <span v-if="parseDeliveryPrefix(child.label).prefix" class="font-medium" :class="deliveryStatusTextColor[child.status || ''] || 'text-gray-500'">{{ parseDeliveryPrefix(child.label).prefix }}</span>{{ parseDeliveryPrefix(child.label).prefix ? ' - ' : '' }}{{ parseDeliveryPrefix(child.label).rest }}
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
          @click="toggleSection('Quality')"
        >
          <div class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>
            <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Quality</span>
          </div>
          <svg v-if="qualityItems.filter(i => i.expandable).some(i => expandedItems[i.label])" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400 hover:text-gray-600 transition-colors"><path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400 hover:text-gray-600 transition-colors"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>
        </button>

        <ul class="space-y-1">
          <li v-for="item in qualityItems" :key="item.label" v-show="canAccessItem(item.label)">
            <button
              class="w-full flex items-center gap-3 px-3 py-[10px] rounded-lg text-[15px] transition-all duration-200"
              :class="[
                activeItem === item.label
                  ? 'bg-[#4857FE]/10 text-[#4857FE] font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              ]"
              @click="selectItem(item.label)"
            >
              <span class="flex items-center shrink-0" :class="activeItem === item.label ? 'text-[#4857FE]' : 'text-gray-400'">
                <BugPlay v-if="item.label === 'Testing Cycles'" :size="20" />
                <Gauge v-if="item.label === 'Performance Cycles'" :size="20" />
                <MessageSquareWarning v-if="item.label === 'Consumer Feedback'" :size="20" />
                <Lightbulb v-if="item.label === 'Feature Requests'" :size="20" />
              </span>

              <span class="flex-1 text-left truncate">{{ item.label }}<span v-if="item.totalCount != null" class="text-gray-400 font-normal text-[13px] ml-1">({{ item.totalCount }})</span></span>

              <!-- Chevron for expandable -->
              <span
                v-if="item.expandable"
                class="text-gray-400 shrink-0 p-0.5 rounded hover:bg-gray-200/50 transition-colors"
                @click.stop="toggleItem(item.label)"
              >
                <component
                  :is="expandedItems[item.label] ? ChevronDown : ChevronRight"
                  :size="16"
                />
              </span>

              <Plus
                v-if="item.hasAdd"
                :size="16"
                class="text-gray-300 hover:text-[#4857FE] transition-colors shrink-0"
                @click.stop
              />
            </button>

            <!-- Children -->
            <ul v-if="item.children && expandedItems[item.label]" class="mt-1 ml-4 pl-4 border-l border-gray-100 space-y-0.5">
              <li
                v-for="child in item.children"
                :key="child.id || child.label"
                class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer text-[14px] text-gray-500 hover:text-gray-700 transition-colors"
                @click="handleChildClick(item.label, child, $event)"
                :class="(child.id && activeChildId === child.id) ? 'bg-[#4857FE]/5 text-[#4857FE]' : ''"
              >
                <div
                  class="w-1 h-4 rounded-full shrink-0"
                  :class="{
                    'bg-[#fdab3d]': child.status === 'planned',
                    'bg-[#00c875]': child.status === 'in_progress',
                    'bg-gray-400': child.status === 'completed',
                    'bg-gray-300': child.status === 'archived' || !child.status,
                  }"
                />
                <!-- Testing Cycle with #N prefix -->
                <span v-if="item.label === 'Testing Cycles'" class="truncate">
                  <span v-if="parseDeliveryPrefix(child.label).prefix" class="font-medium" :class="{
                    'text-[#fdab3d]': child.status === 'planned',
                    'text-[#00c875]': child.status === 'in_progress',
                    'text-gray-400': child.status === 'completed' || child.status === 'archived',
                  }">{{ parseDeliveryPrefix(child.label).prefix }}</span>{{ parseDeliveryPrefix(child.label).prefix ? ' - ' : '' }}{{ parseDeliveryPrefix(child.label).rest }}
                </span>
                <span v-else class="truncate">{{ child.label }}</span>
              </li>
            </ul>
          </li>
        </ul>
      </div>
    </nav>

    <div v-else class="flex-1 px-6 py-6 text-center text-sm text-gray-500">
      No products yet. Create or join a product to see sidebar sections.
    </div>

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
    <InviteMemberDialog v-model:open="showInviteMemberDialog" />
    <CreateIssueDialog v-model:open="showCreateIssueDialog" @created="onIssueCreated" />

    <!-- Context Menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu.show"
        class="fixed z-[9999] bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px]"
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
