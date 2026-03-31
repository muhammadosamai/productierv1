<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  Building2,
  Check,
  Copy,
  Loader2,
  MailPlus,
  Plus,
  Rocket,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-vue-next'
import { useOnboardingStore } from '@/stores/onboarding'
import { useAuthStore } from '@/stores/auth'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

type WizardStep = 'organization' | 'workspace' | 'invites'
type InviteRole = 'owner' | 'admin' | 'member' | 'viewer'

interface InviteRow {
  id: string
  email: string
  role: InviteRole
}

const router = useRouter()
const onboardingStore = useOnboardingStore()
const authStore = useAuthStore()

const orgName = ref('')
const orgDescription = ref('')
const orgLogo = ref<string | null>(null)
const workspaceName = ref('')
const workspaceDescription = ref('')
const inviteRows = ref<InviteRow[]>([])
const localError = ref<string | null>(null)
const copiedInviteId = ref<string | null>(null)
const initialized = ref(false)
const currentViewStep = ref<WizardStep>('organization')
const resumeStepAfterOrganizationSave = ref<WizardStep | null>(null)
const organizationLogoInputRef = ref<HTMLInputElement | null>(null)
const hydratedOrganizationId = ref<string | null>(null)

function createRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createInviteRow(role: InviteRole = 'member'): InviteRow {
  return {
    id: createRowId(),
    email: '',
    role,
  }
}

function resetInviteRows() {
  inviteRows.value = [createInviteRow(canAssignOwnerRole.value ? 'member' : 'member')]
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

const serverStep = computed<WizardStep>(() => {
  const step = onboardingStore.progress.currentStep
  if (step === 'workspace' || step === 'invites') return step
  if (step === 'completed') return 'invites'
  return 'organization'
})

function stepToIndex(step: WizardStep): number {
  if (step === 'organization') return 0
  if (step === 'workspace') return 1
  return 2
}

const maxAccessibleStepIndex = computed(() => stepToIndex(serverStep.value))
const effectiveStep = computed<WizardStep>(() => {
  const requestedIndex = stepToIndex(currentViewStep.value)
  return requestedIndex <= maxAccessibleStepIndex.value ? currentViewStep.value : serverStep.value
})

const activeOrganizationId = computed(() => onboardingStore.activeOrganizationId)
const activeOrganization = computed(() => onboardingStore.activeOrganization)
const pendingInvites = computed(() => onboardingStore.invites.filter((item) => item.status === 'pending'))
const hasWorkspace = computed(() => Number(activeOrganization.value?.workspaceCount || 0) > 0)
const canAssignOwnerRole = computed(() => activeOrganization.value?.role === 'owner')
const activeError = computed(() => localError.value || onboardingStore.error)
const isInitialLoading = computed(() => !initialized.value && onboardingStore.loading)

const roleOptions = computed(() => {
  const base: Array<{ value: InviteRole; label: string }> = [
    { value: 'admin', label: 'Admin' },
    { value: 'member', label: 'Member' },
    { value: 'viewer', label: 'Viewer' },
  ]
  if (canAssignOwnerRole.value) {
    return [{ value: 'owner', label: 'Owner' }, ...base]
  }
  return base
})

const steps = computed(() => [
  {
    id: 'organization' as const,
    label: 'Organization Profile',
    description: 'Identity, branding, and governance root',
    icon: Building2,
  },
  {
    id: 'workspace' as const,
    label: 'First Workspace (Product)',
    description: 'Workspace in Productier means your product workspace',
    icon: Rocket,
  },
  {
    id: 'invites' as const,
    label: 'Team Invites & Roles',
    description: 'Invite teammates and assign organization roles',
    icon: MailPlus,
  },
])

const stepHeadline = computed(() => {
  if (effectiveStep.value === 'organization') {
    return {
      title: activeOrganizationId.value ? 'Update organization profile' : 'Create organization profile',
      subtitle: 'Set the organization identity that owns your Productier workspaces, teams, and governance.',
    }
  }
  if (effectiveStep.value === 'workspace') {
    return {
      title: 'Set up your first workspace (product)',
      subtitle: 'In Productier, a workspace is your product delivery space where stories, tasks, and releases live.',
    }
  }
  return {
    title: 'Invite your team and assign roles',
    subtitle: 'Add teammates with role-aware access now, or skip and complete onboarding to configure later.',
  }
})

function formatSkippedReason(reason: string): string {
  const dictionary: Record<string, string> = {
    invalid_email: 'Invalid email format',
    cannot_invite_self: 'Cannot invite your own account',
    owner_role_requires_owner: 'Only organization owners can invite other owners',
    already_member: 'User is already an organization member',
    invalid_workspace: 'Selected workspace is invalid for this organization',
    invalid_team: 'Selected team is invalid for this organization',
    invalid_title: 'Selected title is invalid or archived',
  }
  return dictionary[reason] || reason.replace(/_/g, ' ')
}

function hydrateOrganizationFieldsFromStore(force = false) {
  const organization = activeOrganization.value
  if (!organization) return
  if (!force && hydratedOrganizationId.value === organization.id) return
  hydratedOrganizationId.value = organization.id
  orgName.value = organization.name
  orgDescription.value = organization.description || ''
  orgLogo.value = organization.logo || null
  if (!workspaceName.value.trim()) {
    workspaceName.value = `${organization.name} Workspace`
  }
}

async function ensureInvitesLoaded() {
  const organizationId = activeOrganizationId.value
  if (!organizationId) return
  await onboardingStore.fetchInvites(organizationId)
}

async function initialize() {
  localError.value = null
  initialized.value = false
  const loaded = await onboardingStore.fetchState()
  initialized.value = true
  if (!loaded) return

  if (onboardingStore.isOnboardingComplete) {
    router.replace('/home')
    return
  }

  hydrateOrganizationFieldsFromStore(true)
  currentViewStep.value = serverStep.value
  resetInviteRows()
  if (serverStep.value === 'invites') {
    await ensureInvitesLoaded()
  }
}

function goToStep(step: WizardStep) {
  if (stepToIndex(step) > maxAccessibleStepIndex.value) return
  currentViewStep.value = step
}

function openOrganizationEditor(fromStep?: WizardStep) {
  resumeStepAfterOrganizationSave.value = fromStep || null
  goToStep('organization')
}

function triggerOrganizationLogoPicker() {
  organizationLogoInputRef.value?.click()
}

async function onOrganizationLogoSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  if (!file.type.startsWith('image/')) {
    localError.value = 'Organization logo must be an image file.'
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    localError.value = 'Organization logo must be smaller than 5MB.'
    return
  }

  localError.value = null
  const uploadedLogo = await onboardingStore.uploadOrganizationLogo(file, activeOrganizationId.value)
  if (!uploadedLogo) return
  orgLogo.value = uploadedLogo
}

function removeOrganizationLogo() {
  orgLogo.value = null
}

async function saveOrganizationProfile() {
  localError.value = null
  const name = orgName.value.trim()
  if (!name) {
    localError.value = 'Organization name is required.'
    return
  }

  const payload = {
    name,
    description: orgDescription.value.trim() || null,
    logo: orgLogo.value,
  }

  let success = false
  if (activeOrganizationId.value) {
    success = await onboardingStore.updateOrganizationProfile({
      organizationId: activeOrganizationId.value,
      ...payload,
    })
  } else {
    success = await onboardingStore.createOrganization(payload)
  }
  if (!success) return

  hydrateOrganizationFieldsFromStore(true)
  const returnStep = resumeStepAfterOrganizationSave.value
  resumeStepAfterOrganizationSave.value = null
  if (returnStep) {
    goToStep(returnStep)
    if (returnStep === 'invites') {
      await ensureInvitesLoaded()
    }
    return
  }
  goToStep('workspace')
}

async function createWorkspace() {
  localError.value = null
  const organizationId = activeOrganizationId.value
  if (!organizationId) {
    localError.value = 'Create or select an organization before adding a workspace.'
    return
  }

  if (hasWorkspace.value) {
    await ensureInvitesLoaded()
    goToStep('invites')
    return
  }

  const name = workspaceName.value.trim()
  if (!name) {
    localError.value = 'Workspace name is required.'
    return
  }

  const success = await onboardingStore.createWorkspace({
    organizationId,
    name,
    description: workspaceDescription.value.trim() || null,
  })
  if (!success) return

  await ensureInvitesLoaded()
  goToStep('invites')
}

function addInviteRow() {
  inviteRows.value = [...inviteRows.value, createInviteRow()]
}

function removeInviteRow(rowId: string) {
  if (inviteRows.value.length <= 1) {
    resetInviteRows()
    return
  }
  inviteRows.value = inviteRows.value.filter((row) => row.id !== rowId)
}

async function sendInvites() {
  localError.value = null
  const organizationId = activeOrganizationId.value
  if (!organizationId) {
    localError.value = 'Organization context is missing.'
    return
  }

  const uniqueInvites: Array<{ email: string; role: InviteRole }> = []
  const seenEmails = new Set<string>()
  for (const row of inviteRows.value) {
    const normalizedEmail = row.email.trim().toLowerCase()
    if (!normalizedEmail) continue
    if (!isLikelyEmail(normalizedEmail)) {
      localError.value = `Invalid email: ${row.email}`
      return
    }
    if (seenEmails.has(normalizedEmail)) continue
    seenEmails.add(normalizedEmail)
    uniqueInvites.push({
      email: normalizedEmail,
      role: row.role === 'owner' && !canAssignOwnerRole.value ? 'member' : row.role,
    })
  }

  if (uniqueInvites.length === 0) {
    localError.value = 'Add at least one valid teammate email.'
    return
  }

  const success = await onboardingStore.createInvites({
    organizationId,
    invites: uniqueInvites,
  })
  if (!success) return
  resetInviteRows()
}

async function copyInviteLink(inviteId: string, link: string) {
  try {
    await navigator.clipboard.writeText(link)
    copiedInviteId.value = inviteId
    window.setTimeout(() => {
      if (copiedInviteId.value === inviteId) copiedInviteId.value = null
    }, 1600)
  } catch {
    localError.value = 'Could not copy invite link. Copy it manually instead.'
  }
}

async function cancelInvite(inviteId: string) {
  localError.value = null
  await onboardingStore.cancelInvite(inviteId)
}

async function finishOnboarding() {
  localError.value = null
  const success = await onboardingStore.completeOnboarding(activeOrganizationId.value || undefined)
  if (!success) return
  router.push('/home')
}

async function cancelSignup() {
  const shouldCancel = window.confirm(
    'Cancel signup and delete this in-progress account setup? This will remove your draft organization and return you to registration.'
  )
  if (!shouldCancel) return
  localError.value = null
  const cancelled = await onboardingStore.cancelSignupDraft()
  if (!cancelled) {
    localError.value = onboardingStore.error || 'Failed to cancel signup.'
    return
  }
  authStore.logout()
  router.replace('/register')
}

watch(serverStep, () => {
  if (stepToIndex(currentViewStep.value) > maxAccessibleStepIndex.value) {
    currentViewStep.value = serverStep.value
  }
})

watch(canAssignOwnerRole, (allowed) => {
  if (allowed) return
  inviteRows.value = inviteRows.value.map((row) => (
    row.role === 'owner'
      ? { ...row, role: 'member' }
      : row
  ))
})

watch(activeOrganizationId, async (organizationId) => {
  if (!organizationId) return
  hydrateOrganizationFieldsFromStore(true)
  if (effectiveStep.value === 'invites') {
    await ensureInvitesLoaded()
  }
})

watch(() => onboardingStore.isOnboardingComplete, (completed) => {
  if (completed) {
    router.replace('/home')
  }
})

watch(effectiveStep, async (step) => {
  if (step === 'invites') {
    await ensureInvitesLoaded()
  }
})

onMounted(() => {
  if (!authStore.isAuthenticated) {
    router.replace('/login')
    return
  }
  resetInviteRows()
  void initialize()
})
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-background p-4 text-foreground sm:p-8">
    <div class="pointer-events-none absolute inset-0 bg-linear-to-br from-primary/8 via-background to-background" />
    <div class="pointer-events-none absolute inset-0">
      <div class="absolute -top-44 left-1/2 h-120 w-120 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <div class="absolute -bottom-44 -right-8 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
    </div>

    <div class="relative mx-auto w-full max-w-7xl">
      <div v-if="isInitialLoading" class="flex min-h-[68vh] items-center justify-center">
        <div class="rounded-3xl border border-border/70 bg-card/95 px-6 py-8 shadow-2xl shadow-primary/10">
          <div class="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 :size="18" class="animate-spin text-primary" />
            Loading onboarding workspace...
          </div>
        </div>
      </div>

      <div v-else class="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside class="rounded-3xl border border-border/70 bg-card/95 p-5 shadow-xl shadow-primary/10">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Onboarding</p>
          <h1 class="mt-2 text-xl font-semibold text-foreground">Enterprise setup flow</h1>
          <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Establish your organization foundation, then launch your first workspace and team access model.
          </p>

          <div class="mt-5 space-y-3">
            <article
              v-for="step in steps"
              :key="step.id"
              class="rounded-2xl border px-3.5 py-3"
              :class="effectiveStep === step.id
                ? 'border-primary/40 bg-primary/10'
                : stepToIndex(step.id) < maxAccessibleStepIndex
                  ? 'border-emerald-500/30 bg-emerald-500/10'
                  : 'border-border/80 bg-background/70'"
            >
              <div class="flex items-start gap-3">
                <div
                  class="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg"
                  :class="effectiveStep === step.id
                    ? 'bg-primary/20 text-primary'
                    : stepToIndex(step.id) < maxAccessibleStepIndex
                      ? 'bg-emerald-500/20 text-emerald-600'
                      : 'bg-muted text-muted-foreground'"
                >
                  <Check v-if="stepToIndex(step.id) < maxAccessibleStepIndex" :size="15" />
                  <component v-else :is="step.icon" :size="15" />
                </div>
                <div>
                  <p class="text-sm font-semibold text-foreground">{{ step.label }}</p>
                  <p class="mt-1 text-xs text-muted-foreground">{{ step.description }}</p>
                </div>
              </div>
            </article>
          </div>

          <div class="mt-5 rounded-2xl border border-border/80 bg-background/70 p-3.5">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Current Organization</p>
            <p class="mt-1 text-sm font-medium text-foreground">
              {{ activeOrganization?.name || 'Not created yet' }}
            </p>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ activeOrganization?.workspaceCount || 0 }} workspace(s) · {{ activeOrganization?.pendingInviteCount || 0 }} pending invite(s)
            </p>
          </div>
        </aside>

        <section class="rounded-3xl border border-border/70 bg-card/95 p-6 shadow-2xl shadow-primary/10 sm:p-8">
          <header class="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div class="space-y-2">
              <div class="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-xs text-muted-foreground">
                <span class="h-1.5 w-1.5 rounded-full bg-primary" />
                Setup checkpoint
              </div>
              <h2 class="text-2xl font-semibold tracking-tight text-foreground">{{ stepHeadline.title }}</h2>
              <p class="text-sm leading-relaxed text-muted-foreground">{{ stepHeadline.subtitle }}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="h-9"
              :disabled="onboardingStore.submitting"
              @click="cancelSignup"
            >
              Cancel signup
            </Button>
          </header>

          <div
            v-if="activeError"
            class="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {{ activeError }}
          </div>

          <form v-if="effectiveStep === 'organization'" class="space-y-6" @submit.prevent="saveOrganizationProfile">
            <div class="rounded-2xl border border-border/80 bg-background/80 p-4">
              <p class="text-sm font-medium text-foreground">Organization branding</p>
              <p class="mt-1 text-xs text-muted-foreground">
                These details appear across invites and workspace ownership context. You can update them later.
              </p>
            </div>

            <div class="grid gap-5 lg:grid-cols-[1fr_240px]">
              <div class="space-y-4">
                <div class="space-y-1.5">
                  <label class="text-sm font-medium text-foreground">Organization Name</label>
                  <Input
                    v-model="orgName"
                    class="h-11 bg-background"
                    placeholder="Acme Product Group"
                    required
                  />
                </div>

                <div class="space-y-1.5">
                  <label class="text-sm font-medium text-foreground">Description (optional)</label>
                  <Textarea
                    v-model="orgDescription"
                    class="min-h-28 bg-background"
                    placeholder="What does this organization build and how is delivery structured?"
                  />
                </div>
              </div>

              <div class="space-y-2">
                <p class="text-sm font-medium text-foreground">Organization Logo</p>
                <div class="flex h-36 items-center justify-center rounded-xl border border-dashed border-border bg-background/80">
                  <img
                    v-if="orgLogo"
                    :src="orgLogo"
                    alt="Organization logo preview"
                    class="h-20 w-20 rounded-xl object-cover"
                  >
                  <Building2 v-else :size="30" class="text-muted-foreground" />
                </div>
                <div class="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    class="h-9"
                    :disabled="onboardingStore.logoUploading"
                    @click="triggerOrganizationLogoPicker"
                  >
                    <Loader2 v-if="onboardingStore.logoUploading" :size="14" class="mr-1.5 animate-spin" />
                    <Upload v-else :size="14" class="mr-1.5" />
                    {{ orgLogo ? 'Replace logo' : 'Upload logo' }}
                  </Button>
                  <Button
                    v-if="orgLogo"
                    type="button"
                    variant="ghost"
                    size="sm"
                    class="h-9"
                    @click="removeOrganizationLogo"
                  >
                    <X :size="14" class="mr-1.5" />
                    Remove
                  </Button>
                </div>
                <p class="text-xs text-muted-foreground">PNG, JPG, GIF, WEBP, or SVG up to 5MB.</p>
                <input
                  ref="organizationLogoInputRef"
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                  class="hidden"
                  @change="onOrganizationLogoSelected"
                >
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <Button type="submit" class="h-11" :disabled="onboardingStore.submitting || !orgName.trim()">
                <Loader2 v-if="onboardingStore.submitting" :size="16" class="mr-2 animate-spin" />
                {{ activeOrganizationId ? 'Save organization profile' : 'Save and continue' }}
              </Button>
              <Button
                v-if="resumeStepAfterOrganizationSave"
                type="button"
                variant="outline"
                class="h-11"
                @click="goToStep(resumeStepAfterOrganizationSave)"
              >
                Cancel and return
              </Button>
            </div>
          </form>

          <form v-else-if="effectiveStep === 'workspace'" class="space-y-6" @submit.prevent="createWorkspace">
            <div class="rounded-2xl border border-primary/30 bg-primary/10 p-4">
              <p class="text-sm font-semibold text-foreground">Workspace = Product in Productier</p>
              <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
                Each workspace represents a product delivery space with its own backlog, execution flow, and release lifecycle.
              </p>
            </div>

            <div
              v-if="hasWorkspace"
              class="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700"
            >
              Your first workspace already exists. You can create another one now or continue to team invites.
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-medium text-foreground">Workspace Name</label>
              <Input
                v-model="workspaceName"
                class="h-11 bg-background"
                placeholder="Core Platform Product"
                required
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-medium text-foreground">Workspace Description (optional)</label>
              <Textarea
                v-model="workspaceDescription"
                class="min-h-28 bg-background"
                placeholder="Describe the mission, teams, and delivery scope for this product workspace."
              />
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" class="h-11" @click="openOrganizationEditor()">
                <ArrowLeft :size="15" class="mr-2" />
                Back to organization profile
              </Button>
              <Button type="submit" class="h-11" :disabled="onboardingStore.submitting || !workspaceName.trim()">
                <Loader2 v-if="onboardingStore.submitting" :size="16" class="mr-2 animate-spin" />
                {{ hasWorkspace ? 'Continue to invites' : 'Create workspace and continue' }}
              </Button>
            </div>
          </form>

          <div v-else class="space-y-6">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="rounded-2xl border border-border/80 bg-background/70 p-4">
                <p class="text-sm font-semibold text-foreground">Role-aware access controls</p>
                <p class="mt-1 text-xs text-muted-foreground">
                  Owners control governance, admins manage operations, members collaborate, and viewers stay informed.
                </p>
              </div>
              <Button type="button" variant="outline" class="h-10" @click="openOrganizationEditor('invites')">
                Edit organization profile
              </Button>
            </div>

            <form class="space-y-4 rounded-2xl border border-border bg-background/75 p-4" @submit.prevent="sendInvites">
              <div class="space-y-3">
                <article
                  v-for="(row, index) in inviteRows"
                  :key="row.id"
                  class="grid gap-3 rounded-xl border border-border/80 bg-card/80 p-3 md:grid-cols-[1fr_180px_auto]"
                >
                  <div class="space-y-1.5">
                    <label class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Teammate Email {{ index + 1 }}
                    </label>
                    <Input
                      v-model="row.email"
                      class="h-10 bg-background"
                      placeholder="name@company.com"
                      type="email"
                    />
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Org Role</label>
                    <select
                      v-model="row.role"
                      class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <option v-for="option in roleOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </option>
                    </select>
                  </div>
                  <div class="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      class="h-10 text-muted-foreground hover:text-destructive"
                      @click="removeInviteRow(row.id)"
                    >
                      <X :size="14" class="mr-1.5" />
                      Remove
                    </Button>
                  </div>
                </article>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" class="h-9" @click="addInviteRow">
                  <Plus :size="14" class="mr-1.5" />
                  Add person
                </Button>
                <p v-if="!canAssignOwnerRole" class="text-xs text-muted-foreground">
                  Owner invites are restricted to current organization owners.
                </p>
              </div>

              <Button type="submit" class="h-11" :disabled="onboardingStore.submitting">
                <Loader2 v-if="onboardingStore.submitting" :size="16" class="mr-2 animate-spin" />
                Create invite links
              </Button>
            </form>

            <div v-if="onboardingStore.lastSkippedInvites.length > 0" class="rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm">
              <p class="font-medium text-amber-700">Some invites were skipped:</p>
              <ul class="mt-2 space-y-1 text-amber-700/90">
                <li v-for="item in onboardingStore.lastSkippedInvites" :key="`${item.email}-${item.reason}`">
                  {{ item.email }} - {{ formatSkippedReason(item.reason) }}
                </li>
              </ul>
            </div>

            <div v-if="onboardingStore.lastCreatedInviteLinks.length > 0" class="space-y-3">
              <p class="text-sm font-semibold text-foreground">Generated invite links</p>
              <article
                v-for="item in onboardingStore.lastCreatedInviteLinks"
                :key="item.id"
                class="flex flex-col gap-2 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-foreground">{{ item.email }}</p>
                  <p class="truncate text-xs text-muted-foreground">{{ item.inviteLink }}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="h-9"
                  @click="copyInviteLink(item.id, item.inviteLink)"
                >
                  <Check v-if="copiedInviteId === item.id" :size="14" />
                  <Copy v-else :size="14" />
                  {{ copiedInviteId === item.id ? 'Copied' : 'Copy link' }}
                </Button>
              </article>
            </div>

            <div class="space-y-3">
              <div class="flex items-center gap-2">
                <p class="text-sm font-semibold text-foreground">Pending invites</p>
                <Loader2 v-if="onboardingStore.invitesLoading" :size="14" class="animate-spin text-primary" />
              </div>
              <p v-if="pendingInvites.length === 0" class="text-sm text-muted-foreground">
                No pending invites yet.
              </p>
              <article
                v-for="invite in pendingInvites"
                :key="invite.id"
                class="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2"
              >
                <div>
                  <p class="text-sm font-medium text-foreground">
                    {{ invite.email }}
                    <span class="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {{ invite.role }}
                    </span>
                  </p>
                  <p class="text-xs text-muted-foreground">Expires {{ new Date(invite.expiresAt).toLocaleDateString() }}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  class="h-8 text-muted-foreground hover:text-destructive"
                  :disabled="onboardingStore.submitting"
                  @click="cancelInvite(invite.id)"
                >
                  Cancel
                </Button>
              </article>
            </div>

            <div class="grid gap-3 border-t border-border pt-5 sm:grid-cols-3">
              <Button type="button" variant="outline" class="h-11" @click="goToStep('workspace')">
                <ArrowLeft :size="15" class="mr-2" />
                Back to workspace setup
              </Button>
              <Button type="button" variant="ghost" class="h-11" :disabled="onboardingStore.submitting" @click="finishOnboarding">
                Skip invites for now
              </Button>
              <Button type="button" class="h-11" :disabled="onboardingStore.submitting" @click="finishOnboarding">
                <Loader2 v-if="onboardingStore.submitting" :size="16" class="mr-2 animate-spin" />
                Finish onboarding
              </Button>
            </div>

            <div class="rounded-2xl border border-border/80 bg-background/70 p-4 text-sm text-muted-foreground">
              <div class="flex items-start gap-2">
                <ShieldCheck :size="16" class="mt-0.5 text-primary" />
                You can always manage members and roles later in organization settings after onboarding is complete.
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
