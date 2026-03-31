<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownIt from 'markdown-it'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
} from 'lucide-vue-next'
import { buildHomeActivityEntityRoute } from '@/lib/homeEntityRouting'
import type {
  HomeBriefEntityFocusType,
  HomeBriefFallbackReason,
  HomeBriefMode,
  HomeBriefScope,
  HomeBriefTemplate,
  UserDailyBriefResponse,
} from '@/lib/api/usersApi'
import { formatDateTime } from '@/lib/locale'
import { sanitizeHtml } from '@/lib/sanitizeHtml'

const props = defineProps<{
  loading: boolean
  brief: UserDailyBriefResponse | null
  errorMessage: string | null
  mode: HomeBriefMode
  scope: HomeBriefScope
  productId: string | null
  entityType: HomeBriefEntityFocusType
  entityId: string
  template: HomeBriefTemplate
  products: Array<{ id: string; name: string }>
  allowAllProductsScope: boolean
}>()

const emit = defineEmits<{
  (event: 'update:mode', value: HomeBriefMode): void
  (event: 'update:scope', value: HomeBriefScope): void
  (event: 'update:product-id', value: string | null): void
  (event: 'update:entity-type', value: HomeBriefEntityFocusType): void
  (event: 'update:entity-id', value: string): void
  (event: 'update:template', value: HomeBriefTemplate): void
}>()

const router = useRouter()
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})
const collapsed = ref(true)
const hasNonAiSource = computed(() => props.brief?.source === 'disabled' || props.brief?.source === 'fallback')
const isAiSource = computed(() => !hasNonAiSource.value)
const selectedProductName = computed(() =>
  props.products.find((product) => product.id === props.productId)?.name || 'Selected product',
)
const currentScopeLabel = computed(() => {
  if (props.scope === 'all_products') return 'All products'
  if (props.scope === 'product') return selectedProductName.value
  const entityId = props.entityId.trim()
  return `${props.entityType}: ${entityId || 'unspecified'}`
})
const templateOptions = computed<Array<{ value: HomeBriefTemplate; label: string; entityOnly?: boolean }>>(() => ([
  { value: 'executive_narrative', label: 'Executive narrative' },
  { value: 'delivery_risk', label: 'Delivery risk' },
  { value: 'workload_focus', label: 'Workload focus' },
  { value: 'entity_deep_dive', label: 'Entity deep dive', entityOnly: true },
]))
const compatibleTemplateOptions = computed(() =>
  templateOptions.value.filter((option) => !option.entityOnly || props.scope === 'entity'),
)

const updatedLabel = computed(() => {
  if (!props.brief?.generatedAt) return ''
  return formatDateTime(props.brief.generatedAt)
})

function convertInlineTokenToLink(entityType: string, entityId: string, rawLabel: string): string {
  const label = rawLabel.trim() || entityId
  const route = buildHomeActivityEntityRoute(entityType, entityId)
  if (!route) return label
  const href = router.resolve(route).href
  return `[${label}](${href})`
}

const markdownWithLinks = computed(() => {
  if (!props.brief?.brief) return ''
  return props.brief.brief.replace(
    /\[\[([a-z_]+):([a-z0-9-]+)\|([^\]]+?)\]\]/gi,
    (_match, rawType: string, rawId: string, rawLabel: string) =>
      convertInlineTokenToLink(rawType, rawId, rawLabel),
  )
})

const renderedMarkdown = computed(() => {
  if (!markdownWithLinks.value) return ''
  return sanitizeHtml(markdown.render(markdownWithLinks.value))
})

function getUnavailableHint(
  source: UserDailyBriefResponse['source'],
  reason: HomeBriefFallbackReason | null | undefined,
): string {
  const normalizedReason = reason || (source === 'disabled' ? 'feature_disabled' : 'provider_error')
  if (normalizedReason === 'feature_disabled') {
    return 'AI briefing is disabled. Enable AI brief provider settings to get narrative briefings here.'
  }
  if (normalizedReason === 'provider_not_ready') {
    return 'AI briefing provider is not configured. Confirm provider selection and model settings, then refresh.'
  }
  if (normalizedReason === 'missing_api_key') {
    return 'AI briefing API credentials are missing. Configure the Home Daily Brief API key, then refresh.'
  }
  if (normalizedReason === 'timeout') {
    return 'AI briefing timed out while generating. Retry in a moment or increase provider timeout settings.'
  }
  if (normalizedReason === 'parse_error') {
    return 'AI briefing provider returned an invalid format. Refresh to retry generation.'
  }
  if (normalizedReason === 'empty_sanitized_output') {
    return 'AI briefing provider returned unusable content. Refresh to retry generation.'
  }
  return 'AI briefing could not be generated right now. Check AI provider connectivity and API credentials, then refresh.'
}

const unavailableHint = computed(() => {
  if (!props.brief || props.brief.source === 'ai') return ''
  return getUnavailableHint(props.brief.source, props.brief.fallbackReason)
})

const requestErrorHint = computed(() => {
  if (!props.errorMessage) return ''
  return props.errorMessage
})

function onModeSelect(value: HomeBriefMode) {
  emit('update:mode', value)
}

function onScopeSelect(value: HomeBriefScope) {
  emit('update:scope', value)
}

function onEntityTypeSelect(event: Event) {
  const next = (event.target as HTMLSelectElement).value as HomeBriefEntityFocusType
  emit('update:entity-type', next)
}

function onTemplateSelect(event: Event) {
  const next = (event.target as HTMLSelectElement).value as HomeBriefTemplate
  emit('update:template', next)
}

function onNarrativeClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  const link = target?.closest('a')
  if (!link) return
  const href = link.getAttribute('href') || ''
  if (!href.startsWith('/')) return
  event.preventDefault()
  void router.push(href)
}
</script>

<template>
  <section class="rounded-xl border border-gray-100 bg-white p-4 sm:p-5">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span
          class="inline-flex h-7 w-7 items-center justify-center rounded-lg"
          :class="isAiSource ? 'bg-[#4857FE]/10 text-[#4857FE]' : 'bg-amber-50 text-amber-600'"
        >
          <Sparkles v-if="isAiSource" :size="15" />
          <AlertTriangle v-else :size="15" />
        </span>
        <div>
          <h3 class="text-sm font-semibold text-gray-800">AI Brief</h3>
          <p class="text-[11px] text-gray-400">
            {{ isAiSource ? 'Narrative briefing' : 'AI narrative unavailable' }}
          </p>
        </div>
        <span
          class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500"
        >
          {{ currentScopeLabel }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <div class="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 p-0.5">
          <button
            type="button"
            class="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
            :class="mode === 'summary'
              ? 'bg-white text-[#4857FE] shadow-sm'
              : 'text-gray-500 hover:text-[#4857FE]'"
            @click="onModeSelect('summary')"
          >
            Summary
          </button>
          <button
            type="button"
            class="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
            :class="mode === 'full'
              ? 'bg-white text-[#4857FE] shadow-sm'
              : 'text-gray-500 hover:text-[#4857FE]'"
            @click="onModeSelect('full')"
          >
            Full briefing
          </button>
        </div>

        <button
          v-if="isAiSource && renderedMarkdown"
          type="button"
          class="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:border-[#4857FE]/30 hover:text-[#4857FE]"
          @click="collapsed = !collapsed"
        >
          <ChevronDown v-if="collapsed" :size="13" />
          <ChevronUp v-else :size="13" />
          {{ collapsed ? 'Expand' : 'Collapse' }}
        </button>
      </div>
    </div>

    <div class="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
      <div class="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 p-0.5">
        <button
          type="button"
          class="flex-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
          :class="scope === 'all_products'
            ? 'bg-white text-[#4857FE] shadow-sm'
            : 'text-gray-500 hover:text-[#4857FE]'"
          :disabled="!allowAllProductsScope"
          @click="onScopeSelect('all_products')"
        >
          All
        </button>
        <button
          type="button"
          class="flex-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
          :class="scope === 'product'
            ? 'bg-white text-[#4857FE] shadow-sm'
            : 'text-gray-500 hover:text-[#4857FE]'"
          @click="onScopeSelect('product')"
        >
          Product
        </button>
        <button
          type="button"
          class="flex-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
          :class="scope === 'entity'
            ? 'bg-white text-[#4857FE] shadow-sm'
            : 'text-gray-500 hover:text-[#4857FE]'"
          @click="onScopeSelect('entity')"
        >
          Entity
        </button>
      </div>

      <select
        class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 focus:border-[#4857FE] focus:outline-none"
        :value="template"
        @change="onTemplateSelect"
      >
        <option
          v-for="option in compatibleTemplateOptions"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>

      <select
        v-if="scope === 'product'"
        class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 focus:border-[#4857FE] focus:outline-none"
        :value="productId || ''"
        @change="emit('update:product-id', ($event.target as HTMLSelectElement).value || null)"
      >
        <option value="" disabled>Select product</option>
        <option
          v-for="product in products"
          :key="product.id"
          :value="product.id"
        >
          {{ product.name }}
        </option>
      </select>

      <div v-else-if="scope === 'entity'" class="grid grid-cols-2 gap-2 md:col-span-2">
        <select
          class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 focus:border-[#4857FE] focus:outline-none"
          :value="entityType"
          @change="onEntityTypeSelect"
        >
          <option value="task">Task</option>
          <option value="initiative">Initiative</option>
          <option value="story">Story</option>
          <option value="delivery">Delivery</option>
          <option value="release">Release</option>
        </select>
        <input
          class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 focus:border-[#4857FE] focus:outline-none"
          :value="entityId"
          placeholder="Entity ID"
          @input="emit('update:entity-id', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <div v-if="loading" class="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-3 text-sm text-gray-500">
      <Loader2 :size="14" class="animate-spin text-[#4857FE]" />
      Generating your narrative briefing...
    </div>

    <template v-else-if="brief">
      <div
        v-if="!isAiSource"
        class="rounded-lg border border-amber-100 bg-amber-50/60 p-3"
      >
        <p class="text-sm font-semibold text-amber-800">AI briefing unavailable</p>
        <p class="mt-1 text-xs text-amber-700">
          {{ unavailableHint }}
        </p>
      </div>

      <div
        v-else-if="renderedMarkdown"
        class="overflow-hidden rounded-lg border border-gray-100 bg-gray-50/60 p-3 transition-all"
        :class="collapsed ? 'max-h-56' : 'max-h-none'"
      >
        <div
          class="prose prose-sm max-w-none text-gray-700"
          v-html="renderedMarkdown"
          @click="onNarrativeClick"
        ></div>
      </div>

      <p v-else class="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
        AI brief content is unavailable right now.
      </p>

      <p v-if="updatedLabel" class="mt-2 text-[11px] text-gray-400">
        Updated {{ updatedLabel }}
      </p>
    </template>

    <div
      v-else-if="requestErrorHint"
      class="rounded-lg border border-red-100 bg-red-50/70 p-3"
    >
      <p class="text-sm font-semibold text-red-700">Unable to load AI brief</p>
      <p class="mt-1 text-xs text-red-600">{{ requestErrorHint }}</p>
    </div>

    <p v-else class="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
      AI brief content is unavailable right now.
    </p>
  </section>
</template>
