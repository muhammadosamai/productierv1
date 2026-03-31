<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Bell, CheckCircle2, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { NotificationPreference, NotificationSeverity } from '@/types/notification'
import { useNotificationsStore } from '@/stores/notifications'
import { useProductStore } from '@/stores/products'

const notificationsStore = useNotificationsStore()
const productStore = useProductStore()
const draftPreferences = ref<NotificationPreference[]>([])
const saved = ref(false)
const localError = ref<string | null>(null)
const applyingPreset = ref(false)
const loadingScopedPreferences = ref(false)
const preferenceScope = ref<'global' | 'product'>('global')
const selectedProductId = ref('')

const categoryLabels: Record<string, string> = {
  assignment: 'Assignments',
  workflow: 'Workflow',
  risk: 'Risk',
  quality: 'Quality',
  release: 'Release',
  admin: 'Admin',
  integration: 'Integrations',
  digest: 'Digest',
}

const severityOptions: Array<{ value: NotificationSeverity; label: string }> = [
  { value: 'info', label: 'Info' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

const personaLabels: Record<string, string> = {
  executive: 'Executive',
  manager: 'Manager',
  developer: 'Developer',
  quality: 'Quality',
  admin: 'Admin',
  viewer: 'Viewer',
}

const presetSourceLabels: Record<string, string> = {
  role_only: 'role-based',
  title_only: 'title-based',
  role_and_title: 'role + title based',
}

const hasChanges = computed(() => {
  return JSON.stringify(draftPreferences.value) !== JSON.stringify(notificationsStore.preferences)
})

const hasAnyProducts = computed(() => productStore.products.length > 0)
const productOptions = computed(() =>
  productStore.products
    .filter((product) => !!product.id)
    .map((product) => ({
      id: String(product.id),
      name: product.name,
    })),
)
const scopedProductId = computed<string | null>(() => {
  if (preferenceScope.value !== 'product') return null
  const fromSelection = selectedProductId.value.trim()
  return fromSelection.length > 0 ? fromSelection : null
})

const canEditPreferences = computed(() => preferenceScope.value === 'global' || !!scopedProductId.value)

const recommendedPreset = computed(() => notificationsStore.preferencePreset)
const hasRecommendedPreset = computed(() => !!recommendedPreset.value)

const isUsingRecommendedPreset = computed(() => {
  if (!recommendedPreset.value) return false
  return JSON.stringify(clonePreferences(draftPreferences.value)) === JSON.stringify(clonePreferences(recommendedPreset.value.defaults))
})

const reminderPreferenceDraft = computed(() => draftPreferences.value[0] || null)

function clonePreferences(preferences: NotificationPreference[]): NotificationPreference[] {
  return preferences.map((preference) => ({
    productId: preference.productId ?? null,
    category: preference.category,
    inAppEnabled: preference.inAppEnabled,
    emailEnabled: preference.emailEnabled,
    slackEnabled: Boolean(preference.slackEnabled),
    quietHoursStart: preference.quietHoursStart,
    quietHoursEnd: preference.quietHoursEnd,
    minimumSeverity: preference.minimumSeverity,
    reminderCadence: preference.reminderCadence,
    reminderCooldownMinutes: preference.reminderCooldownMinutes,
    reminderDueSoonHours: preference.reminderDueSoonHours,
    reminderOverdueEnabled: preference.reminderOverdueEnabled,
    reminderDueSoonEnabled: preference.reminderDueSoonEnabled,
    reminderStaleEnabled: preference.reminderStaleEnabled,
    reminderReviewSlaEnabled: preference.reminderReviewSlaEnabled,
    dailyRollupEnabled: preference.dailyRollupEnabled,
  }))
}

watch(
  () => notificationsStore.preferences,
  (next) => {
    draftPreferences.value = clonePreferences(next)
  },
  { immediate: true, deep: true },
)

onMounted(async () => {
  if (!productStore.loaded && !productStore.loading) {
    await productStore.fetchProducts()
  }
  if (!selectedProductId.value) {
    selectedProductId.value = productStore.activeProductId || ''
  }
  await loadPreferencesForScope()
})

watch(
  () => productStore.activeProductId,
  (next) => {
    if (!selectedProductId.value) selectedProductId.value = next || ''
  },
)

watch(
  () => [preferenceScope.value, scopedProductId.value] as const,
  async () => {
    await loadPreferencesForScope()
  },
)

function updatePreference(
  category: string,
  patch: Partial<NotificationPreference>,
) {
  draftPreferences.value = draftPreferences.value.map((preference) => {
    if (preference.category !== category) return preference
    return {
      ...preference,
      ...patch,
    }
  })
}

function updateAllPreferences(patch: Partial<NotificationPreference>) {
  draftPreferences.value = draftPreferences.value.map((preference) => ({
    ...preference,
    ...patch,
  }))
}

function updateReminderCadence(value: string) {
  if (value === 'immediate' || value === 'daily' || value === 'weekly') {
    updateAllPreferences({ reminderCadence: value })
    return
  }
  updateAllPreferences({ reminderCadence: 'daily' })
}

async function savePreferences() {
  if (!hasChanges.value || !canEditPreferences.value) return
  saved.value = false
  localError.value = null
  try {
    await notificationsStore.savePreferences(clonePreferences(draftPreferences.value), scopedProductId.value)
    saved.value = true
    setTimeout(() => {
      saved.value = false
    }, 2500)
  } catch (error) {
    localError.value = error instanceof Error ? error.message : 'Failed to save notification preferences'
  }
}

function resetDraft() {
  draftPreferences.value = clonePreferences(notificationsStore.preferences)
  localError.value = null
}

async function applyRecommendedDefaults() {
  if (!recommendedPreset.value || !canEditPreferences.value) return
  applyingPreset.value = true
  localError.value = null
  try {
    await notificationsStore.applyPresetDefaults(scopedProductId.value)
    draftPreferences.value = clonePreferences(notificationsStore.preferences)
    saved.value = true
    setTimeout(() => {
      saved.value = false
    }, 2500)
  } catch (error) {
    localError.value = error instanceof Error ? error.message : 'Failed to apply recommended defaults'
  } finally {
    applyingPreset.value = false
  }
}

async function loadPreferencesForScope() {
  if (!canEditPreferences.value) {
    draftPreferences.value = []
    return
  }
  loadingScopedPreferences.value = true
  localError.value = null
  try {
    await notificationsStore.fetchPreferences(scopedProductId.value)
    draftPreferences.value = clonePreferences(notificationsStore.preferences)
  } finally {
    loadingScopedPreferences.value = false
  }
}
</script>

<template>
  <div class="w-full">
    <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div class="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 class="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Bell :size="18" class="text-[#4857FE]" />
            Notifications
          </h2>
          <p class="text-sm text-gray-500 mt-1">
            Control which in-app events you receive and which severity should alert you.
          </p>
        </div>
      </div>

      <div class="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">Preference scope</span>
          <button
            type="button"
            class="rounded-md border px-3 py-1.5 text-sm font-medium transition"
            :class="preferenceScope === 'global' ? 'border-[#4857FE] bg-indigo-50 text-[#3744C5]' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'"
            @click="preferenceScope = 'global'"
          >
            Global
          </button>
          <button
            type="button"
            class="rounded-md border px-3 py-1.5 text-sm font-medium transition"
            :class="preferenceScope === 'product' ? 'border-[#4857FE] bg-indigo-50 text-[#3744C5]' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'"
            @click="preferenceScope = 'product'"
          >
            Per product
          </button>

          <label v-if="preferenceScope === 'product'" class="ml-1 text-sm text-gray-700">
            <span class="mr-2 text-xs text-gray-500">Product</span>
            <select
              v-model="selectedProductId"
              class="h-9 min-w-[220px] rounded-md border border-gray-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
            >
              <option value="">Select product</option>
              <option
                v-for="product in productOptions"
                :key="product.id"
                :value="product.id"
              >
                {{ product.name }}
              </option>
            </select>
          </label>
        </div>
        <p v-if="preferenceScope === 'product' && !hasAnyProducts" class="mt-2 text-sm text-amber-700">
          No products available. Create or join a product to configure product-scoped preferences.
        </p>
      </div>

      <div
        v-if="saved"
        aria-live="polite"
        class="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4"
      >
        <CheckCircle2 :size="16" class="text-green-500" />
        <p class="text-sm text-green-700 font-medium">Notification preferences saved.</p>
      </div>

      <div
        v-if="localError || notificationsStore.error"
        aria-live="polite"
        class="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4"
      >
        <p class="text-sm text-red-600">{{ localError || notificationsStore.error }}</p>
      </div>

      <div
        v-if="hasRecommendedPreset"
        class="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-blue-900">
            Recommended defaults: <span class="font-semibold">{{ personaLabels[recommendedPreset?.persona || ''] || 'Custom' }}</span>
            <span class="text-blue-700">({{ presetSourceLabels[recommendedPreset?.source || ''] || 'profile-based' }})</span>
            <span v-if="recommendedPreset?.titleName" class="text-blue-700">- {{ recommendedPreset.titleName }}</span>
          </p>
          <Button
            type="button"
            variant="outline"
            class="border-blue-300 text-blue-700 hover:bg-blue-100"
            :disabled="notificationsStore.savingPreferences || applyingPreset || isUsingRecommendedPreset || !canEditPreferences"
            @click="applyRecommendedDefaults"
          >
            <Loader2 v-if="applyingPreset" :size="14" class="animate-spin mr-2" />
            {{ isUsingRecommendedPreset ? 'Using Recommended Defaults' : 'Apply Recommended Defaults' }}
          </Button>
        </div>
      </div>

      <div v-if="notificationsStore.loadingPreferences || loadingScopedPreferences" class="flex items-center gap-2 text-sm text-gray-500 py-8">
        <Loader2 :size="16" class="animate-spin" />
        Loading notification preferences…
      </div>

      <div v-else-if="canEditPreferences" class="space-y-3">
        <div
          v-if="reminderPreferenceDraft"
          class="border border-gray-200 rounded-xl p-4 bg-gray-50/60"
        >
          <div class="flex flex-wrap items-start gap-4">
            <div class="w-[220px]">
              <h3 class="text-sm font-semibold text-gray-900">Proactive reminders</h3>
              <p class="text-xs text-gray-500 mt-1">
                Controls for overdue, due soon, stale in-progress, and review SLA reminders.
              </p>
            </div>

            <label class="text-sm text-gray-700">
              <span class="block text-xs text-gray-500 mb-1">Cadence</span>
              <select
                :value="reminderPreferenceDraft.reminderCadence"
                class="h-9 rounded-md border border-gray-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
                @change="updateReminderCadence(($event.target as HTMLSelectElement).value)"
              >
                <option value="immediate">Immediate</option>
                <option value="daily">Daily digest</option>
                <option value="weekly">Weekly digest</option>
              </select>
            </label>

            <label class="text-sm text-gray-700">
              <span class="block text-xs text-gray-500 mb-1">Cooldown (minutes)</span>
              <Input
                type="number"
                min="15"
                :model-value="String(reminderPreferenceDraft.reminderCooldownMinutes)"
                class="h-9 w-[140px]"
                @update:modelValue="updateAllPreferences({ reminderCooldownMinutes: Math.max(15, Number($event) || 15) })"
              />
            </label>

            <label class="text-sm text-gray-700">
              <span class="block text-xs text-gray-500 mb-1">Due soon window (hours)</span>
              <Input
                type="number"
                min="1"
                :model-value="String(reminderPreferenceDraft.reminderDueSoonHours)"
                class="h-9 w-[150px]"
                @update:modelValue="updateAllPreferences({ reminderDueSoonHours: Math.max(1, Number($event) || 1) })"
              />
            </label>

            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input
                :checked="reminderPreferenceDraft.reminderOverdueEnabled"
                type="checkbox"
                class="rounded border-gray-300 text-[#4857FE] focus:ring-[#4857FE]"
                @change="updateAllPreferences({ reminderOverdueEnabled: ($event.target as HTMLInputElement).checked })"
              >
              Overdue reminders
            </label>

            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input
                :checked="reminderPreferenceDraft.reminderDueSoonEnabled"
                type="checkbox"
                class="rounded border-gray-300 text-[#4857FE] focus:ring-[#4857FE]"
                @change="updateAllPreferences({ reminderDueSoonEnabled: ($event.target as HTMLInputElement).checked })"
              >
              Due soon reminders
            </label>

            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input
                :checked="reminderPreferenceDraft.reminderStaleEnabled"
                type="checkbox"
                class="rounded border-gray-300 text-[#4857FE] focus:ring-[#4857FE]"
                @change="updateAllPreferences({ reminderStaleEnabled: ($event.target as HTMLInputElement).checked })"
              >
              Stale in-progress reminders
            </label>

            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input
                :checked="reminderPreferenceDraft.reminderReviewSlaEnabled"
                type="checkbox"
                class="rounded border-gray-300 text-[#4857FE] focus:ring-[#4857FE]"
                @change="updateAllPreferences({ reminderReviewSlaEnabled: ($event.target as HTMLInputElement).checked })"
              >
              Review SLA reminders
            </label>

            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input
                :checked="reminderPreferenceDraft.dailyRollupEnabled"
                type="checkbox"
                class="rounded border-gray-300 text-[#4857FE] focus:ring-[#4857FE]"
                @change="updateAllPreferences({ dailyRollupEnabled: ($event.target as HTMLInputElement).checked })"
              >
              Daily cross-view rollup
            </label>
          </div>
        </div>

        <div
          v-for="preference in draftPreferences"
          :key="preference.category"
          class="border border-gray-200 rounded-xl p-4"
        >
          <div class="flex flex-wrap items-start gap-4">
            <div class="w-[180px]">
              <h3 class="text-sm font-semibold text-gray-900">
                {{ categoryLabels[preference.category] || preference.category }}
              </h3>
              <p class="text-xs text-gray-500 mt-1">Category-level delivery controls.</p>
            </div>

            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input
                :checked="preference.inAppEnabled"
                type="checkbox"
                class="rounded border-gray-300 text-[#4857FE] focus:ring-[#4857FE]"
                @change="updatePreference(preference.category, { inAppEnabled: ($event.target as HTMLInputElement).checked })"
              >
              In-app enabled
            </label>

            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input
                :checked="preference.emailEnabled"
                type="checkbox"
                class="rounded border-gray-300 text-[#4857FE] focus:ring-[#4857FE]"
                @change="updatePreference(preference.category, { emailEnabled: ($event.target as HTMLInputElement).checked })"
              >
              Email enabled
            </label>

            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input
                :checked="preference.slackEnabled"
                type="checkbox"
                class="rounded border-gray-300 text-[#4857FE] focus:ring-[#4857FE]"
                @change="updatePreference(preference.category, { slackEnabled: ($event.target as HTMLInputElement).checked })"
              >
              Slack enabled
            </label>

            <label class="text-sm text-gray-700">
              <span class="block text-xs text-gray-500 mb-1">Minimum severity</span>
              <select
                :value="preference.minimumSeverity"
                class="h-9 rounded-md border border-gray-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
                @change="updatePreference(preference.category, { minimumSeverity: ($event.target as HTMLSelectElement).value as NotificationSeverity })"
              >
                <option
                  v-for="option in severityOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>

            <label class="text-sm text-gray-700">
              <span class="block text-xs text-gray-500 mb-1">Quiet hours start</span>
              <Input
                type="time"
                :model-value="preference.quietHoursStart || ''"
                class="h-9 w-[130px]"
                @update:modelValue="updatePreference(preference.category, { quietHoursStart: ($event as string) || null })"
              />
            </label>

            <label class="text-sm text-gray-700">
              <span class="block text-xs text-gray-500 mb-1">Quiet hours end</span>
              <Input
                type="time"
                :model-value="preference.quietHoursEnd || ''"
                class="h-9 w-[130px]"
                @update:modelValue="updatePreference(preference.category, { quietHoursEnd: ($event as string) || null })"
              />
            </label>
          </div>
        </div>
      </div>
      <div v-else class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Select a product to configure product-scoped notification preferences.
      </div>

      <div class="flex items-center gap-3 mt-6">
        <Button
          class="bg-[#4857FE] hover:bg-[#3E4BDE]"
          :disabled="notificationsStore.savingPreferences || !hasChanges || !canEditPreferences"
          @click="savePreferences"
        >
          <Loader2 v-if="notificationsStore.savingPreferences" :size="15" class="animate-spin mr-2" />
          {{ notificationsStore.savingPreferences ? 'Saving…' : 'Save Preferences' }}
        </Button>
        <button
          type="button"
          class="text-sm text-gray-500 hover:text-gray-700 font-medium"
          :disabled="notificationsStore.savingPreferences || !hasChanges"
          @click="resetDraft"
        >
          Reset
        </button>
      </div>
    </div>
  </div>
</template>
