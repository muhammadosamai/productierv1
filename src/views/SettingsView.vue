<script setup lang="ts">
import { computed, type FunctionalComponent, watch } from 'vue'
import { ArrowLeft, Bell, Building2, ChevronRight, Shield, Tag, User, Users } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePagePermissions } from '@/lib/pagePermissions'
import NotificationPreferencesSettings from '@/components/settings/NotificationPreferencesSettings.vue'
import OrganizationMembersSettings from '@/components/settings/OrganizationMembersSettings.vue'
import ProfileSettingsSection from '@/components/settings/ProfileSettingsSection.vue'
import RolesSettings from '@/components/settings/RolesSettings.vue'
import TitlesSettings from '@/components/settings/TitlesSettings.vue'

type SettingsSectionId =
  | 'profile'
  | 'notifications'
  | 'organization-members'
  | 'organization-roles'
  | 'organization-titles'

type SettingsGroup = 'personal' | 'organization'

interface SettingsSection {
  id: SettingsSectionId
  label: string
  description: string
  icon: FunctionalComponent
  group: SettingsGroup
  path: string
  visible: boolean
}

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
const settingsPermissions = usePagePermissions('settings')
const usersPermissions = usePagePermissions('users')

const canManageRoles = computed(() => authStore.user?.role === 'super_admin')
const canManageTitles = computed(() => authStore.user?.role === 'super_admin' || authStore.user?.role === 'admin')
const canManageMembers = computed(() => usersPermissions.canAccess.value)

function sectionFromLegacyQuery(): SettingsSectionId | null {
  const requested = route.query.tab
  if (requested === 'notifications') return 'notifications'
  if (requested === 'roles') return 'organization-roles'
  if (requested === 'titles') return 'organization-titles'
  if (requested === 'profile') return 'profile'
  return null
}

function sectionFromPath(path: string): SettingsSectionId {
  if (path.startsWith('/settings/organization/roles')) return 'organization-roles'
  if (path.startsWith('/settings/organization/titles')) return 'organization-titles'
  if (path.startsWith('/settings/organization/members')) return 'organization-members'
  if (path.startsWith('/settings/notifications')) return 'notifications'
  if (path.startsWith('/settings/profile')) return 'profile'
  return sectionFromLegacyQuery() || 'profile'
}

const allSections = computed<SettingsSection[]>(() => [
  {
    id: 'profile',
    label: 'Profile',
    description: 'Manage your profile details and avatar.',
    icon: User,
    group: 'personal',
    path: '/settings/profile',
    visible: settingsPermissions.canAccess.value,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Control personal notification delivery preferences.',
    icon: Bell,
    group: 'personal',
    path: '/settings/notifications',
    visible: settingsPermissions.canAccess.value,
  },
  {
    id: 'organization-members',
    label: 'Members',
    description: 'Manage users, roles, titles, and memberships.',
    icon: Users,
    group: 'organization',
    path: '/settings/organization/members',
    visible: canManageMembers.value,
  },
  {
    id: 'organization-roles',
    label: 'Roles',
    description: 'Configure role permission profiles.',
    icon: Shield,
    group: 'organization',
    path: '/settings/organization/roles',
    visible: canManageRoles.value,
  },
  {
    id: 'organization-titles',
    label: 'Titles',
    description: 'Manage title catalog and title permissions.',
    icon: Tag,
    group: 'organization',
    path: '/settings/organization/titles',
    visible: canManageTitles.value,
  },
])

const visibleSections = computed(() => allSections.value.filter((section) => section.visible))
const personalSections = computed(() => visibleSections.value.filter((section) => section.group === 'personal'))
const organizationSections = computed(() => visibleSections.value.filter((section) => section.group === 'organization'))

const fallbackSection = computed<SettingsSection | null>(() => {
  const profile = visibleSections.value.find((section) => section.id === 'profile')
  return profile || visibleSections.value[0] || null
})

const activeSection = computed<SettingsSectionId>(() => sectionFromPath(route.path))
const activeSectionConfig = computed<SettingsSection | null>(() => {
  const requested = visibleSections.value.find((section) => section.id === activeSection.value)
  return requested || fallbackSection.value
})

watch(
  [() => route.path, () => route.query.tab, visibleSections],
  async () => {
    if (!activeSectionConfig.value) return
    const needsPathRewrite = route.path !== activeSectionConfig.value.path
    const hasLegacyQuery = typeof route.query.tab === 'string'
    if (!needsPathRewrite && !hasLegacyQuery) return
    await router.replace({ path: activeSectionConfig.value.path })
  },
  { immediate: true },
)

async function openSection(path: string) {
  if (route.path === path && typeof route.query.tab !== 'string') return
  await router.push({ path })
}
</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <div class="bg-white px-6 md:px-8 py-5 border-b border-gray-100">
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <button
            class="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium mb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE] focus-visible:ring-offset-2 rounded"
            @click="router.back()"
          >
            <ArrowLeft :size="14" />
            Back
          </button>
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-[#4857FE]/10 flex items-center justify-center shrink-0">
              <Building2 :size="18" class="text-[#4857FE]" />
            </div>
            <div class="min-w-0">
              <h1 class="text-xl font-semibold text-gray-900">Settings</h1>
              <p class="text-sm text-gray-500 mt-0.5">
                Personal preferences and organization administration.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="flex-1 min-h-0 px-6 md:px-8 py-6">
      <div class="h-full grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-5">
        <aside class="bg-white border border-gray-200 rounded-xl p-3 overflow-auto">
          <div class="space-y-5">
            <section>
              <p class="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Personal Settings</p>
              <nav class="space-y-1">
                <button
                  v-for="section in personalSections"
                  :key="section.id"
                  class="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE] focus-visible:ring-offset-2"
                  :class="activeSectionConfig?.id === section.id
                    ? 'bg-[#4857FE]/10 text-[#4857FE]'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
                  :aria-current="activeSectionConfig?.id === section.id ? 'page' : undefined"
                  @click="openSection(section.path)"
                >
                  <component :is="section.icon" :size="16" class="mt-0.5 shrink-0" />
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-medium">{{ section.label }}</span>
                    <span class="block text-xs text-gray-500 mt-0.5 truncate">{{ section.description }}</span>
                  </span>
                  <ChevronRight :size="14" class="mt-0.5 shrink-0 opacity-60" />
                </button>
              </nav>
            </section>

            <section v-if="organizationSections.length > 0">
              <p class="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Organization Settings</p>
              <nav class="space-y-1">
                <button
                  v-for="section in organizationSections"
                  :key="section.id"
                  class="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE] focus-visible:ring-offset-2"
                  :class="activeSectionConfig?.id === section.id
                    ? 'bg-[#4857FE]/10 text-[#4857FE]'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
                  :aria-current="activeSectionConfig?.id === section.id ? 'page' : undefined"
                  @click="openSection(section.path)"
                >
                  <component :is="section.icon" :size="16" class="mt-0.5 shrink-0" />
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-medium">{{ section.label }}</span>
                    <span class="block text-xs text-gray-500 mt-0.5 truncate">{{ section.description }}</span>
                  </span>
                  <ChevronRight :size="14" class="mt-0.5 shrink-0 opacity-60" />
                </button>
              </nav>
            </section>
          </div>
        </aside>

        <section class="min-w-0 min-h-0 overflow-auto">
          <div
            v-if="!settingsPermissions.canAccess.value"
            class="bg-white rounded-xl border border-gray-200 p-6"
          >
            <h2 class="text-base font-semibold text-gray-900">Access Restricted</h2>
            <p class="text-sm text-gray-500 mt-1">You do not have access to the settings page.</p>
          </div>

          <template v-else>
            <ProfileSettingsSection v-if="activeSectionConfig?.id === 'profile'" />
            <NotificationPreferencesSettings v-else-if="activeSectionConfig?.id === 'notifications'" />
            <OrganizationMembersSettings v-else-if="activeSectionConfig?.id === 'organization-members'" />
            <RolesSettings v-else-if="activeSectionConfig?.id === 'organization-roles'" />
            <TitlesSettings v-else-if="activeSectionConfig?.id === 'organization-titles'" />
          </template>
        </section>
      </div>
    </div>
  </div>
</template>
