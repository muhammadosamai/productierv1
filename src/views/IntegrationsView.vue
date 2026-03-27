<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search, Link2, ExternalLink, Check, Star, ArrowRight, Filter } from 'lucide-vue-next'

interface Integration {
  id: string
  name: string
  description: string
  category: string
  logo: string
  bgColor: string
  installed: boolean
  featured: boolean
  popular: boolean
  rating: number
  installs: string
}

const searchQuery = ref('')
const activeCategory = ref('all')

const categories = [
  { key: 'all', label: 'All' },
  { key: 'communication', label: 'Communication' },
  { key: 'project_management', label: 'Project Management' },
  { key: 'development', label: 'Development' },
  { key: 'ci_cd', label: 'CI / CD' },
  { key: 'design', label: 'Design' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'cloud', label: 'Cloud & Infrastructure' },
  { key: 'productivity', label: 'Productivity' },
  { key: 'crm', label: 'CRM & Sales' },
  { key: 'security', label: 'Security' },
]

const integrations: Integration[] = [
  // Communication
  {
    id: 'slack',
    name: 'Slack',
    description: 'Get real-time notifications, create tasks from messages, and sync delivery updates directly in your Slack channels.',
    category: 'communication',
    logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/slack.svg',
    bgColor: '#4A154B',
    installed: true,
    featured: true,
    popular: true,
    rating: 4.8,
    installs: '12.4k',
  },
  {
    id: 'mattermost',
    name: 'Mattermost',
    description: 'Self-hosted messaging integration with task notifications, slash commands, and webhook support for your team.',
    category: 'communication',
    logo: 'https://cdn.simpleicons.org/mattermost/0058CC',
    bgColor: '#0058CC',
    installed: false,
    featured: false,
    popular: false,
    rating: 4.5,
    installs: '2.1k',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Receive instant alerts, manage tasks via bot commands, and get delivery status updates on your Telegram groups.',
    category: 'communication',
    logo: 'https://cdn.simpleicons.org/telegram/26A5E4',
    bgColor: '#229ED9',
    installed: false,
    featured: false,
    popular: true,
    rating: 4.3,
    installs: '5.8k',
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Bridge your product workspace with Discord servers. Get notifications and manage tasks from Discord channels.',
    category: 'communication',
    logo: 'https://cdn.simpleicons.org/discord/5865F2',
    bgColor: '#5865F2',
    installed: false,
    featured: false,
    popular: true,
    rating: 4.4,
    installs: '3.2k',
  },
  {
    id: 'microsoft-teams',
    name: 'Microsoft Teams',
    description: 'Integrate with Teams for notifications, task management, and seamless collaboration within your Microsoft 365 workspace.',
    category: 'communication',
    logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/microsoftteams.svg',
    bgColor: '#6264A7',
    installed: false,
    featured: true,
    popular: true,
    rating: 4.6,
    installs: '8.7k',
  },
  // Project Management
  {
    id: 'jira',
    name: 'Jira',
    description: 'Two-way sync between Productier and Jira. Import issues, sync statuses, and keep both tools in harmony.',
    category: 'project_management',
    logo: 'https://cdn.simpleicons.org/jira/0052CC',
    bgColor: '#0052CC',
    installed: true,
    featured: true,
    popular: true,
    rating: 4.7,
    installs: '15.2k',
  },
  {
    id: 'airtable',
    name: 'Airtable',
    description: 'Sync your Airtable bases with Productier. Import records as stories, tasks, or initiatives and keep data flowing.',
    category: 'project_management',
    logo: 'https://cdn.simpleicons.org/airtable/18BFFF',
    bgColor: '#18BFFF',
    installed: false,
    featured: true,
    popular: true,
    rating: 4.5,
    installs: '6.3k',
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Import Linear issues and projects. Bi-directional sync keeps your engineering and product teams aligned.',
    category: 'project_management',
    logo: 'https://cdn.simpleicons.org/linear/5E6AD2',
    bgColor: '#5E6AD2',
    installed: false,
    featured: false,
    popular: true,
    rating: 4.8,
    installs: '4.5k',
  },
  {
    id: 'asana',
    name: 'Asana',
    description: 'Connect Asana projects and tasks. Sync assignments, due dates, and statuses across both platforms.',
    category: 'project_management',
    logo: 'https://cdn.simpleicons.org/asana/F06A6A',
    bgColor: '#F06A6A',
    installed: false,
    featured: false,
    popular: false,
    rating: 4.4,
    installs: '3.8k',
  },
  {
    id: 'trello',
    name: 'Trello',
    description: 'Import Trello boards and cards into Productier. Map lists to statuses and keep your workflow moving.',
    category: 'project_management',
    logo: 'https://cdn.simpleicons.org/trello/0052CC',
    bgColor: '#0079BF',
    installed: false,
    featured: false,
    popular: false,
    rating: 4.2,
    installs: '2.9k',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Sync Notion databases with stories and initiatives. Embed Productier views inside your Notion workspace.',
    category: 'project_management',
    logo: 'https://cdn.simpleicons.org/notion/000000',
    bgColor: '#000000',
    installed: false,
    featured: true,
    popular: true,
    rating: 4.6,
    installs: '7.1k',
  },
  // Development
  {
    id: 'github',
    name: 'GitHub',
    description: 'Link pull requests to tasks, auto-update statuses on merge, and track commits across your repositories.',
    category: 'development',
    logo: 'https://cdn.simpleicons.org/github/181717',
    bgColor: '#24292E',
    installed: true,
    featured: true,
    popular: true,
    rating: 4.9,
    installs: '18.6k',
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'Connect GitLab merge requests and issues. Auto-transition tasks when pipelines pass or MRs get merged.',
    category: 'development',
    logo: 'https://cdn.simpleicons.org/gitlab/FC6D26',
    bgColor: '#FC6D26',
    installed: false,
    featured: false,
    popular: true,
    rating: 4.6,
    installs: '5.4k',
  },
  {
    id: 'bitbucket',
    name: 'Bitbucket',
    description: 'Integrate Bitbucket repos with task tracking. Link PRs, track branches, and auto-update on merges.',
    category: 'development',
    logo: 'https://cdn.simpleicons.org/bitbucket/0052CC',
    bgColor: '#0052CC',
    installed: false,
    featured: false,
    popular: false,
    rating: 4.3,
    installs: '2.7k',
  },
  {
    id: 'vscode',
    name: 'VS Code',
    description: 'View and manage tasks directly inside VS Code. Create branches, update statuses, and track time from your editor.',
    category: 'development',
    logo: 'https://cdn.simpleicons.org/visualstudiocode/007ACC',
    bgColor: '#007ACC',
    installed: false,
    featured: false,
    popular: true,
    rating: 4.7,
    installs: '4.2k',
  },
  // CI/CD
  {
    id: 'jenkins',
    name: 'Jenkins',
    description: 'Trigger builds from releases, track deployment status, and get pipeline notifications in your dashboard.',
    category: 'ci_cd',
    logo: 'https://cdn.simpleicons.org/jenkins/D24939',
    bgColor: '#D24939',
    installed: false,
    featured: false,
    popular: true,
    rating: 4.3,
    installs: '3.6k',
  },
  {
    id: 'github-actions',
    name: 'GitHub Actions',
    description: 'Auto-deploy releases via GitHub Actions workflows. Track runs, get failure alerts, and manage environments.',
    category: 'ci_cd',
    logo: 'https://cdn.simpleicons.org/githubactions/2088FF',
    bgColor: '#2088FF',
    installed: true,
    featured: false,
    popular: true,
    rating: 4.8,
    installs: '9.1k',
  },
  {
    id: 'docker',
    name: 'Docker',
    description: 'Track container deployments, manage image versions, and integrate Docker builds into your release pipeline.',
    category: 'ci_cd',
    logo: 'https://cdn.simpleicons.org/docker/2496ED',
    bgColor: '#2496ED',
    installed: false,
    featured: false,
    popular: true,
    rating: 4.5,
    installs: '4.8k',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Auto-deploy preview environments per delivery and sync deployment statuses with your release pipeline.',
    category: 'ci_cd',
    logo: 'https://cdn.simpleicons.org/vercel/000000',
    bgColor: '#000000',
    installed: false,
    featured: false,
    popular: false,
    rating: 4.6,
    installs: '3.1k',
  },
  // Design
  {
    id: 'figma',
    name: 'Figma',
    description: 'Embed Figma designs in stories and tasks. Get notified when designs are updated and track design progress.',
    category: 'design',
    logo: 'https://cdn.simpleicons.org/figma/F24E1E',
    bgColor: '#F24E1E',
    installed: false,
    featured: true,
    popular: true,
    rating: 4.7,
    installs: '7.8k',
  },
  // Analytics
  {
    id: 'datadog',
    name: 'Datadog',
    description: 'Monitor deployment health, track error rates post-release, and link incidents to releases automatically.',
    category: 'analytics',
    logo: 'https://cdn.simpleicons.org/datadog/632CA6',
    bgColor: '#632CA6',
    installed: false,
    featured: false,
    popular: false,
    rating: 4.4,
    installs: '2.3k',
  },
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Link Sentry errors to tasks automatically. Track error counts per release and get alerts on new regressions.',
    category: 'analytics',
    logo: 'https://cdn.simpleicons.org/sentry/362D59',
    bgColor: '#362D59',
    installed: false,
    featured: false,
    popular: true,
    rating: 4.6,
    installs: '5.2k',
  },
  // Cloud
  {
    id: 'aws',
    name: 'Amazon Web Services',
    description: 'Manage AWS deployments from releases. Auto-discover EC2 instances, ECS services, and Lambda functions.',
    category: 'cloud',
    logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/amazonwebservices.svg',
    bgColor: '#FF9900',
    installed: true,
    featured: true,
    popular: true,
    rating: 4.7,
    installs: '10.3k',
  },
  {
    id: 'gcp',
    name: 'Google Cloud',
    description: 'Deploy to GCP from your release pipeline. Integrate with Cloud Run, GKE, and App Engine environments.',
    category: 'cloud',
    logo: 'https://cdn.simpleicons.org/googlecloud/4285F4',
    bgColor: '#4285F4',
    installed: false,
    featured: false,
    popular: false,
    rating: 4.5,
    installs: '3.4k',
  },
  {
    id: 'azure',
    name: 'Microsoft Azure',
    description: 'Connect Azure DevOps pipelines and deploy to Azure services directly from your release management.',
    category: 'cloud',
    logo: 'https://cdn.simpleicons.org/microsoftazure/0078D4',
    bgColor: '#0078D4',
    installed: false,
    featured: false,
    popular: false,
    rating: 4.4,
    installs: '2.8k',
  },
  // Productivity
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Sync delivery deadlines, release dates, and milestones to Google Calendar. Never miss a deadline again.',
    category: 'productivity',
    logo: 'https://cdn.simpleicons.org/googlecalendar/4285F4',
    bgColor: '#4285F4',
    installed: false,
    featured: false,
    popular: true,
    rating: 4.5,
    installs: '6.1k',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Attach Drive files to stories, tasks, and initiatives. Preview documents inline without leaving Productier.',
    category: 'productivity',
    logo: 'https://cdn.simpleicons.org/googledrive/4285F4',
    bgColor: '#0F9D58',
    installed: false,
    featured: false,
    popular: false,
    rating: 4.3,
    installs: '3.5k',
  },
  {
    id: 'confluence',
    name: 'Confluence',
    description: 'Link Confluence pages to stories and initiatives. Embed wiki content and keep documentation in sync.',
    category: 'productivity',
    logo: 'https://cdn.simpleicons.org/confluence/172B4D',
    bgColor: '#172B4D',
    installed: false,
    featured: false,
    popular: false,
    rating: 4.2,
    installs: '2.4k',
  },
  // CRM
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Connect customer feedback to product decisions. Sync HubSpot tickets as stories and track feature requests.',
    category: 'crm',
    logo: 'https://cdn.simpleicons.org/hubspot/FF7A59',
    bgColor: '#FF7A59',
    installed: false,
    featured: false,
    popular: false,
    rating: 4.3,
    installs: '1.8k',
  },
  {
    id: 'intercom',
    name: 'Intercom',
    description: 'Turn customer conversations into product feedback. Auto-create stories from Intercom tickets and feature requests.',
    category: 'crm',
    logo: 'https://cdn.simpleicons.org/intercom/6AFDEF',
    bgColor: '#1F8DED',
    installed: false,
    featured: false,
    popular: true,
    rating: 4.5,
    installs: '3.9k',
  },
  // Security
  {
    id: 'okta',
    name: 'Okta',
    description: 'Enterprise SSO with Okta. Manage user provisioning, role sync, and secure authentication for your team.',
    category: 'security',
    logo: 'https://cdn.simpleicons.org/okta/007DC1',
    bgColor: '#007DC1',
    installed: false,
    featured: false,
    popular: false,
    rating: 4.4,
    installs: '2.1k',
  },
  {
    id: 'snyk',
    name: 'Snyk',
    description: 'Scan for vulnerabilities in your codebase. Auto-create tasks for security issues found in your dependencies.',
    category: 'security',
    logo: 'https://cdn.simpleicons.org/snyk/4C4A73',
    bgColor: '#4C4A73',
    installed: false,
    featured: false,
    popular: false,
    rating: 4.3,
    installs: '1.6k',
  },
]

const filteredIntegrations = computed(() => {
  let items = integrations
  if (activeCategory.value !== 'all') {
    items = items.filter(i => i.category === activeCategory.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    items = items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q)
    )
  }
  return items
})

const featuredIntegrations = computed(() => integrations.filter(i => i.featured))
const installedIntegrations = computed(() => integrations.filter(i => i.installed))
const popularIntegrations = computed(() => integrations.filter(i => i.popular && !i.installed))

const installedCount = computed(() => integrations.filter(i => i.installed).length)

function categoryLabel(cat: string) {
  return categories.find(c => c.key === cat)?.label || cat
}

function renderStars(rating: number) {
  return '★'.repeat(Math.floor(rating)) + (rating % 1 >= 0.5 ? '½' : '')
}
</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <!-- Page Header -->
    <div class="bg-white px-8 py-5 border-b border-gray-100">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
            <Link2 :size="18" class="text-[#4857FE]" />
          </div>
          <div>
            <h1 class="text-xl font-semibold text-gray-900">Integrations</h1>
            <p class="text-sm text-gray-400 mt-0.5">Connect your favorite tools and services</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs font-medium text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full">
            {{ installedCount }} installed
          </span>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-[1400px] mx-auto px-8 py-6 space-y-8">

        <!-- Search & Filters Bar -->
        <div class="flex items-center gap-4">
          <div class="relative flex-1 max-w-md">
            <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search integrations..."
              class="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE] transition-all"
            />
          </div>
          <!-- Category Pills -->
          <div class="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
            <button
              v-for="cat in categories"
              :key="cat.key"
              class="px-3.5 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-all"
              :class="activeCategory === cat.key
                ? 'bg-[#4857FE] text-white shadow-sm'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-gray-700'"
              @click="activeCategory = cat.key"
            >
              {{ cat.label }}
            </button>
          </div>
        </div>

        <!-- When filtering by category or search -->
        <template v-if="activeCategory !== 'all' || searchQuery.trim()">
          <div>
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-sm font-semibold text-gray-700">
                {{ searchQuery.trim() ? 'Search Results' : categoryLabel(activeCategory) }}
                <span class="text-gray-400 font-normal ml-1">{{ filteredIntegrations.length }}</span>
              </h2>
            </div>
            <div v-if="filteredIntegrations.length === 0" class="text-center py-16">
              <div class="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                <Search :size="22" class="text-gray-300" />
              </div>
              <p class="text-sm text-gray-400">No integrations found</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div
                v-for="item in filteredIntegrations"
                :key="item.id"
                class="group bg-white rounded-xl border border-gray-100 p-5 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer"
              >
                <div class="flex items-start gap-4">
                  <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" :style="{ backgroundColor: item.bgColor + '12' }">
                    <img :src="item.logo" :alt="item.name" class="w-8 h-8 rounded-lg object-contain" @error="($event.target as HTMLImageElement).style.display='none'" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <h3 class="text-sm font-semibold text-gray-800">{{ item.name }}</h3>
                      <span v-if="item.installed" class="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                        <Check :size="10" />
                        Installed
                      </span>
                    </div>
                    <p class="text-xs text-gray-400 mt-1 line-clamp-2">{{ item.description }}</p>
                    <div class="flex items-center gap-3 mt-3">
                      <span class="text-[10px] text-amber-500 font-medium">{{ renderStars(item.rating) }}</span>
                      <span class="text-[10px] text-gray-400">{{ item.rating }}</span>
                      <span class="text-[10px] text-gray-300">|</span>
                      <span class="text-[10px] text-gray-400">{{ item.installs }} installs</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Default view: sections -->
        <template v-else>

          <!-- Installed Section -->
          <div v-if="installedIntegrations.length > 0">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-sm font-semibold text-gray-700">Installed</h2>
              <span class="text-xs text-gray-400">{{ installedIntegrations.length }} connected</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div
                v-for="item in installedIntegrations"
                :key="item.id"
                class="group bg-white rounded-xl border border-emerald-100 p-4 hover:shadow-sm transition-all cursor-pointer relative"
              >
                <div class="absolute top-3 right-3">
                  <span class="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                    <Check :size="10" />
                    Connected
                  </span>
                </div>
                <div class="flex items-center gap-3 mb-3">
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" :style="{ backgroundColor: item.bgColor + '12' }">
                    <img :src="item.logo" :alt="item.name" class="w-7 h-7 rounded-lg object-contain" @error="($event.target as HTMLImageElement).style.display='none'" />
                  </div>
                  <div>
                    <h3 class="text-sm font-semibold text-gray-800">{{ item.name }}</h3>
                    <span class="text-[10px] text-gray-400">{{ categoryLabel(item.category) }}</span>
                  </div>
                </div>
                <p class="text-xs text-gray-400 line-clamp-2">{{ item.description }}</p>
              </div>
            </div>
          </div>

          <!-- Featured Section -->
          <div>
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-sm font-semibold text-gray-700">Featured</h2>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div
                v-for="item in featuredIntegrations"
                :key="item.id"
                class="group bg-white rounded-xl border border-gray-100 p-5 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer"
              >
                <div class="flex items-start gap-4">
                  <div class="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" :style="{ backgroundColor: item.bgColor + '12' }">
                    <img :src="item.logo" :alt="item.name" class="w-9 h-9 rounded-lg object-contain" @error="($event.target as HTMLImageElement).style.display='none'" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <h3 class="text-sm font-semibold text-gray-800">{{ item.name }}</h3>
                      <span v-if="item.installed" class="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                        <Check :size="10" />
                        Installed
                      </span>
                    </div>
                    <span class="text-[10px] text-gray-400">{{ categoryLabel(item.category) }}</span>
                    <p class="text-xs text-gray-400 mt-1.5 line-clamp-2">{{ item.description }}</p>
                    <div class="flex items-center gap-3 mt-3">
                      <span class="text-[10px] text-amber-500 font-medium">{{ renderStars(item.rating) }}</span>
                      <span class="text-[10px] text-gray-400">{{ item.rating }}</span>
                      <span class="text-[10px] text-gray-300">|</span>
                      <span class="text-[10px] text-gray-400">{{ item.installs }} installs</span>
                    </div>
                  </div>
                </div>
                <div v-if="!item.installed" class="mt-4 pt-3 border-t border-gray-50">
                  <button class="text-xs font-medium text-[#4857FE] hover:text-[#3644d9] transition-colors flex items-center gap-1">
                    Install
                    <ArrowRight :size="12" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Popular Section -->
          <div>
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-sm font-semibold text-gray-700">Popular</h2>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <div
                v-for="item in popularIntegrations"
                :key="item.id"
                class="group bg-white rounded-xl border border-gray-100 p-4 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer"
              >
                <div class="flex items-center gap-3 mb-2.5">
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" :style="{ backgroundColor: item.bgColor + '12' }">
                    <img :src="item.logo" :alt="item.name" class="w-7 h-7 rounded-lg object-contain" @error="($event.target as HTMLImageElement).style.display='none'" />
                  </div>
                  <div>
                    <h3 class="text-sm font-semibold text-gray-800">{{ item.name }}</h3>
                    <span class="text-[10px] text-gray-400">{{ categoryLabel(item.category) }}</span>
                  </div>
                </div>
                <p class="text-xs text-gray-400 line-clamp-2 mb-3">{{ item.description }}</p>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] text-amber-500 font-medium">{{ renderStars(item.rating) }}</span>
                    <span class="text-[10px] text-gray-400">{{ item.installs }}</span>
                  </div>
                  <button class="text-[10px] font-semibold text-[#4857FE] hover:text-[#3644d9] transition-colors flex items-center gap-0.5">
                    Install <ArrowRight :size="10" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- All Integrations Section -->
          <div>
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-sm font-semibold text-gray-700">
                All Integrations
                <span class="text-gray-400 font-normal ml-1">{{ integrations.length }}</span>
              </h2>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              <div
                v-for="item in integrations"
                :key="item.id"
                class="group flex items-center gap-3 bg-white rounded-lg border border-gray-100 px-4 py-3 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer"
              >
                <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden" :style="{ backgroundColor: item.bgColor + '12' }">
                  <img :src="item.logo" :alt="item.name" class="w-6 h-6 rounded-md object-contain" @error="($event.target as HTMLImageElement).style.display='none'" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5">
                    <h3 class="text-xs font-semibold text-gray-700 truncate">{{ item.name }}</h3>
                    <Check v-if="item.installed" :size="12" class="text-emerald-500 flex-shrink-0" />
                  </div>
                  <span class="text-[10px] text-gray-400">{{ categoryLabel(item.category) }}</span>
                </div>
                <ExternalLink :size="14" class="text-gray-300 group-hover:text-gray-400 flex-shrink-0 transition-colors" />
              </div>
            </div>
          </div>

        </template>
      </div>
    </div>
  </div>
</template>
