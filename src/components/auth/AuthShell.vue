<script setup lang="ts">
import { computed } from 'vue'
import { Building2, ShieldCheck, Sparkles } from 'lucide-vue-next'

interface FeatureItem {
  title: string
  description: string
}

const props = withDefaults(defineProps<{
  title: string
  subtitle: string
  heroTitle?: string
  heroDescription?: string
  featureItems?: FeatureItem[]
}>(), {
  heroTitle: 'Built for enterprise delivery teams',
  heroDescription: 'Plan, execute, and ship with structured governance, trusted collaboration, and reliable delivery visibility.',
})

const defaultFeatureItems: FeatureItem[] = [
  {
    title: 'Organization-first access',
    description: 'Operate with centralized controls, role-aware boundaries, and workspace-level ownership.',
  },
  {
    title: 'Delivery intelligence',
    description: 'Keep roadmap, execution, and release signals aligned across teams and product streams.',
  },
  {
    title: 'Security and trust',
    description: 'Enterprise-grade defaults with auditable flows for critical product operations.',
  },
]

const featureItems = computed(() => (
  Array.isArray(props.featureItems) && props.featureItems.length > 0
    ? props.featureItems
    : defaultFeatureItems
))

const featureIcons = [Building2, Sparkles, ShieldCheck] as const
const trustSignals = [
  'Role-aware permissions',
  'Workspace-level governance',
  'Audit-friendly operations',
  'Cross-team visibility',
]
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-background text-foreground">
    <div class="pointer-events-none absolute inset-0 bg-linear-to-br from-primary/10 via-background to-background" />
    <div class="pointer-events-none absolute inset-0">
      <div class="absolute -top-44 left-[40%] h-120 w-120 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <div class="absolute -bottom-48 -right-12 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
    </div>

    <div class="relative mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-6 sm:px-8 lg:px-10">
      <div class="grid w-full items-stretch gap-6 lg:grid-cols-[1.12fr_0.88fr]">
        <section class="hidden rounded-4xl border border-border/60 bg-card/85 p-10 shadow-2xl shadow-primary/10 backdrop-blur lg:flex lg:flex-col lg:justify-between">
          <div class="space-y-7">
            <div class="inline-flex items-center gap-3 rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <img src="/logo.png" alt="Productier" class="h-6 w-6 rounded-lg" />
              Productier Platform
            </div>

            <div class="space-y-3">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Enterprise Operating Layer</p>
              <h2 class="max-w-xl text-3xl font-semibold leading-tight tracking-tight text-foreground">
                {{ heroTitle }}
              </h2>
              <p class="max-w-xl text-sm leading-relaxed text-muted-foreground">
                {{ heroDescription }}
              </p>
            </div>
          </div>

          <div class="space-y-4">
            <article
              v-for="(feature, index) in featureItems"
              :key="feature.title"
              class="flex items-start gap-3 rounded-2xl border border-border/80 bg-background/80 p-4"
            >
              <div class="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <component :is="featureIcons[index % featureIcons.length]" :size="16" />
              </div>
              <div>
                <h3 class="text-sm font-semibold text-foreground">{{ feature.title }}</h3>
                <p class="mt-1 text-sm text-muted-foreground">{{ feature.description }}</p>
              </div>
            </article>

            <div class="grid grid-cols-2 gap-3 pt-1">
              <div
                v-for="signal in trustSignals"
                :key="signal"
                class="rounded-xl border border-border/75 bg-background/70 px-3 py-2 text-xs font-medium text-muted-foreground"
              >
                {{ signal }}
              </div>
            </div>
          </div>
        </section>

        <section class="space-y-4 lg:hidden">
          <div class="rounded-2xl border border-border/60 bg-card/85 p-5 shadow-xl shadow-primary/10 backdrop-blur">
            <div class="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
              <img src="/logo.png" alt="Productier" class="h-5 w-5 rounded-md" />
              Enterprise Workspace
            </div>
            <h2 class="mt-3 text-xl font-semibold tracking-tight text-foreground">{{ heroTitle }}</h2>
            <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">{{ heroDescription }}</p>
          </div>
        </section>

        <section class="flex items-center justify-center">
          <div class="w-full max-w-[490px] rounded-4xl border border-border/70 bg-card/95 p-6 shadow-2xl shadow-primary/10 backdrop-blur sm:p-8">
            <div class="mb-6 space-y-3">
              <div class="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span class="h-1.5 w-1.5 rounded-full bg-primary" />
                Secure organization sign-in
              </div>
              <div class="inline-flex items-center gap-3 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground lg:hidden">
                <img src="/logo.png" alt="Productier" class="h-6 w-6 rounded-lg" />
                Productier Platform
              </div>
              <div class="hidden items-center gap-3 lg:flex">
                <img src="/logo.png" alt="Productier" class="h-10 w-10 rounded-xl" />
                <span class="text-sm font-medium text-muted-foreground">Productier</span>
              </div>
              <div>
                <h1 class="text-2xl font-semibold tracking-tight text-foreground">{{ title }}</h1>
                <p class="mt-1 text-sm text-muted-foreground">{{ subtitle }}</p>
              </div>
            </div>

            <slot />

            <div v-if="$slots.footer" class="mt-6 border-t border-border/70 pt-5">
              <slot name="footer" />
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
