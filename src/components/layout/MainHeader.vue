<script setup lang="ts">
import { Search, Settings, Moon, HelpCircle, Bell, ChevronDown, LogOut, Archive, CheckCheck, BellOff, Loader2, ListChecks, Target, Package, Users, BookOpen } from 'lucide-vue-next'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import { useProductStore } from '@/stores/products'
import { useGlobalSearchStore } from '@/stores/globalSearch'
import type { NotificationCategory, NotificationItem, NotificationSeverity, NotificationUrgency } from '@/types/notification'
import type { GlobalSearchResult, SearchEntityType } from '@/types/search'
import { useRouter } from 'vue-router'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { buildGlobalSearchEntityRoute } from '@/lib/homeEntityRouting'
import {
  categoryLabel,
  emphasisBorderClass,
  formatRelativeTime,
  isSameLocalDay,
  severityClass,
  urgencyClass,
  urgencyLabel,
} from '@/components/layout/mainHeaderNotificationUtils'

const authStore = useAuthStore()
const notificationsStore = useNotificationsStore()
const productStore = useProductStore()
const globalSearchStore = useGlobalSearchStore()
const router = useRouter()
const notificationsOpen = ref(false)
let unreadPollingHandle: number | null = null
let searchDebounceHandle: number | null = null
const searchContainerRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const isMacPlatform = ref(false)
const SEARCH_LISTBOX_ID = 'global-search-listbox'

const searchTypeOptions: Array<{ id: SearchEntityType; label: string }> = [
  { id: 'task', label: 'Tasks' },
  { id: 'initiative', label: 'Initiatives' },
  { id: 'delivery', label: 'Deliveries' },
  { id: 'team_member', label: 'Team' },
  { id: 'wiki_asset', label: 'Wiki' },
]

type NotificationQuickView =
  | 'all'
  | 'needs_action'
  | 'assigned_to_me'
  | 'needs_review'
  | 'at_risk'
  | 'releases'
  | 'unassigned'

const notificationQuickViewOptions: Array<{
  id: NotificationQuickView
  label: string
}> = [
  { id: 'all', label: 'All' },
  { id: 'needs_action', label: 'Needs my action' },
  { id: 'assigned_to_me', label: 'Assigned to me' },
  { id: 'needs_review', label: 'Needs my review' },
  { id: 'at_risk', label: 'At risk' },
  { id: 'releases', label: 'Releases' },
  { id: 'unassigned', label: 'Unassigned' },
]

const shortcutLabel = computed(() => (isMacPlatform.value ? '⌘K' : 'Ctrl+K'))

function optionId(index: number): string {
  return `global-search-option-${index}`
}

const groupedSearchResults = computed(() => {
  const byType = new Map<SearchEntityType, Array<{ index: number; result: GlobalSearchResult }>>()
  globalSearchStore.results.forEach((result, index) => {
    const existing = byType.get(result.entityType) || []
    existing.push({ index, result })
    byType.set(result.entityType, existing)
  })

  return searchTypeOptions
    .map((option) => {
      const items = byType.get(option.id)
      if (!items || items.length === 0) return null
      return { id: option.id, label: option.label, items }
    })
    .filter((group): group is {
      id: SearchEntityType
      label: string
      items: Array<{ index: number; result: GlobalSearchResult }>
    } => group !== null)
})

const activeDescendantId = computed(() => {
  if (!globalSearchStore.open) return undefined
  if (globalSearchStore.activeIndex < 0) return undefined
  return optionId(globalSearchStore.activeIndex)
})

const searchLiveRegionMessage = computed(() => {
  const query = globalSearchStore.query.trim()
  if (!globalSearchStore.open && !query) return ''
  if (globalSearchStore.loading) return 'Searching...'
  if (globalSearchStore.error) return globalSearchStore.error
  if (!query) return 'Search across tasks, initiatives, deliveries, team, and wiki.'
  if (globalSearchStore.results.length === 0) return 'No results found.'
  if (globalSearchStore.totalApprox > globalSearchStore.results.length) {
    return `${globalSearchStore.results.length} of about ${globalSearchStore.totalApprox} results shown.`
  }
  return `${globalSearchStore.results.length} results shown.`
})

const userInitials = computed(() => {
  if (!authStore.user?.name) return '?'
  return authStore.user.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
})

type SettingsTarget = 'profile' | 'notifications' | 'roles' | 'titles' | 'organization-members'

function settingsPathFor(target?: SettingsTarget): string {
  if (target === 'notifications') return '/settings/notifications'
  if (target === 'roles') return '/settings/organization/roles'
  if (target === 'titles') return '/settings/organization/titles'
  if (target === 'organization-members') return '/settings/organization/members'
  return '/settings/profile'
}

function goToSettings(target?: SettingsTarget) {
  router.push(settingsPathFor(target))
}

function goToSettingsRoot() {
  goToSettings()
}

function goToRoleSettingsIfAllowed() {
  if (authStore.user?.role === 'super_admin') {
    goToSettings('roles')
    return
  }
  if (authStore.user?.role === 'admin') {
    goToSettings('titles')
    return
  }
  if (authStore.user?.role === 'product_admin') {
    goToSettings('organization-members')
    return
  }
  goToSettings('profile')
}

function goToNotificationSettings() {
  notificationsOpen.value = false
  goToSettings('notifications')
}

function handleLogout() {
  notificationsStore.reset()
  authStore.logout()
  router.push('/login')
}

const unreadBadgeText = computed(() => {
  const count = notificationsStore.unreadCount
  if (count <= 0) return ''
  if (count > 99) return '99+'
  return String(count)
})

const ALL_PRODUCTS_FILTER_VALUE = 'all_products'
const notificationProductFilterValue = ref<string>(ALL_PRODUCTS_FILTER_VALUE)
const notificationQuickView = ref<NotificationQuickView>('all')
const notificationTypeFilter = ref<'all' | string>('all')
const notificationCategoryFilter = ref<'all' | NotificationCategory>('all')
const notificationUrgencyFilter = ref<'all' | NotificationUrgency>('all')
const notificationSeverityFilter = ref<'all' | NotificationSeverity>('all')
const notificationEntityTypeFilter = ref<'all' | string>('all')
const notificationUnreadOnly = ref(false)
const showAdvancedNotificationFilters = ref(false)

const notificationProductOptions = computed(() =>
  productStore.products
    .filter((product) => !!product.id)
    .map((product) => ({
      id: String(product.id),
      name: product.name,
    }))
)

function resolveNotificationProductName(productId: string): string {
  const matched = notificationProductOptions.value.find((entry) => entry.id === productId)
  if (matched) return matched.name
  if (productStore.activeProduct.id === productId) return productStore.activeProduct.name || 'Current product'
  return productId
}

const notificationScopeProductId = computed(() => {
  const selected = notificationProductFilterValue.value.trim()
  if (!selected || selected === ALL_PRODUCTS_FILTER_VALUE) return undefined
  return selected
})

const filteredUnreadCount = computed(() => {
  const hasActiveFilters = !!notificationScopeProductId.value
    || notificationQuickView.value !== 'all'
    || notificationTypeFilter.value !== 'all'
    || notificationCategoryFilter.value !== 'all'
    || notificationUrgencyFilter.value !== 'all'
    || notificationSeverityFilter.value !== 'all'
    || notificationEntityTypeFilter.value !== 'all'
    || notificationUnreadOnly.value
  return hasActiveFilters ? notificationsStore.filteredUnreadCount : notificationsStore.unreadCount
})

const availableNotificationTypeOptions = computed(() => {
  const options = notificationsStore.typeFacets
    .map((facet) => ({
      type: facet.type,
      label: facet.label,
      count: facet.count,
    }))
    .filter((facet) => facet.type.length > 0)
  if (notificationTypeFilter.value !== 'all' && !options.some((option) => option.type === notificationTypeFilter.value)) {
    options.push({
      type: notificationTypeFilter.value,
      label: notificationTypeFilter.value,
      count: 0,
    })
  }
  return options.sort((left, right) => left.label.localeCompare(right.label))
})

const availableNotificationEntityTypeOptions = computed(() => {
  const values = new Set(
    notificationsStore.items
      .map((item) => (item.entityType || '').trim())
      .filter((value) => value.length > 0)
  )
  if (notificationEntityTypeFilter.value !== 'all') {
    values.add(notificationEntityTypeFilter.value)
  }
  return Array.from(values).sort((left, right) => left.localeCompare(right))
})

const advancedNotificationFiltersCount = computed(() =>
  (notificationTypeFilter.value !== 'all' ? 1 : 0)
  + (notificationCategoryFilter.value !== 'all' ? 1 : 0)
  + (notificationUrgencyFilter.value !== 'all' ? 1 : 0)
  + (notificationSeverityFilter.value !== 'all' ? 1 : 0)
  + (notificationEntityTypeFilter.value !== 'all' ? 1 : 0)
)
const advancedFiltersToggleLabel = computed(() => {
  if (showAdvancedNotificationFilters.value) return 'Hide advanced filters'
  if (advancedNotificationFiltersCount.value <= 0) return 'Advanced filters'
  return `Advanced filters (${advancedNotificationFiltersCount.value})`
})

const hasActiveNotificationFilters = computed(() =>
  !!notificationScopeProductId.value
  || notificationQuickView.value !== 'all'
  || notificationTypeFilter.value !== 'all'
  || notificationCategoryFilter.value !== 'all'
  || notificationUrgencyFilter.value !== 'all'
  || notificationSeverityFilter.value !== 'all'
  || notificationEntityTypeFilter.value !== 'all'
  || notificationUnreadOnly.value
)

const markReadTargetCount = computed(() =>
  hasActiveNotificationFilters.value ? filteredUnreadCount.value : notificationsStore.unreadCount
)
const archiveTargetCount = computed(() => notificationsStore.items.length)
const markReadActionLabel = computed(() =>
  `${hasActiveNotificationFilters.value ? 'Mark filtered as read' : 'Mark all as read'} (${markReadTargetCount.value})`
)
const archiveActionLabel = computed(() =>
  `${hasActiveNotificationFilters.value ? 'Archive filtered' : 'Archive all'} (${archiveTargetCount.value})`
)

const notificationFilterChips = computed(() => {
  const chips: string[] = []
  if (notificationScopeProductId.value) {
    chips.push(`Product: ${resolveNotificationProductName(notificationScopeProductId.value)}`)
  }
  const quickView = notificationQuickView.value
  if (quickView !== 'all') {
    const option = notificationQuickViewOptions.find((entry) => entry.id === quickView)
    chips.push(`View: ${option?.label || quickView}`)
  }
  if (notificationTypeFilter.value !== 'all') {
    chips.push(`Type: ${notificationTypeFilter.value}`)
  }
  if (notificationCategoryFilter.value !== 'all') {
    chips.push(`Category: ${categoryLabel(notificationCategoryFilter.value)}`)
  }
  if (notificationUrgencyFilter.value !== 'all') {
    chips.push(`Urgency: ${urgencyLabel(notificationUrgencyFilter.value)}`)
  }
  if (notificationSeverityFilter.value !== 'all') {
    chips.push(`Severity: ${notificationSeverityFilter.value}`)
  }
  if (notificationEntityTypeFilter.value !== 'all') {
    chips.push(`Entity: ${notificationEntityTypeFilter.value}`)
  }
  if (notificationUnreadOnly.value) {
    chips.push('Unread only')
  }
  return chips
})

const groupedNotifications = computed(() => {
  const actionRequired: NotificationItem[] = []
  const today: NotificationItem[] = []
  const earlier: NotificationItem[] = []
  const now = new Date()

  for (const notification of notificationsStore.items) {
    if (notification.urgency === 'action_required' || notification.severity === 'critical') {
      actionRequired.push(notification)
      continue
    }
    if (isSameLocalDay(notification.createdAt, now)) {
      today.push(notification)
      continue
    }
    earlier.push(notification)
  }

  return [
    { key: 'action_required', label: 'Action Required', items: actionRequired },
    { key: 'today', label: 'Today', items: today },
    { key: 'earlier', label: 'Earlier', items: earlier },
  ].filter((section) => section.items.length > 0)
})

function iconForSearchType(entityType: SearchEntityType) {
  switch (entityType) {
    case 'task':
      return ListChecks
    case 'initiative':
      return Target
    case 'delivery':
      return Package
    case 'team_member':
      return Users
    case 'wiki_asset':
      return BookOpen
    default:
      return Search
  }
}

function clearSearchDebounce() {
  if (searchDebounceHandle !== null) {
    window.clearTimeout(searchDebounceHandle)
    searchDebounceHandle = null
  }
}

function focusSearchInput() {
  globalSearchStore.setOpen(true)
  searchInputRef.value?.focus()
}

function closeSearchDropdown() {
  globalSearchStore.setOpen(false)
}

function onSearchInput() {
  globalSearchStore.setOpen(true)
}

function toggleSearchType(type: SearchEntityType) {
  globalSearchStore.toggleType(type)
  globalSearchStore.setOpen(true)
}

function onSearchContainerPointerDown(event: PointerEvent) {
  const container = searchContainerRef.value
  if (!container) return
  const target = event.target as Node | null
  if (target && container.contains(target)) return
  closeSearchDropdown()
}

function onSearchShortcut(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  if (!(event.metaKey || event.ctrlKey) || key !== 'k') return
  event.preventDefault()
  focusSearchInput()
}

async function openSearchResult(result?: GlobalSearchResult) {
  const active = result
    || globalSearchStore.results[globalSearchStore.activeIndex]
    || globalSearchStore.results[0]
  if (!active) return
  const routeTarget = active.routePath?.startsWith('/')
    ? active.routePath
    : buildGlobalSearchEntityRoute(active.entityType, active.id)
  closeSearchDropdown()
  await router.push(routeTarget)
}

function onSearchKeydown(event: KeyboardEvent) {
  if (!globalSearchStore.open) globalSearchStore.setOpen(true)
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    globalSearchStore.moveActive(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    globalSearchStore.moveActive(-1)
    return
  }
  if (event.key === 'Enter') {
    if (globalSearchStore.results.length === 0) return
    event.preventDefault()
    void openSearchResult()
    return
  }
  if (event.key === 'Home') {
    if (globalSearchStore.results.length === 0) return
    event.preventDefault()
    globalSearchStore.setActive(0)
    return
  }
  if (event.key === 'End') {
    if (globalSearchStore.results.length === 0) return
    event.preventDefault()
    globalSearchStore.setActive(globalSearchStore.results.length - 1)
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    closeSearchDropdown()
    return
  }
  if (event.key === 'Tab') {
    closeSearchDropdown()
  }
}

function buildNotificationQueryFilters() {
  let quickViewCategory: NotificationCategory | undefined
  let quickViewUrgency: NotificationUrgency | undefined
  let quickViewType: string | undefined
  let quickViewEntityType: string | undefined

  if (notificationQuickView.value === 'needs_action') {
    quickViewUrgency = 'action_required'
  } else if (notificationQuickView.value === 'assigned_to_me') {
    quickViewCategory = 'assignment'
  } else if (notificationQuickView.value === 'needs_review') {
    quickViewCategory = 'workflow'
    quickViewUrgency = 'action_required'
  } else if (notificationQuickView.value === 'at_risk') {
    quickViewCategory = 'risk'
  } else if (notificationQuickView.value === 'releases') {
    quickViewCategory = 'release'
  } else if (notificationQuickView.value === 'unassigned') {
    quickViewType = 'task.updated.reminder_unassigned_work'
    quickViewEntityType = 'task'
    quickViewUrgency = 'action_required'
  }

  const finalCategory = notificationCategoryFilter.value === 'all'
    ? quickViewCategory
    : notificationCategoryFilter.value
  const finalUrgency = notificationUrgencyFilter.value === 'all'
    ? quickViewUrgency
    : notificationUrgencyFilter.value
  const finalType = notificationTypeFilter.value === 'all'
    ? quickViewType
    : notificationTypeFilter.value
  const finalEntityType = notificationEntityTypeFilter.value === 'all'
    ? quickViewEntityType
    : notificationEntityTypeFilter.value

  return {
    productId: notificationScopeProductId.value,
    category: finalCategory,
    urgency: finalUrgency,
    severity: notificationSeverityFilter.value === 'all' ? undefined : notificationSeverityFilter.value,
    entityType: finalEntityType,
    type: finalType,
    unreadOnly: notificationUnreadOnly.value || undefined,
  }
}

function clearNotificationFilters() {
  notificationProductFilterValue.value = ALL_PRODUCTS_FILTER_VALUE
  notificationQuickView.value = 'all'
  notificationTypeFilter.value = 'all'
  notificationCategoryFilter.value = 'all'
  notificationUrgencyFilter.value = 'all'
  notificationSeverityFilter.value = 'all'
  notificationEntityTypeFilter.value = 'all'
  notificationUnreadOnly.value = false
  showAdvancedNotificationFilters.value = false
}

async function refreshNotifications() {
  const filters = buildNotificationQueryFilters()
  await Promise.all([
    notificationsStore.fetchInbox({ reset: true, limit: 20, ...filters }),
    notificationsStore.fetchUnreadCount(filters.productId),
    notificationsStore.fetchFacets(filters),
  ])
}

let notificationsRefreshHandle: number | null = null

function clearNotificationsRefreshHandle() {
  if (notificationsRefreshHandle === null) return
  window.clearTimeout(notificationsRefreshHandle)
  notificationsRefreshHandle = null
}

function scheduleNotificationsRefresh(delayMs = 120) {
  clearNotificationsRefreshHandle()
  notificationsRefreshHandle = window.setTimeout(() => {
    notificationsRefreshHandle = null
    if (!notificationsOpen.value) return
    void refreshNotifications()
  }, delayMs)
}

async function onNotificationsOpenChange(next: boolean) {
  notificationsOpen.value = next
  if (next) {
    scheduleNotificationsRefresh(0)
  } else {
    clearNotificationsRefreshHandle()
  }
}

async function openNotification(notification: NotificationItem) {
  if (!notification.readAt) {
    await notificationsStore.markRead([notification.id])
  }
  notificationsOpen.value = false
  const targetRoute = notificationsStore.resolveNotificationRoute(notification)
  await router.push(targetRoute)
}

async function markAllAsRead() {
  const filters = buildNotificationQueryFilters()
  await notificationsStore.markAllRead({
    productId: filters.productId,
    category: filters.category,
    urgency: filters.urgency,
    severity: filters.severity,
    entityType: filters.entityType,
    type: filters.type,
  })
}

async function archiveFilteredNotifications() {
  const filters = buildNotificationQueryFilters()
  await notificationsStore.archiveAll({
    productId: filters.productId,
    category: filters.category,
    urgency: filters.urgency,
    severity: filters.severity,
    entityType: filters.entityType,
    type: filters.type,
  })
}

async function archiveOne(id: string) {
  await notificationsStore.archive([id])
}

async function loadMoreNotifications() {
  await notificationsStore.fetchMore(buildNotificationQueryFilters())
}

watch(
  () => [
    globalSearchStore.query,
    productStore.activeProduct.id,
    ...globalSearchStore.selectedTypes,
  ],
  () => {
    clearSearchDebounce()
    searchDebounceHandle = window.setTimeout(() => {
      void globalSearchStore.runSearch(productStore.activeProduct.id || '', authStore.token)
    }, 220)
  },
)

watch(
  () => [notificationProductFilterValue.value, notificationProductOptions.value.map((entry) => entry.id).join('|')] as const,
  () => {
    const current = notificationProductFilterValue.value.trim()
    if (!current || current === ALL_PRODUCTS_FILTER_VALUE) {
      notificationProductFilterValue.value = ALL_PRODUCTS_FILTER_VALUE
      return
    }
    const validProductIds = new Set(notificationProductOptions.value.map((entry) => entry.id))
    if (!validProductIds.has(current)) {
      notificationProductFilterValue.value = ALL_PRODUCTS_FILTER_VALUE
    }
  },
)

watch(
  () => [
    notificationsOpen.value,
    notificationProductFilterValue.value,
    notificationQuickView.value,
    notificationTypeFilter.value,
    notificationCategoryFilter.value,
    notificationUrgencyFilter.value,
    notificationSeverityFilter.value,
    notificationEntityTypeFilter.value,
    notificationUnreadOnly.value,
  ],
  ([isOpen]) => {
    if (!isOpen) return
    scheduleNotificationsRefresh()
  },
)

onMounted(async () => {
  isMacPlatform.value = window.navigator.platform.toLowerCase().includes('mac')
  if (!productStore.loaded && !productStore.loading && authStore.token) {
    try {
      await productStore.fetchProducts()
    } catch {
      // Keep notifications available even if product list is unavailable.
    }
  }
  if (authStore.token) {
    await notificationsStore.fetchUnreadCount()
  }

  unreadPollingHandle = window.setInterval(() => {
    if (!authStore.token) return
    notificationsStore.fetchUnreadCount()
  }, 30000)

  window.addEventListener('keydown', onSearchShortcut)
  window.addEventListener('pointerdown', onSearchContainerPointerDown)
})

onBeforeUnmount(() => {
  if (unreadPollingHandle !== null) {
    window.clearInterval(unreadPollingHandle)
    unreadPollingHandle = null
  }
  clearNotificationsRefreshHandle()
  clearSearchDebounce()
  globalSearchStore.cancelInFlight()
  window.removeEventListener('keydown', onSearchShortcut)
  window.removeEventListener('pointerdown', onSearchContainerPointerDown)
})

watch(
  () => authStore.token,
  (token) => {
    if (!token) {
      notificationsStore.reset()
      return
    }
    notificationsStore.fetchUnreadCount()
  },
)
</script>

<template>
  <header class="flex items-center h-[64px] px-4 bg-white border-b border-gray-100 shrink-0">
    <!-- Search bar -->
    <div class="flex items-center flex-1">
      <div ref="searchContainerRef" class="relative w-[460px]">
        <div
          class="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 shadow-sm transition-colors"
          :class="globalSearchStore.open
            ? 'border-[#7C5CFC]/40 ring-2 ring-[#7C5CFC]/10'
            : 'border-gray-200 hover:border-gray-300'"
        >
          <Search :size="16" class="text-gray-400 shrink-0" />
          <input
            ref="searchInputRef"
            v-model="globalSearchStore.query"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-label="Global search"
            :aria-expanded="globalSearchStore.open"
            :aria-controls="SEARCH_LISTBOX_ID"
            :aria-activedescendant="activeDescendantId"
            placeholder="Search tasks, initiatives, deliveries, team, or wiki"
            class="flex-1 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
            @focus="globalSearchStore.setOpen(true)"
            @input="onSearchInput"
            @keydown="onSearchKeydown"
          />
          <button
            class="ml-auto rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-500 hover:text-gray-700"
            title="Open search (Ctrl/Cmd + K)"
            @click="focusSearchInput"
          >
            {{ shortcutLabel }}
          </button>
        </div>

        <p class="sr-only" role="status" aria-live="polite">{{ searchLiveRegionMessage }}</p>

        <div
          v-if="globalSearchStore.open"
          :id="SEARCH_LISTBOX_ID"
          role="listbox"
          class="absolute left-0 right-0 top-[calc(100%+8px)] z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
        >
          <div class="px-3 py-2 border-b border-gray-100 flex items-center gap-2 flex-wrap">
            <button
              class="text-xs px-2.5 py-1 rounded-full border transition-colors"
              :aria-pressed="globalSearchStore.selectedTypes.length === 0"
              :class="globalSearchStore.selectedTypes.length === 0
                ? 'bg-[#7C5CFC]/10 border-[#7C5CFC]/30 text-[#6B4CE0]'
                : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'"
              @click="globalSearchStore.clearTypes()"
            >
              All
            </button>
            <button
              v-for="option in searchTypeOptions"
              :key="option.id"
              class="text-xs px-2.5 py-1 rounded-full border transition-colors"
              :aria-pressed="globalSearchStore.selectedTypes.includes(option.id)"
              :class="globalSearchStore.selectedTypes.includes(option.id)
                ? 'bg-[#7C5CFC]/10 border-[#7C5CFC]/30 text-[#6B4CE0]'
                : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'"
              @click="toggleSearchType(option.id)"
            >
              {{ option.label }}
            </button>
          </div>

          <div v-if="globalSearchStore.loading" class="px-4 py-8 text-sm text-gray-500 flex items-center justify-center gap-2">
            <Loader2 :size="14" class="animate-spin" />
            Searching your workspace...
          </div>

          <div v-else-if="globalSearchStore.error" class="px-4 py-6">
            <p class="text-sm font-medium text-gray-800">Search is unavailable right now.</p>
            <p class="mt-1 text-xs text-gray-500">{{ globalSearchStore.error }}</p>
          </div>

          <div v-else-if="!globalSearchStore.query.trim()" class="px-4 py-8 text-sm text-gray-500">
            Search across tasks, initiatives, deliveries, team, and wiki.
          </div>

          <div v-else-if="globalSearchStore.results.length === 0" class="px-4 py-8">
            <p class="text-sm font-medium text-gray-700">No matches found.</p>
            <p class="mt-1 text-xs text-gray-500">Try a different keyword or remove a filter.</p>
          </div>

          <div v-else class="max-h-[440px] overflow-y-auto py-2">
            <section
              v-for="group in groupedSearchResults"
              :key="group.id"
              class="pb-2 last:pb-0"
            >
              <p class="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {{ group.label }}
              </p>
              <button
                v-for="entry in group.items"
                :id="optionId(entry.index)"
                :key="`${entry.result.entityType}:${entry.result.id}`"
                role="option"
                type="button"
                :aria-selected="globalSearchStore.activeIndex === entry.index"
                class="w-full px-4 py-3 text-left border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors"
                :class="globalSearchStore.activeIndex === entry.index ? 'bg-gray-50' : ''"
                @mouseenter="globalSearchStore.setActive(entry.index)"
                @mousedown.prevent
                @click="openSearchResult(entry.result)"
              >
                <div class="flex items-start gap-3">
                  <div class="w-7 h-7 rounded-md bg-gray-100 text-gray-600 flex items-center justify-center mt-0.5">
                    <component :is="iconForSearchType(entry.result.entityType)" :size="14" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-gray-900 truncate">{{ entry.result.title }}</p>
                    <p v-if="entry.result.subtitle" class="text-xs text-gray-500 truncate mt-0.5">
                      {{ entry.result.subtitle }}
                    </p>
                    <p v-if="entry.result.descriptionSnippet" class="text-xs text-gray-400 truncate mt-0.5">
                      {{ entry.result.descriptionSnippet }}
                    </p>
                  </div>
                </div>
              </button>
            </section>

            <button
              v-if="globalSearchStore.hasMore"
              class="w-full px-4 py-2 text-xs text-gray-500 hover:text-gray-700 bg-gray-50 border-t border-gray-100"
              :disabled="globalSearchStore.loading"
              @click="globalSearchStore.loadMore(productStore.activeProduct.id, authStore.token)"
            >
              Load more results
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right side actions -->
    <div class="flex items-center gap-2">
      <!-- Settings -->
      <button
        class="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        @click="goToRoleSettingsIfAllowed"
      >
        <Settings :size="18" />
      </button>

      <!-- Dark mode toggle -->
      <button class="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
        <Moon :size="18" />
      </button>

      <!-- Divider -->
      <div class="w-px h-6 bg-gray-200 mx-1"></div>

      <!-- Help -->
      <button class="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
        <HelpCircle :size="18" />
      </button>

      <!-- Notifications -->
      <Popover v-model:open="notificationsOpen" @update:open="onNotificationsOpenChange">
        <PopoverTrigger as-child>
          <button class="relative flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
            <Bell :size="18" />
            <span
              v-if="notificationsStore.unreadCount > 0"
              class="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center font-semibold"
            >
              {{ unreadBadgeText }}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" :side-offset="8" class="w-[430px] p-0">
          <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 class="text-sm font-semibold text-gray-900">Notifications</h3>
              <p class="text-xs text-gray-500 mt-0.5">
                <span v-if="hasActiveNotificationFilters">
                  {{ filteredUnreadCount }} unread in current view
                </span>
                <span v-else>
                  {{ notificationsStore.unreadCount }} unread
                </span>
              </p>
            </div>
            <div class="flex items-center gap-2">
              <button
                class="text-xs text-[#7C5CFC] hover:text-[#6B4CE0] font-medium disabled:opacity-50"
                :disabled="markReadTargetCount === 0"
                @click="markAllAsRead"
              >
                <span class="inline-flex items-center gap-1">
                  <CheckCheck :size="13" />
                  {{ markReadActionLabel }}
                </span>
              </button>
              <button
                class="text-xs text-gray-500 hover:text-gray-700 font-medium disabled:opacity-50"
                :disabled="archiveTargetCount === 0"
                @click="archiveFilteredNotifications"
              >
                <span class="inline-flex items-center gap-1">
                  <Archive :size="13" />
                  {{ archiveActionLabel }}
                </span>
              </button>
              <button
                class="text-xs text-gray-500 hover:text-gray-700 font-medium"
                @click="goToNotificationSettings"
              >
                Settings
              </button>
            </div>
          </div>

          <div class="px-4 py-3 border-b border-gray-100 bg-gray-50/60 space-y-2.5">
            <div class="flex items-start justify-between gap-2">
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="option in notificationQuickViewOptions"
                  :key="option.id"
                  type="button"
                  class="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
                  :class="notificationQuickView === option.id
                    ? 'border-[#7C5CFC]/40 bg-[#7C5CFC]/10 text-[#5F43D7]'
                    : 'border-gray-200 bg-white text-gray-600 hover:text-gray-800'"
                  @click="notificationQuickView = option.id"
                >
                  {{ option.label }}
                </button>
              </div>
              <button
                type="button"
                class="text-[11px] text-gray-500 hover:text-gray-700 whitespace-nowrap"
                @click="showAdvancedNotificationFilters = !showAdvancedNotificationFilters"
              >
                {{ advancedFiltersToggleLabel }}
              </button>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <select
                v-model="notificationProductFilterValue"
                class="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700"
              >
                <option value="all_products">All products</option>
                <option
                  v-for="product in notificationProductOptions"
                  :key="product.id"
                  :value="product.id"
                >
                  {{ product.name }}
                </option>
              </select>
              <label class="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 inline-flex items-center gap-1.5">
                <input v-model="notificationUnreadOnly" type="checkbox" />
                Unread only
              </label>
            </div>

            <div v-if="showAdvancedNotificationFilters" class="grid grid-cols-2 gap-2">
              <select
                v-model="notificationTypeFilter"
                class="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700"
              >
                <option value="all">All types</option>
                <option
                  v-for="typeOption in availableNotificationTypeOptions"
                  :key="typeOption.type"
                  :value="typeOption.type"
                >
                  {{ typeOption.label }} ({{ typeOption.count }})
                </option>
              </select>
              <select
                v-model="notificationCategoryFilter"
                class="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700"
              >
                <option value="all">All categories</option>
                <option value="assignment">Assignment</option>
                <option value="workflow">Workflow</option>
                <option value="risk">Risk</option>
                <option value="quality">Quality</option>
                <option value="release">Release</option>
                <option value="admin">Admin</option>
                <option value="integration">Integration</option>
                <option value="digest">Digest</option>
              </select>
              <select
                v-model="notificationUrgencyFilter"
                class="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700"
              >
                <option value="all">All urgencies</option>
                <option value="action_required">Action required</option>
                <option value="watch">Watch</option>
                <option value="informational">Informational</option>
              </select>
              <select
                v-model="notificationSeverityFilter"
                class="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700"
              >
                <option value="all">All severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="info">Info</option>
              </select>
              <select
                v-model="notificationEntityTypeFilter"
                class="col-span-2 h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700"
              >
                <option value="all">All entities</option>
                <option
                  v-for="entityTypeOption in availableNotificationEntityTypeOptions"
                  :key="entityTypeOption"
                  :value="entityTypeOption"
                >
                  {{ entityTypeOption }}
                </option>
              </select>
            </div>

            <div v-if="notificationFilterChips.length > 0" class="flex items-center justify-between gap-2">
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="chip in notificationFilterChips"
                  :key="chip"
                  class="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-[10px] text-gray-600"
                >
                  {{ chip }}
                </span>
              </div>
              <button class="text-[11px] text-gray-500 hover:text-gray-700" @click="clearNotificationFilters">
                Clear
              </button>
            </div>
          </div>

          <div
            v-if="notificationsStore.loadingInbox"
            class="px-4 py-10 text-sm text-gray-500 text-center"
          >
            Loading notifications...
          </div>

          <div
            v-else-if="notificationsStore.items.length === 0"
            class="px-6 py-10 text-center"
          >
            <BellOff :size="18" class="mx-auto text-gray-300 mb-2" />
            <template v-if="hasActiveNotificationFilters">
              <p class="text-sm text-gray-500">No notifications match this filter view.</p>
              <p class="text-xs text-gray-400 mt-1">
                Try clearing filters or selecting a different intent.
              </p>
            </template>
            <template v-else>
              <p class="text-sm text-gray-500">No notifications yet.</p>
              <p class="text-xs text-gray-400 mt-1">
                Assignments, review requests, and risk alerts will appear here.
              </p>
            </template>
          </div>

          <div v-else class="max-h-[420px] overflow-y-auto">
            <div
              v-for="section in groupedNotifications"
              :key="section.key"
              class="border-b border-gray-100 last:border-b-0"
            >
              <div class="px-4 py-2 bg-gray-50/80 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {{ section.label }}
              </div>
              <div
                v-for="notification in section.items"
                :key="notification.id"
                class="group px-4 py-3 border-b border-gray-50 hover:bg-gray-50/80 transition-colors border-l-2"
                :class="emphasisBorderClass(notification)"
              >
                <div class="flex items-start gap-3">
                  <span
                    class="mt-1.5 w-2 h-2 rounded-full shrink-0"
                    :class="notification.readAt ? 'bg-gray-200' : 'bg-[#7C5CFC]'"
                  />
                  <div
                    class="flex-1 min-w-0 cursor-pointer"
                    @click="openNotification(notification)"
                  >
                    <p
                      class="text-sm leading-5 pr-2"
                      :class="notification.readAt ? 'text-gray-600' : 'text-gray-900 font-medium'"
                    >
                      {{ notification.message }}
                    </p>
                    <div class="mt-1 flex items-center gap-2 text-[11px] text-gray-400 flex-wrap">
                      <span>{{ categoryLabel(notification.category) }}</span>
                      <span class="rounded px-1.5 py-0.5 font-medium" :class="severityClass(notification.severity)">
                        {{ notification.severity }}
                      </span>
                      <span class="rounded px-1.5 py-0.5 font-medium" :class="urgencyClass(notification.urgency)">
                        {{ urgencyLabel(notification.urgency) }}
                      </span>
                      <span>{{ formatRelativeTime(notification.createdAt) }}</span>
                    </div>
                  </div>
                  <button
                    class="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 p-1"
                    title="Archive notification"
                    @click.stop="archiveOne(notification.id)"
                  >
                    <Archive :size="14" />
                  </button>
                </div>
              </div>
            </div>

            <div class="px-4 py-3 flex items-center justify-between bg-gray-50/70">
              <button
                class="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40"
                :disabled="!notificationsStore.hasMore"
                @click="loadMoreNotifications"
              >
                Load more
              </button>
              <button
                class="text-xs text-gray-500 hover:text-gray-700"
                @click="goToNotificationSettings"
              >
                Manage preferences
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <!-- Divider -->
      <div class="w-px h-6 bg-gray-200 mx-1"></div>

      <!-- User profile dropdown -->
      <Popover>
        <PopoverTrigger as-child>
          <button class="flex items-center gap-2 pl-1 rounded-lg hover:bg-gray-50 px-2 py-1.5 transition-colors">
            <div class="w-8 h-8 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-xs font-medium overflow-hidden shrink-0">
              <img
                v-if="authStore.user?.avatar"
                :src="authStore.user.avatar"
                class="w-8 h-8 rounded-full object-cover"
                alt="User avatar"
              />
              <span v-else>{{ userInitials }}</span>
            </div>
            <div class="flex flex-col text-left">
              <span class="text-sm font-medium text-gray-800 leading-tight">{{ authStore.user?.name || 'User' }}</span>
              <span class="text-[11px] text-gray-400 leading-tight">{{ authStore.user?.email || '' }}</span>
            </div>
            <ChevronDown :size="14" class="text-gray-400 ml-1" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" :side-offset="8" class="w-[220px] p-1.5">
          <!-- User info header -->
          <div class="flex items-center gap-2.5 px-2 py-2 mb-1">
            <div class="w-9 h-9 rounded-full bg-[#7C5CFC] flex items-center justify-center text-white text-xs font-medium overflow-hidden shrink-0">
              <img
                v-if="authStore.user?.avatar"
                :src="authStore.user.avatar"
                class="w-9 h-9 rounded-full object-cover"
                alt="User avatar"
              />
              <span v-else>{{ userInitials }}</span>
            </div>
            <div class="flex flex-col min-w-0">
              <span class="text-sm font-semibold text-gray-900 leading-tight truncate">{{ authStore.user?.name }}</span>
              <span class="text-[11px] text-gray-400 leading-tight truncate">{{ authStore.user?.email }}</span>
            </div>
          </div>

          <div class="border-t border-gray-100 my-1"></div>

          <!-- Settings -->
          <button
            class="flex items-center gap-2.5 w-full px-2 py-2 text-sm text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
            @click="goToSettingsRoot"
          >
            <Settings :size="15" class="text-gray-400" />
            Settings
          </button>

          <!-- Logout -->
          <button
            class="flex items-center gap-2.5 w-full px-2 py-2 text-sm text-red-600 rounded-md hover:bg-red-50 transition-colors"
            @click="handleLogout"
          >
            <LogOut :size="15" class="text-red-400" />
            Log out
          </button>
        </PopoverContent>
      </Popover>
    </div>
  </header>
</template>
