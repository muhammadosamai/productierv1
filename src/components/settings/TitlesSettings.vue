<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { useRolesStore, type PagePermission } from '@/stores/roles'
import { CheckCircle2, Loader2, Pencil, Plus, Shield, Trash2, User } from 'lucide-vue-next'

const rolesStore = useRolesStore()

const selectedTitleId = ref('')
const createName = ref('')
const createKey = ref('')
const createDescription = ref('')
const createBaseRole = ref('')

const editName = ref('')
const editDescription = ref('')
const editActive = ref(true)

const localPermissions = ref<Record<string, PagePermission>>({})

const savingPermissions = ref(false)
const savingMetadata = ref(false)
const creatingTitle = ref(false)
const saved = ref(false)
const error = ref<string | null>(null)

const titles = computed(() => rolesStore.titles)
const selectedTitle = computed(() => titles.value.find((entry) => entry.id === selectedTitleId.value) || null)
const pageCatalogByKey = computed(() => rolesStore.pageCatalogByKey)
const roleOptions = computed(() => rolesStore.configurableRoles)

function defaultPermission(): PagePermission {
  return {
    visible: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    selfViewOnly: false,
  }
}

function getPageLabel(page: string): string {
  return pageCatalogByKey.value[page]?.label || page
}

function isSelfViewConfigurable(page: string): boolean {
  return !!pageCatalogByKey.value[page]?.selfViewConfigurable
}

function copyPermission(permission: PagePermission | undefined): PagePermission {
  if (!permission) return defaultPermission()
  return { ...permission }
}

function hydrateLocalPermissions(titleId: string) {
  const remote = rolesStore.titlePermissions[titleId] || {}
  const next: Record<string, PagePermission> = {}
  for (const page of rolesStore.CONTROLLABLE_PAGES) {
    next[page] = copyPermission(remote[page])
  }
  localPermissions.value = next
}

function hydrateMetadata() {
  const selected = selectedTitle.value
  if (!selected) {
    editName.value = ''
    editDescription.value = ''
    editActive.value = true
    return
  }
  editName.value = selected.name
  editDescription.value = selected.description || ''
  editActive.value = selected.isActive
}

async function loadSelectedTitleState() {
  const titleId = selectedTitleId.value
  if (!titleId) {
    localPermissions.value = {}
    return
  }
  await rolesStore.fetchTitlePermissions(titleId)
  hydrateLocalPermissions(titleId)
  hydrateMetadata()
}

const hasPermissionChanges = computed(() => {
  if (!selectedTitleId.value) return false
  const remote = rolesStore.titlePermissions[selectedTitleId.value] || {}
  for (const page of rolesStore.CONTROLLABLE_PAGES) {
    const current = localPermissions.value[page] || defaultPermission()
    const savedPermission = remote[page] || defaultPermission()
    if (
      current.visible !== savedPermission.visible
      || current.canCreate !== savedPermission.canCreate
      || current.canEdit !== savedPermission.canEdit
      || current.canDelete !== savedPermission.canDelete
      || current.selfViewOnly !== savedPermission.selfViewOnly
    ) {
      return true
    }
  }
  return false
})

const hasMetadataChanges = computed(() => {
  const selected = selectedTitle.value
  if (!selected) return false
  return (
    editName.value.trim() !== selected.name
    || (editDescription.value.trim() || '') !== (selected.description || '')
    || editActive.value !== selected.isActive
  )
})

function ensurePermissionFor(page: string) {
  if (!localPermissions.value[page]) {
    localPermissions.value[page] = defaultPermission()
  }
  return localPermissions.value[page]!
}

function toggleVisible(page: string) {
  const permission = ensurePermissionFor(page)
  permission.visible = !permission.visible
  if (!permission.visible) {
    permission.canCreate = false
    permission.canEdit = false
    permission.canDelete = false
    permission.selfViewOnly = false
  }
}

function toggleCreate(page: string) {
  const permission = ensurePermissionFor(page)
  if (!permission.visible) return
  permission.canCreate = !permission.canCreate
}

function toggleEdit(page: string) {
  const permission = ensurePermissionFor(page)
  if (!permission.visible) return
  permission.canEdit = !permission.canEdit
}

function toggleDelete(page: string) {
  const permission = ensurePermissionFor(page)
  if (!permission.visible) return
  permission.canDelete = !permission.canDelete
}

function toggleSelfViewOnly(page: string) {
  const permission = ensurePermissionFor(page)
  if (!permission.visible) return
  permission.selfViewOnly = !permission.selfViewOnly
}

async function createTitle() {
  const name = createName.value.trim()
  if (!name) {
    error.value = 'Title name is required.'
    return
  }
  creatingTitle.value = true
  error.value = null
  try {
    await rolesStore.createTitle({
      name,
      key: createKey.value.trim() || undefined,
      description: createDescription.value.trim() || undefined,
      baseRole: createBaseRole.value || undefined,
    })
    const created = rolesStore.titles.find((entry) => entry.name === name)
    if (created) selectedTitleId.value = created.id
    createName.value = ''
    createKey.value = ''
    createDescription.value = ''
    createBaseRole.value = ''
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    creatingTitle.value = false
  }
}

async function saveMetadata() {
  if (!selectedTitle.value) return
  savingMetadata.value = true
  error.value = null
  saved.value = false
  try {
    await rolesStore.updateTitle(selectedTitle.value.id, {
      name: editName.value.trim(),
      description: editDescription.value.trim() || null,
      isActive: editActive.value,
    })
    hydrateMetadata()
    saved.value = true
    setTimeout(() => (saved.value = false), 2500)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    savingMetadata.value = false
  }
}

async function savePermissions() {
  if (!selectedTitle.value) return
  savingPermissions.value = true
  error.value = null
  saved.value = false
  try {
    await rolesStore.updateTitlePermissions(selectedTitle.value.id, localPermissions.value)
    saved.value = true
    setTimeout(() => (saved.value = false), 2500)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    savingPermissions.value = false
  }
}

watch(selectedTitleId, async () => {
  await loadSelectedTitleState()
})

onMounted(async () => {
  await rolesStore.fetchCatalog()
  await rolesStore.fetchTitles()
  if (!selectedTitleId.value && titles.value.length > 0) {
    selectedTitleId.value = titles.value[0]!.id
  } else if (selectedTitleId.value) {
    await loadSelectedTitleState()
  }
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <Shield :size="20" class="text-[#4857FE]" />
        Titles
      </h2>
      <p class="text-sm text-gray-500 mt-0.5">
        Manage configurable business titles and their permission profiles.
      </p>
    </div>

    <div
      v-if="saved"
      aria-live="polite"
      class="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5"
    >
      <CheckCircle2 :size="15" class="text-green-500" />
      <p class="text-sm text-green-700 font-medium">Title settings saved.</p>
    </div>

    <div v-if="error" aria-live="polite" class="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
      <p class="text-sm text-red-600">{{ error }}</p>
    </div>

    <div class="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <p class="text-sm font-medium text-gray-700">Create Title</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          v-model="createName"
          type="text"
          placeholder="Title name (e.g. QA Engineer)"
          class="px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
        />
        <input
          v-model="createKey"
          type="text"
          placeholder="Optional key (auto-generated if empty)"
          class="px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
        />
        <textarea
          v-model="createDescription"
          rows="2"
          placeholder="Description (optional)"
          class="px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
        />
        <div class="flex items-center gap-2">
          <select
            v-model="createBaseRole"
            class="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
          >
            <option value="">No base role template</option>
            <option v-for="role in roleOptions" :key="role.key" :value="role.key">
              {{ role.label }}
            </option>
          </select>
          <Button
            class="bg-[#4857FE] hover:bg-[#3E4BDE] h-9 px-4 text-sm font-medium"
            :disabled="creatingTitle"
            @click="createTitle"
          >
            <Loader2 v-if="creatingTitle" :size="14" class="animate-spin mr-1.5" />
            <Plus v-else :size="14" class="mr-1.5" />
            Create
          </Button>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="entry in titles"
        :key="entry.id"
        class="px-3 py-1.5 text-xs font-medium rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE] focus-visible:ring-offset-1"
        :class="selectedTitleId === entry.id
          ? 'bg-[#4857FE] text-white border-[#4857FE]'
          : 'bg-white text-gray-600 border-gray-200 hover:border-[#4857FE]/40'"
        @click="selectedTitleId = entry.id"
      >
        {{ entry.name }}
        <span v-if="!entry.isActive" class="ml-1 opacity-80">(archived)</span>
      </button>
    </div>

    <div v-if="selectedTitle" class="space-y-4">
      <div class="bg-white rounded-xl border border-gray-200 p-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="text-xs uppercase tracking-wide text-gray-400 font-medium">Name</label>
            <input
              v-model="editName"
              type="text"
              class="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
            />
          </div>
          <div>
            <label class="text-xs uppercase tracking-wide text-gray-400 font-medium">Key</label>
            <div class="mt-1 h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500 flex items-center">
              {{ selectedTitle.key }}
            </div>
          </div>
          <div class="md:col-span-2">
            <label class="text-xs uppercase tracking-wide text-gray-400 font-medium">Description</label>
            <textarea
              v-model="editDescription"
              rows="2"
              class="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4857FE]/20 focus:border-[#4857FE]"
            />
          </div>
          <div class="flex items-center justify-between md:col-span-2">
            <label class="text-sm text-gray-600 flex items-center gap-2">
              <User :size="14" />
              Active title
            </label>
            <button
              class="inline-flex items-center justify-center w-10 h-5 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE] focus-visible:ring-offset-1"
              :class="editActive ? 'bg-[#4857FE]' : 'bg-gray-300'"
              aria-label="Toggle title active status"
              @click="editActive = !editActive"
            >
              <span
                class="block w-3.5 h-3.5 rounded-full bg-white shadow-sm transform transition-transform duration-200"
                :class="editActive ? 'translate-x-2' : '-translate-x-2'"
              />
            </button>
          </div>
        </div>
        <div class="mt-3 flex justify-end">
          <Button
            class="bg-[#4857FE] hover:bg-[#3E4BDE] h-9 px-4 text-sm font-medium"
            :disabled="savingMetadata || !hasMetadataChanges"
            @click="saveMetadata"
          >
            <Loader2 v-if="savingMetadata" :size="14" class="animate-spin mr-1.5" />
            <Pencil v-else :size="14" class="mr-1.5" />
            Save Metadata
          </Button>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <p class="text-sm font-medium text-gray-700">Permissions</p>
          <Button
            class="bg-[#4857FE] hover:bg-[#3E4BDE] h-8 px-3 text-xs font-medium"
            :disabled="savingPermissions || !hasPermissionChanges"
            @click="savePermissions"
          >
            <Loader2 v-if="savingPermissions" :size="13" class="animate-spin mr-1.5" />
            <Trash2 v-else :size="13" class="mr-1.5 opacity-0" />
            Save Permissions
          </Button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-200 bg-gray-50/80">
                <th class="text-left py-3 px-4 font-medium text-gray-600 min-w-[160px]">Page</th>
                <th class="text-center py-3 px-4 font-medium text-gray-600 w-[100px]">Visible</th>
                <th class="text-center py-3 px-4 font-medium text-gray-600 w-[100px]">Create</th>
                <th class="text-center py-3 px-4 font-medium text-gray-600 w-[100px]">Edit</th>
                <th class="text-center py-3 px-4 font-medium text-gray-600 w-[110px]">Delete</th>
                <th class="text-center py-3 px-4 font-medium text-gray-600 w-[120px]">Self Only</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="page in rolesStore.CONTROLLABLE_PAGES"
                :key="page"
                class="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors"
                :class="{ 'opacity-40': !localPermissions[page]?.visible }"
              >
                <td class="py-2.5 px-4 font-medium text-gray-700">
                  {{ getPageLabel(page) }}
                </td>
                <td class="text-center py-2.5 px-4">
                  <button
                    class="inline-flex items-center justify-center w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE] focus-visible:ring-offset-1"
                    :class="localPermissions[page]?.visible ? 'bg-[#4857FE]' : 'bg-gray-300'"
                    :aria-label="`Toggle visibility for ${getPageLabel(page)} page`"
                    @click="toggleVisible(page)"
                  >
                    <span
                      class="block w-3.5 h-3.5 rounded-full bg-white shadow-sm transform transition-transform duration-200"
                      :class="localPermissions[page]?.visible ? 'translate-x-2' : '-translate-x-2'"
                    />
                  </button>
                </td>
                <td class="text-center py-2.5 px-4">
                  <button
                    class="inline-flex items-center justify-center w-9 h-5 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE] focus-visible:ring-offset-1"
                    :class="[
                      localPermissions[page]?.canCreate ? 'bg-[#4857FE]' : 'bg-gray-300',
                      localPermissions[page]?.visible ? 'cursor-pointer' : 'cursor-not-allowed'
                    ]"
                    :disabled="!localPermissions[page]?.visible"
                    :aria-label="`Toggle create permission for ${getPageLabel(page)} page`"
                    @click="toggleCreate(page)"
                  >
                    <span
                      class="block w-3.5 h-3.5 rounded-full bg-white shadow-sm transform transition-transform duration-200"
                      :class="localPermissions[page]?.canCreate ? 'translate-x-2' : '-translate-x-2'"
                    />
                  </button>
                </td>
                <td class="text-center py-2.5 px-4">
                  <button
                    class="inline-flex items-center justify-center w-9 h-5 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE] focus-visible:ring-offset-1"
                    :class="[
                      localPermissions[page]?.canEdit ? 'bg-[#4857FE]' : 'bg-gray-300',
                      localPermissions[page]?.visible ? 'cursor-pointer' : 'cursor-not-allowed'
                    ]"
                    :disabled="!localPermissions[page]?.visible"
                    :aria-label="`Toggle edit permission for ${getPageLabel(page)} page`"
                    @click="toggleEdit(page)"
                  >
                    <span
                      class="block w-3.5 h-3.5 rounded-full bg-white shadow-sm transform transition-transform duration-200"
                      :class="localPermissions[page]?.canEdit ? 'translate-x-2' : '-translate-x-2'"
                    />
                  </button>
                </td>
                <td class="text-center py-2.5 px-4">
                  <button
                    class="inline-flex items-center justify-center w-9 h-5 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4857FE] focus-visible:ring-offset-1"
                    :class="[
                      localPermissions[page]?.canDelete ? 'bg-[#4857FE]' : 'bg-gray-300',
                      localPermissions[page]?.visible ? 'cursor-pointer' : 'cursor-not-allowed'
                    ]"
                    :disabled="!localPermissions[page]?.visible"
                    :aria-label="`Toggle delete permission for ${getPageLabel(page)} page`"
                    @click="toggleDelete(page)"
                  >
                    <span
                      class="block w-3.5 h-3.5 rounded-full bg-white shadow-sm transform transition-transform duration-200"
                      :class="localPermissions[page]?.canDelete ? 'translate-x-2' : '-translate-x-2'"
                    />
                  </button>
                </td>
                <td class="text-center py-2.5 px-4">
                  <template v-if="isSelfViewConfigurable(page)">
                    <button
                      class="inline-flex items-center justify-center w-9 h-5 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-1"
                      :class="[
                        localPermissions[page]?.selfViewOnly ? 'bg-[#F59E0B]' : 'bg-gray-300',
                        localPermissions[page]?.visible ? 'cursor-pointer' : 'cursor-not-allowed'
                      ]"
                      :disabled="!localPermissions[page]?.visible"
                      :aria-label="`Toggle self-only visibility for ${getPageLabel(page)} page`"
                      @click="toggleSelfViewOnly(page)"
                    >
                      <span
                        class="block w-3.5 h-3.5 rounded-full bg-white shadow-sm transform transition-transform duration-200"
                        :class="localPermissions[page]?.selfViewOnly ? 'translate-x-2' : '-translate-x-2'"
                      />
                    </button>
                  </template>
                  <span v-else class="text-gray-300 text-xs">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
