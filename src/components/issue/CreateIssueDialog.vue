<script setup lang="ts">
import { ref, watch, computed, reactive } from 'vue'
import { useIssuesStore } from '@/stores/issues'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import { useFormConfigsStore } from '@/stores/formConfigs'
import {
  mergeIssueFormConfig,
  getVisibleCustomIssueFields,
  defaultCustomFieldValue,
  isCustomFieldValueEmpty,
  isIssueFormFieldVisible,
} from '@/lib/issueFormConfig'
import DynamicField from '@/components/forms/DynamicField.vue'
import SearchableStringCombobox from '@/components/shared/SearchableStringCombobox.vue'
import { fetchDistinctIssueModules } from '@/lib/issueModulesApi'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2, Bug, RotateCcw, Send,
  AlertTriangle, Monitor, Paperclip,
  ChevronLeft, ChevronRight, Check, Link, Link2, CalendarDays, X, Search, Tags,
} from 'lucide-vue-next'
import type { IssueType, IssueSeverity, IssuePriority, IssueReproducibility, IssueEnvironment, IssueBrowser, IssueOs } from '@/types/issue'
import {
  partitionAllowedAttachmentFiles,
  ATTACHMENT_FILE_ACCEPT,
  ALLOWED_ATTACHMENT_TYPES_HINT,
} from '@/utils/allowedAttachments'
import { resolveApiPath } from '@/utils/uploadAssetUrl'
import { toast } from 'vue-sonner'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ storyId?: string | null }>()
const emit = defineEmits<{ created: [id: string] }>()  

const issuesStore = useIssuesStore()
const productStore = useProductStore()
const authStore = useAuthStore()
const formConfigsStore = useFormConfigsStore()

const mergedIssueForm = computed(() => {
  const p = productStore.activeProduct?.name
  const raw = p ? formConfigsStore.getConfig(p, 'issue') : null
  return mergeIssueFormConfig(raw ?? undefined)
})

const customIssueFields = computed(() => getVisibleCustomIssueFields(mergedIssueForm.value))

function issueFieldVisible(key: string): boolean {
  return isIssueFormFieldVisible(mergedIssueForm.value, key)
}

const showCreateReproductionBlock = computed(
  () =>
    issueFieldVisible('stepsToReproduce') ||
    issueFieldVisible('expectedBehavior') ||
    issueFieldVisible('actualBehavior') ||
    issueFieldVisible('reproducibility'),
)

const showCreateEstimateDatesBlock = computed(
  () =>
    issueFieldVisible('estimateValue') ||
    issueFieldVisible('startDate') ||
    issueFieldVisible('endDate'),
)

const showCreateEnvironmentBlock = computed(
  () =>
    issueFieldVisible('environment') ||
    issueFieldVisible('browser') ||
    issueFieldVisible('operatingSystem'),
)

const showCreateSeverityPriorityBlock = computed(
  () =>
    issueFieldVisible('severity') ||
    issueFieldVisible('priority') ||
    issueFieldVisible('assignedToUserId') ||
    issueFieldVisible('appVersion'),
)

const customFieldValues = reactive<Record<string, unknown>>({})

function resetCustomFieldValues() {
  for (const k of Object.keys(customFieldValues)) delete customFieldValues[k]
  for (const f of customIssueFields.value) {
    customFieldValues[f.key] = defaultCustomFieldValue(f)
  }
}

watch(
  () => customIssueFields.value.map(f => `${f.key}:${f.type}`).join('|'),
  () => {
    resetCustomFieldValues()
  },
  { immediate: true },
)

// Wizard step
const step = ref(1)
const totalSteps = 3

// Form state
const title = ref('')
const description = ref('')
const type = ref<IssueType>('bug')
const module_ = ref('')
const moduleSuggestions = ref<string[]>([])
const moduleSuggestionsLoading = ref(false)
const stepsToReproduce = ref('')
const expectedBehavior = ref('')
const actualBehavior = ref('')
const reproducibility = ref<IssueReproducibility | ''>('')
const severity = ref<IssueSeverity>('minor')
const priority = ref<IssuePriority>('medium')
const assigneeSearch = ref('')
const assigneeId = ref<string | null>(null)
const assigneeName = ref('')
const appVersion = ref('')
const environment = ref<IssueEnvironment | ''>('')
const browser = ref<IssueBrowser | ''>('')
const operatingSystem = ref<IssueOs | ''>('')
const estimateHours = ref('')
const issueStartDate = ref('')
const issueEndDate = ref('')

const submitting = ref(false)
const error = ref('')

async function loadModuleSuggestions() {
  const p = productStore.activeProduct?.name
  if (!p) return
  moduleSuggestionsLoading.value = true
  try {
    const list = await fetchDistinctIssueModules(p, authStore.token)
    moduleSuggestions.value = [...new Set(list)]
  } finally {
    moduleSuggestionsLoading.value = false
  }
}

watch(open, async isOpen => {
  if (!isOpen) return
  const p = productStore.activeProduct?.name
  if (p && authStore.token) {
    await Promise.all([formConfigsStore.fetchConfig(p, 'issue'), loadModuleSuggestions()])
  }
})

// Attachments
const pendingFiles = ref<File[]>([])
const isDragging = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

// Team member search
const searchResults = ref<any[]>([])
const searchLoading = ref(false)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

// Step validation
const canProceedStep1 = computed(() => title.value.trim().length > 0)
const canProceedStep2 = computed(() => {
  for (const f of customIssueFields.value) {
    if (!f.required) continue
    if (isCustomFieldValueEmpty(customFieldValues[f.key], f.type)) return false
  }
  return true
})

const stepLabels = ['Bug Details', 'Priority & Environment', 'Attachments & Submit']

async function searchMembers(q: string) {
  if (!q.trim()) { searchResults.value = []; return }
  searchLoading.value = true
  try {
    const res = await fetch(`/api/auth/users?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    })
    if (res.ok) searchResults.value = await res.json()
  } catch { searchResults.value = [] }
  finally { searchLoading.value = false }
}

function onAssigneeInput() {
  assigneeId.value = null
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => searchMembers(assigneeSearch.value), 200)
}

function selectAssignee(user: any) {
  assigneeId.value = user.id
  assigneeName.value = user.name
  assigneeSearch.value = user.name
  searchResults.value = []
}

// Linked story/task
const linkSearch = ref('')
const linkResults = ref<{ type: 'story' | 'task'; id: string; title: string }[]>([])
const linkSearchLoading = ref(false)
const linkedStoryId = ref<string | null>(null)
const linkedStoryTitle = ref('')
const linkedTaskId = ref<string | null>(null)
const linkedTaskTitle = ref('')
let linkSearchTimeout: ReturnType<typeof setTimeout> | null = null

async function searchLinks(q: string) {
  if (!q.trim()) { linkResults.value = []; return }
  linkSearchLoading.value = true
  try {
    const product = productStore.activeProduct?.name
    const [storiesRes, tasksRes] = await Promise.all([
      fetch(`/api/stories?product=${encodeURIComponent(product || '')}`),
      fetch(`/api/tasks?product=${encodeURIComponent(product || '')}`),
    ])
    const results: typeof linkResults.value = []
    if (storiesRes.ok) {
      const stories: any[] = await storiesRes.json()
      results.push(...stories.filter(s => s.title.toLowerCase().includes(q.toLowerCase())).slice(0, 5).map(s => ({ type: 'story' as const, id: s.id, title: s.title })))
    }
    if (tasksRes.ok) {
      const tasks: any[] = await tasksRes.json()
      results.push(...tasks.filter(t => t.title.toLowerCase().includes(q.toLowerCase())).slice(0, 5).map(t => ({ type: 'task' as const, id: t.id, title: t.title })))
    }
    linkResults.value = results
  } catch { linkResults.value = [] }
  finally { linkSearchLoading.value = false }
}

function onLinkInput() {
  if (linkSearchTimeout) clearTimeout(linkSearchTimeout)
  linkSearchTimeout = setTimeout(() => searchLinks(linkSearch.value), 300)
}

function selectLink(item: { type: 'story' | 'task'; id: string; title: string }) {
  if (item.type === 'story') {
    linkedStoryId.value = item.id
    linkedStoryTitle.value = item.title
  } else {
    linkedTaskId.value = item.id
    linkedTaskTitle.value = item.title
  }
  linkSearch.value = ''
  linkResults.value = []
}

function removeStoryLink() { linkedStoryId.value = null; linkedStoryTitle.value = '' }
function removeTaskLink() { linkedTaskId.value = null; linkedTaskTitle.value = '' }

function clearForm() {
  step.value = 1
  title.value = ''; description.value = ''; type.value = 'bug'; module_.value = ''
  stepsToReproduce.value = ''; expectedBehavior.value = ''; actualBehavior.value = ''
  reproducibility.value = ''; severity.value = 'minor'; priority.value = 'medium'
  assigneeSearch.value = ''; assigneeId.value = null; assigneeName.value = ''
  appVersion.value = ''; environment.value = ''; browser.value = ''; operatingSystem.value = ''
  estimateHours.value = ''; issueStartDate.value = ''; issueEndDate.value = ''
  pendingFiles.value = []; error.value = ''
  linkSearch.value = ''; linkResults.value = []
  // Preserve storyId if provided as prop
  linkedStoryId.value = props.storyId || null
  linkedStoryTitle.value = props.storyId ? linkedStoryTitle.value : ''
  linkedTaskId.value = null; linkedTaskTitle.value = ''
  resetCustomFieldValues()
}

// Sync prop storyId on open
watch(() => props.storyId, async (id) => {
  if (!id) return
  linkedStoryId.value = id
  // Try to find title from stories API
  try {
    const res = await fetch(`/api/stories/${id}`)
    if (res.ok) {
      const story = await res.json()
      linkedStoryTitle.value = story.title || ''
    }
  } catch { linkedStoryTitle.value = '' }
}, { immediate: true })

watch(open, (val) => { if (!val) clearForm() })

function nextStep() {
  if (step.value === 1 && !canProceedStep1.value) return
  if (step.value === 2 && !validateCustomFields()) return
  if (step.value < totalSteps) step.value++
}

function prevStep() {
  if (step.value > 1) step.value--
}

function onDragOver(e: DragEvent) { e.preventDefault(); isDragging.value = true }
function onDragLeave() { isDragging.value = false }
function onDrop(e: DragEvent) {
  e.preventDefault(); isDragging.value = false
  if (!e.dataTransfer?.files?.length) return
  const { allowed, rejectedNames } = partitionAllowedAttachmentFiles(Array.from(e.dataTransfer.files))
  if (rejectedNames.length > 0) {
    const preview = rejectedNames.slice(0, 3).join(', ')
    const more = rejectedNames.length > 3 ? ` (+${rejectedNames.length - 3} more)` : ''
    toast.error(`Skipped unsupported file(s): ${preview}${more}. ${ALLOWED_ATTACHMENT_TYPES_HINT}.`)
  }
  if (allowed.length) pendingFiles.value.push(...allowed)
}
function onFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  if (!target.files?.length) return
  const { allowed, rejectedNames } = partitionAllowedAttachmentFiles(Array.from(target.files))
  if (rejectedNames.length > 0) {
    const preview = rejectedNames.slice(0, 3).join(', ')
    const more = rejectedNames.length > 3 ? ` (+${rejectedNames.length - 3} more)` : ''
    toast.error(`Skipped unsupported file(s): ${preview}${more}. ${ALLOWED_ATTACHMENT_TYPES_HINT}.`)
  }
  if (allowed.length) pendingFiles.value.push(...allowed)
  target.value = ''
}
function removeFile(index: number) { pendingFiles.value.splice(index, 1) }

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function typeLabel(t: string) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function validateCustomFields(): boolean {
  for (const f of customIssueFields.value) {
    if (!f.required) continue
    if (isCustomFieldValueEmpty(customFieldValues[f.key], f.type)) {
      error.value = `Please fill in "${f.label}".`
      return false
    }
  }
  error.value = ''
  return true
}

function buildCustomFieldsPayload(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of customIssueFields.value) {
    const v = customFieldValues[f.key]
    if (!isCustomFieldValueEmpty(v, f.type)) out[f.key] = v
  }
  return out
}

async function handleSubmit() {
  if (!title.value.trim()) return
  error.value = ''
  if (!validateCustomFields()) return

  let estimatePayload: number | null | undefined
  const estRaw = String(estimateHours.value ?? '').trim()
  if (estRaw !== '') {
    const n = Number.parseFloat(estRaw)
    if (!Number.isFinite(n) || n < 0) {
      error.value = 'Enter a valid non-negative estimate in hours (or leave empty).'
      return
    }
    estimatePayload = Math.round(n * 2) / 2
  }

  const startWire = String(issueStartDate.value ?? '').trim() || null
  const endWire = String(issueEndDate.value ?? '').trim() || null
  if (startWire && endWire && endWire < startWire) {
    error.value = 'End date must be on or after start date.'
    return
  }

  submitting.value = true

  const issue = await issuesStore.createIssue({
    title: title.value.trim(),
    description: description.value || null,
    type: type.value,
    module: module_.value || null,
    stepsToReproduce: stepsToReproduce.value || null,
    expectedBehavior: expectedBehavior.value || null,
    actualBehavior: actualBehavior.value || null,
    reproducibility: reproducibility.value || null,
    severity: severity.value,
    priority: priority.value,
    assignedToUserId: assigneeId.value,
    appVersion: appVersion.value || null,
    environment: environment.value || null,
    browser: browser.value || null,
    operatingSystem: operatingSystem.value || null,
    product: productStore.activeProduct?.name,
    storyId: linkedStoryId.value,
    taskId: linkedTaskId.value,
    ...(estimatePayload !== undefined ? { estimateValue: estimatePayload } : {}),
    ...(startWire ? { startDate: startWire } : {}),
    ...(endWire ? { endDate: endWire } : {}),
  })

  if (!issue) {
    error.value = 'Failed to create issue'
    submitting.value = false
    return
  }

  if (pendingFiles.value.length > 0) {
    for (const file of pendingFiles.value) {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(resolveApiPath(`/api/issues/${issue.id}/attachments`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${authStore.token}` },
        body: formData,
      })
      if (!res.ok) {
        try {
          const j = await res.json()
          if (j?.error) toast.error(j.error)
        } catch { /* ignore */ }
      }
    }
  }

  const customPayload = buildCustomFieldsPayload()
  if (Object.keys(customPayload).length > 0) {
    const ok = await formConfigsStore.saveCustomValues('issue', issue.id, customPayload)
    if (!ok) toast.error('Issue was created but custom fields could not be saved.')
  }

  submitting.value = false
  emit('created', issue.id)
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[640px] max-h-[85vh] flex flex-col overflow-hidden">
      <DialogHeader class="shrink-0">
        <DialogTitle class="flex items-center gap-2">
          <Bug :size="20" class="text-red-500" />
          Report a Bug
        </DialogTitle>
        <DialogDescription>Fill in all relevant details to help us fix it faster.</DialogDescription>
      </DialogHeader>

      <!-- Step indicator -->
      <div class="flex items-center gap-2 px-1 shrink-0">
        <template v-for="s in totalSteps" :key="s">
          <div class="flex items-center gap-2" :class="s > 1 ? 'flex-1' : ''">
            <div v-if="s > 1" class="flex-1 h-0.5 rounded-full" :class="s <= step ? 'bg-[#4857FE]' : 'bg-gray-200'"></div>
            <div
              class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors"
              :class="s < step ? 'bg-[#4857FE] text-white' : s === step ? 'bg-[#4857FE] text-white ring-4 ring-[#4857FE]/20' : 'bg-gray-200 text-gray-500'"
            >
              <Check v-if="s < step" :size="14" />
              <span v-else>{{ s }}</span>
            </div>
          </div>
        </template>
      </div>
      <p class="text-xs text-center text-gray-500 -mt-1 shrink-0">{{ stepLabels[step - 1] }}</p>

      <!-- Error -->
      <div v-if="error" class="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mx-1 shrink-0">
        <p class="text-sm text-red-600">{{ error }}</p>
      </div>

      <!-- Scrollable content -->
      <div class="flex-1 overflow-y-auto px-1 space-y-4">
        <!-- ============ STEP 1: Bug Details ============ -->
        <template v-if="step === 1">
          <!-- Basic Information -->
          <fieldset class="border border-gray-200 rounded-xl p-4 space-y-3">
            <legend class="text-sm font-semibold text-gray-700 px-2 flex items-center gap-1.5">
              <Bug :size="14" class="text-gray-400" /> Basic Information
            </legend>

            <div class="space-y-1.5">
              <label class="text-sm font-medium text-gray-700">Title *</label>
              <Input v-model="title" placeholder="e.g. Login button not responding on mobile" autofocus />
            </div>

            <div v-if="issueFieldVisible('description')" class="space-y-1.5">
              <label class="text-sm font-medium text-gray-700">Description</label>
              <Textarea v-model="description" placeholder="Describe the bug in detail..." :rows="3" />
            </div>

            <div
              v-if="issueFieldVisible('type') || issueFieldVisible('module')"
              class="grid grid-cols-2 gap-3"
            >
              <div v-if="issueFieldVisible('type')" class="space-y-1.5">
                <label class="text-sm font-medium text-gray-700">Type</label>
                <Select v-model="type">
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="ui_issue">UI Issue</SelectItem>
                    <SelectItem value="performance">Performance</SelectItem>
                    <SelectItem value="crash">Crash</SelectItem>
                    <SelectItem value="security">Security</SelectItem>
                    <SelectItem value="data_loss">Data Loss</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div v-if="issueFieldVisible('module')" class="space-y-1.5 min-w-0">
                <label class="text-sm font-medium text-gray-700">Module / Feature</label>
                <SearchableStringCombobox
                  v-model="module_"
                  :suggestions="moduleSuggestions"
                  :loading="moduleSuggestionsLoading"
                  placeholder="Search Modules"
                  show-trailing-edit-icon
                  input-class="w-full min-w-0"
                />
              </div>
            </div>
          </fieldset>

          <!-- Reproduction Details -->
          <fieldset
            v-if="showCreateReproductionBlock"
            class="border border-gray-200 rounded-xl p-4 space-y-3"
          >
            <legend class="text-sm font-semibold text-gray-700 px-2 flex items-center gap-1.5">
              <RotateCcw :size="14" class="text-gray-400" /> Reproduction Details
            </legend>

            <div v-if="issueFieldVisible('stepsToReproduce')" class="space-y-1.5">
              <label class="text-sm font-medium text-gray-700">Steps to Reproduce</label>
              <Textarea v-model="stepsToReproduce" placeholder="1. Go to '...'&#10;2. Click on '...'&#10;3. Scroll to '...'&#10;4. See error" :rows="4" />
            </div>

            <div
              v-if="issueFieldVisible('expectedBehavior') || issueFieldVisible('actualBehavior')"
              class="grid grid-cols-2 gap-3"
            >
              <div v-if="issueFieldVisible('expectedBehavior')" class="space-y-1.5">
                <label class="text-sm font-medium text-gray-700">Expected Behavior</label>
                <Textarea v-model="expectedBehavior" placeholder="What should have happened..." :rows="3" />
              </div>
              <div v-if="issueFieldVisible('actualBehavior')" class="space-y-1.5">
                <label class="text-sm font-medium text-gray-700">Actual Behavior</label>
                <Textarea v-model="actualBehavior" placeholder="What actually happened..." :rows="3" />
              </div>
            </div>

            <div v-if="issueFieldVisible('reproducibility')" class="space-y-1.5 max-w-[50%]">
              <label class="text-sm font-medium text-gray-700">Reproducibility</label>
              <Select v-model="reproducibility">
                <SelectTrigger><SelectValue placeholder="How often?" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="always">Always</SelectItem>
                  <SelectItem value="sometimes">Sometimes</SelectItem>
                  <SelectItem value="rarely">Rarely</SelectItem>
                  <SelectItem value="once">Once</SelectItem>
                  <SelectItem value="unable_to_reproduce">Unable to Reproduce</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </fieldset>
        </template>

        <!-- ============ STEP 2: Priority & Environment ============ -->
        <template v-if="step === 2">
          <!-- Severity & Priority -->
          <fieldset
            v-if="showCreateSeverityPriorityBlock"
            class="border border-gray-200 rounded-xl p-4 space-y-3"
          >
            <legend class="text-sm font-semibold text-gray-700 px-2 flex items-center gap-1.5">
              <AlertTriangle :size="14" class="text-gray-400" /> Severity & Priority
            </legend>

            <div
              v-if="issueFieldVisible('severity') || issueFieldVisible('priority')"
              class="grid grid-cols-2 gap-3"
            >
              <div v-if="issueFieldVisible('severity')" class="space-y-1.5">
                <label class="text-sm font-medium text-gray-700">Severity *</label>
                <Select v-model="severity">
                  <SelectTrigger><SelectValue placeholder="Select severity" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blocker">Blocker</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="major">Major</SelectItem>
                    <SelectItem value="minor">Minor</SelectItem>
                    <SelectItem value="trivial">Trivial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div v-if="issueFieldVisible('priority')" class="space-y-1.5">
                <label class="text-sm font-medium text-gray-700">Priority *</label>
                <Select v-model="priority">
                  <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div
              v-if="issueFieldVisible('assignedToUserId') || issueFieldVisible('appVersion')"
              class="grid grid-cols-2 gap-3"
            >
              <div v-if="issueFieldVisible('assignedToUserId')" class="space-y-1.5">
                <label class="text-sm font-medium text-gray-700">Assign To</label>
                <div class="relative">
                  <Input v-model="assigneeSearch" placeholder="Search team member..." @input="onAssigneeInput" />
                  <div v-if="searchResults.length > 0" class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[160px] overflow-auto z-50" @mousedown.prevent>
                    <button
                      v-for="u in searchResults" :key="u.id" type="button"
                      class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 text-sm"
                      @click="selectAssignee(u)"
                    >
                      <span class="font-medium text-gray-800">{{ u.name }}</span>
                      <span class="text-xs text-gray-400">{{ u.email }}</span>
                    </button>
                  </div>
                </div>
              </div>
              <div v-if="issueFieldVisible('appVersion')" class="space-y-1.5">
                <label class="text-sm font-medium text-gray-700">App Version</label>
                <Input v-model="appVersion" placeholder="e.g. v2.4.1" />
              </div>
            </div>
          </fieldset>

          <!-- Estimate & dates -->
          <fieldset
            v-if="showCreateEstimateDatesBlock"
            class="border border-gray-200 rounded-xl p-4 space-y-3"
          >
            <legend class="text-sm font-semibold text-gray-700 px-2 flex items-center gap-1.5">
              <CalendarDays :size="14" class="text-gray-400" /> Estimate & dates
            </legend>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div v-if="issueFieldVisible('estimateValue')" class="space-y-1.5">
                <label class="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Link2 :size="14" class="text-gray-400" /> Estimate (hours)
                </label>
                <Input
                  v-model="estimateHours"
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="e.g. 4"
                />
              </div>
              <div v-if="issueFieldVisible('startDate')" class="space-y-1.5">
                <label class="text-sm font-medium text-gray-700">Start date</label>
                <Input v-model="issueStartDate" type="date" />
              </div>
              <div v-if="issueFieldVisible('endDate')" class="space-y-1.5">
                <label class="text-sm font-medium text-gray-700">End date</label>
                <Input v-model="issueEndDate" type="date" />
              </div>
            </div>
          </fieldset>

          <!-- Environment -->
          <fieldset
            v-if="showCreateEnvironmentBlock"
            class="border border-gray-200 rounded-xl p-4 space-y-3"
          >
            <legend class="text-sm font-semibold text-gray-700 px-2 flex items-center gap-1.5">
              <Monitor :size="14" class="text-gray-400" /> Environment
            </legend>

            <div
              v-if="issueFieldVisible('environment') || issueFieldVisible('browser')"
              class="grid grid-cols-2 gap-3"
            >
              <div v-if="issueFieldVisible('environment')" class="space-y-1.5">
                <label class="text-sm font-medium text-gray-700">Environment</label>
                <Select v-model="environment">
                  <SelectTrigger><SelectValue placeholder="Select environment" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Production</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="development">Development</SelectItem>
                    <SelectItem value="testing">Testing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div v-if="issueFieldVisible('browser')" class="space-y-1.5">
                <label class="text-sm font-medium text-gray-700">Browser</label>
                <Select v-model="browser">
                  <SelectTrigger><SelectValue placeholder="Select browser" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chrome">Chrome</SelectItem>
                    <SelectItem value="firefox">Firefox</SelectItem>
                    <SelectItem value="safari">Safari</SelectItem>
                    <SelectItem value="edge">Edge</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div v-if="issueFieldVisible('operatingSystem')" class="max-w-[50%] space-y-1.5">
              <label class="text-sm font-medium text-gray-700">Operating System</label>
              <Select v-model="operatingSystem">
                <SelectTrigger><SelectValue placeholder="Select OS" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="windows">Windows</SelectItem>
                  <SelectItem value="macos">macOS</SelectItem>
                  <SelectItem value="linux">Linux</SelectItem>
                  <SelectItem value="ios">iOS</SelectItem>
                  <SelectItem value="android">Android</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </fieldset>

          <!-- Link to Story / Task -->
          <fieldset class="border border-gray-200 rounded-xl p-4 space-y-3">
            <legend class="text-sm font-semibold text-gray-700 px-2 flex items-center gap-1.5">
              <Link :size="14" class="text-gray-400" /> Link to Story or Task
            </legend>

            <!-- Linked items display -->
            <div v-if="linkedStoryId || linkedTaskId" class="space-y-1.5">
              <div v-if="linkedStoryId" class="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-[10px] font-bold text-blue-600 bg-blue-100 rounded px-1.5 py-0.5">STORY</span>
                  <span class="text-sm text-blue-800 truncate">{{ linkedStoryTitle }}</span>
                </div>
                <!-- Only allow removing link if not pre-set from parent context -->
                <button v-if="!props.storyId" type="button" class="text-blue-400 hover:text-blue-600 shrink-0" @click="removeStoryLink">
                  <X :size="14" />
                </button>
              </div>
              <div v-if="linkedTaskId" class="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-[10px] font-bold text-green-600 bg-green-100 rounded px-1.5 py-0.5">TASK</span>
                  <span class="text-sm text-green-800 truncate">{{ linkedTaskTitle }}</span>
                </div>
                <button type="button" class="text-green-400 hover:text-green-600 shrink-0" @click="removeTaskLink">
                  <X :size="14" />
                </button>
              </div>
            </div>

            <!-- Search: only shown when no prop storyId is pre-set -->
            <div v-if="!props.storyId" class="relative">
              <div class="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 focus-within:border-[#4857FE] focus-within:ring-1 focus-within:ring-[#4857FE]/20 bg-white">
                <Search :size="14" class="text-gray-400 shrink-0" />
                <input
                  v-model="linkSearch"
                  class="text-sm text-gray-700 bg-transparent outline-none w-full placeholder-gray-400"
                  placeholder="Search stories or tasks to link..."
                  @input="onLinkInput"
                />
                <Loader2 v-if="linkSearchLoading" :size="14" class="text-gray-400 animate-spin shrink-0" />
              </div>

              <div v-if="linkResults.length > 0" class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[200px] overflow-auto z-50" @mousedown.prevent>
                <button
                  v-for="item in linkResults" :key="item.type + item.id" type="button"
                  class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 text-sm"
                  @click="selectLink(item)"
                >
                  <span class="text-[10px] font-bold rounded px-1.5 py-0.5 shrink-0"
                    :class="item.type === 'story' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'"
                  >{{ item.type === 'story' ? 'STORY' : 'TASK' }}</span>
                  <span class="text-gray-800 truncate">{{ item.title }}</span>
                </button>
              </div>
            </div>

            <p class="text-xs text-gray-400">Optional — link this issue to a related story or task.</p>
          </fieldset>

          <!-- Custom fields from form builder -->
          <fieldset
            v-if="customIssueFields.length > 0"
            class="border border-gray-200 rounded-xl p-4 space-y-3"
          >
            <legend class="text-sm font-semibold text-gray-700 px-2 flex items-center gap-1.5">
              <Tags :size="14" class="text-gray-400" /> Additional fields
            </legend>
            <div class="space-y-4">
              <DynamicField
                v-for="field in customIssueFields"
                :key="field.key"
                :field="field"
                :model-value="customFieldValues[field.key]"
                @update:model-value="customFieldValues[field.key] = $event"
              />
            </div>
          </fieldset>
        </template>

        <!-- ============ STEP 3: Attachments & Review ============ -->
        <template v-if="step === 3">
          <!-- Attachments -->
          <fieldset class="border border-gray-200 rounded-xl p-4 space-y-3">
            <legend class="text-sm font-semibold text-gray-700 px-2 flex items-center gap-1.5">
              <Paperclip :size="14" class="text-gray-400" /> Attachments
            </legend>

            <div
              class="border-2 border-dashed rounded-lg p-5 text-center transition-all cursor-pointer"
              :class="isDragging ? 'border-[#4857FE] bg-[#4857FE]/5' : 'border-gray-200 hover:border-gray-300 bg-gray-50/50'"
              @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop"
              @click="fileInputRef?.click()"
            >
              <input
                ref="fileInputRef"
                type="file"
                multiple
                class="hidden"
                :accept="ATTACHMENT_FILE_ACCEPT"
                @change="onFileSelect"
              />
              <div class="flex flex-col items-center gap-1.5 text-sm" :class="isDragging ? 'text-[#4857FE]' : 'text-gray-500'">
                <Paperclip :size="20" />
                <span>Drop files or click to upload</span>
                <span class="text-xs text-gray-400">Screenshots, logs, videos</span>
              </div>
            </div>

            <div v-if="pendingFiles.length > 0" class="space-y-1">
              <div v-for="(file, idx) in pendingFiles" :key="idx" class="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5">
                <span class="text-sm text-gray-700 truncate">{{ file.name }}</span>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-gray-400">{{ formatSize(file.size) }}</span>
                  <button type="button" class="text-xs text-red-500 hover:text-red-700" @click="removeFile(idx)">Remove</button>
                </div>
              </div>
            </div>
          </fieldset>

          <!-- Review summary -->
          <div class="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50/50">
            <h3 class="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <Check :size="14" class="text-gray-400" /> Review Summary
            </h3>

            <div class="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <p class="text-[10px] text-gray-400 uppercase tracking-wider">Title</p>
                <p class="text-sm text-gray-800 font-medium truncate">{{ title || '—' }}</p>
              </div>
              <div v-if="issueFieldVisible('type')">
                <p class="text-[10px] text-gray-400 uppercase tracking-wider">Type</p>
                <p class="text-sm text-gray-700">{{ typeLabel(type) }}</p>
              </div>
              <div v-if="issueFieldVisible('severity')">
                <p class="text-[10px] text-gray-400 uppercase tracking-wider">Severity</p>
                <span class="text-xs font-medium px-2 py-0.5 rounded-full"
                  :class="severity === 'blocker' ? 'bg-rose-950 text-white' : severity === 'critical' ? 'bg-red-100 text-red-700' : severity === 'major' ? 'bg-orange-100 text-orange-700' : severity === 'minor' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'"
                >{{ severity }}</span>
              </div>
              <div v-if="issueFieldVisible('priority')">
                <p class="text-[10px] text-gray-400 uppercase tracking-wider">Priority</p>
                <span class="text-xs font-medium capitalize"
                  :class="priority === 'high' ? 'text-red-600' : priority === 'medium' ? 'text-yellow-600' : 'text-gray-500'"
                >{{ priority }}</span>
              </div>
              <div v-if="issueFieldVisible('assignedToUserId') && assigneeName">
                <p class="text-[10px] text-gray-400 uppercase tracking-wider">Assigned To</p>
                <p class="text-sm text-gray-700">{{ assigneeName }}</p>
              </div>
              <div v-if="issueFieldVisible('module') && module_">
                <p class="text-[10px] text-gray-400 uppercase tracking-wider">Module</p>
                <p class="text-sm text-gray-700">{{ module_ }}</p>
              </div>
              <div v-if="issueFieldVisible('environment') && environment">
                <p class="text-[10px] text-gray-400 uppercase tracking-wider">Environment</p>
                <p class="text-sm text-gray-700 capitalize">{{ environment }}</p>
              </div>
              <div v-if="linkedStoryTitle">
                <p class="text-[10px] text-gray-400 uppercase tracking-wider">Linked Story</p>
                <p class="text-sm text-gray-700 truncate">{{ linkedStoryTitle }}</p>
              </div>
              <div v-if="linkedTaskTitle">
                <p class="text-[10px] text-gray-400 uppercase tracking-wider">Linked Task</p>
                <p class="text-sm text-gray-700 truncate">{{ linkedTaskTitle }}</p>
              </div>
              <div v-if="pendingFiles.length > 0">
                <p class="text-[10px] text-gray-400 uppercase tracking-wider">Attachments</p>
                <p class="text-sm text-gray-700">{{ pendingFiles.length }} file{{ pendingFiles.length > 1 ? 's' : '' }}</p>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Footer with navigation -->
      <div class="flex items-center justify-between pt-3 border-t border-gray-100 shrink-0">
        <div>
          <Button v-if="step > 1" type="button" variant="outline" size="sm" @click="prevStep">
            <ChevronLeft :size="14" class="mr-1" />
            Back
          </Button>
          <Button v-else type="button" variant="ghost" size="sm" class="text-gray-500" @click="clearForm">
            Clear
          </Button>
        </div>

        <div class="flex items-center gap-2">
          <Button
            v-if="step < totalSteps"
            type="button"
            size="sm"
            class="bg-[#4857FE] hover:bg-[#3E4BDE]"
            :disabled="(step === 1 && !canProceedStep1) || (step === 2 && !canProceedStep2)"
            @click="nextStep"
          >
            Next
            <ChevronRight :size="14" class="ml-1" />
          </Button>
          <Button v-else type="button" size="sm" class="bg-[#4857FE] hover:bg-[#3E4BDE]" :disabled="!title.trim() || submitting" @click="handleSubmit">
            <Loader2 v-if="submitting" :size="14" class="animate-spin mr-1.5" />
            <Send v-else :size="14" class="mr-1.5" />
            {{ submitting ? 'Submitting...' : 'Submit Bug Report' }}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
