import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useRolesStore } from '@/stores/roles'
import { useOnboardingStore } from '@/stores/onboarding'

const envFlags = import.meta.env as Record<string, string | undefined>
const onboardingEnabled = String(
  envFlags.VITE_NEW_ONBOARDING_ENABLED
  ?? envFlags.NEW_ONBOARDING_ENABLED
  ?? 'true',
).toLowerCase() !== 'false'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // Auth pages (guest layout — no sidebars)
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { guest: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
      meta: { guest: true },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('../views/ForgotPasswordView.vue'),
      meta: { guest: true },
    },
    {
      path: '/onboarding',
      name: 'onboarding',
      component: () => import('../views/OnboardingView.vue'),
      meta: { requiresAuth: true, standalone: true },
    },
    {
      path: '/onboarding/accept-invite',
      name: 'onboarding-accept-invite',
      component: () => import('../views/OnboardingAcceptInviteView.vue'),
      meta: { requiresAuth: true, standalone: true },
    },

    // App pages (require auth)
    {
      path: '/',
      redirect: '/home',
    },
    {
      path: '/overview',
      redirect: '/dashboard',
    },
    {
      path: '/metrics',
      redirect: '/dashboard',
    },
    {
      path: '/home',
      name: 'home',
      component: () => import('../views/HomeDashboardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/users',
      name: 'users',
      component: () => import('../views/UsersView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/integrations',
      name: 'integrations',
      component: () => import('../views/IntegrationsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/stories',
      name: 'stories',
      component: () => import('../views/StoriesListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/tasks',
      name: 'tasks-list',
      component: () => import('../views/TasksListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/backlog',
      redirect: '/stories',
    },
    {
      path: '/initiatives',
      name: 'initiatives',
      component: () => import('../views/InitiativesListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/initiatives/:id',
      name: 'initiative',
      component: () => import('../views/InitiativeView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/deliveries',
      name: 'deliveries',
      component: () => import('../views/DeliveriesListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/deliveries/:id',
      name: 'delivery',
      component: () => import('../views/DeliveryView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/wiki',
      name: 'wiki',
      component: () => import('../views/WikiView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/team',
      name: 'team',
      component: () => import('../views/TeamListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/MetricsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/releases',
      name: 'releases',
      component: () => import('../views/ReleasesView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/releases/:id',
      name: 'release',
      component: () => import('../views/ReleaseView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/test-cycles',
      name: 'test-cycles',
      component: () => import('../views/TestCyclesListView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/test-cycles/:id',
      name: 'test-cycle',
      component: () => import('../views/TestCycleView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/issues',
      name: 'issues',
      component: () => import('../views/IssuesView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/feedbacks',
      name: 'feedbacks',
      component: () => import('../views/FeedbacksView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/feature-requests',
      name: 'feature-requests',
      component: () => import('../views/FeatureRequestsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/settings',
      name: 'settings',
      redirect: (to) => {
        const requestedTab = typeof to.query.tab === 'string' ? to.query.tab : ''
        if (requestedTab === 'notifications') return '/settings/notifications'
        if (requestedTab === 'roles') return '/settings/organization/roles'
        if (requestedTab === 'titles') return '/settings/organization/titles'
        return '/settings/profile'
      },
      meta: { requiresAuth: true },
    },
    {
      path: '/settings/profile',
      name: 'settings-profile',
      component: () => import('../views/SettingsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/settings/notifications',
      name: 'settings-notifications',
      component: () => import('../views/SettingsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/settings/organization',
      name: 'settings-organization',
      redirect: '/settings/organization/members',
      meta: { requiresAuth: true },
    },
    {
      path: '/settings/organization/members',
      name: 'settings-organization-members',
      component: () => import('../views/SettingsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/settings/organization/roles',
      name: 'settings-organization-roles',
      component: () => import('../views/SettingsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/settings/organization/titles',
      name: 'settings-organization-titles',
      component: () => import('../views/SettingsView.vue'),
      meta: { requiresAuth: true },
    },
  ],
})

// Navigation guard
router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  const rolesStore = useRolesStore()
  const onboardingStore = useOnboardingStore()

  // Wait for auth to initialize on first load
  if (!authStore.initialized) {
    await authStore.init()
  }

  const isOnboardingRoute = to.name === 'onboarding' || to.name === 'onboarding-accept-invite'
  const isInviteAcceptRoute = to.name === 'onboarding-accept-invite'

  if (!onboardingEnabled && isOnboardingRoute) {
    if (authStore.isAuthenticated) return '/home'
    return '/login'
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    if (isInviteAcceptRoute) {
      return {
        path: '/login',
        query: { redirect: to.fullPath },
      }
    }
    return '/login'
  }

  if (to.meta.guest && authStore.isAuthenticated) {
    return '/'
  }

  if (to.meta.requiresAuth && authStore.isAuthenticated) {
    if (onboardingEnabled) {
      const currentUserId = authStore.user?.id || null
      const shouldFetchOnboardingState = (
        !onboardingStore.loaded
        || onboardingStore.loadedForUserId !== currentUserId
      )
      if (
        shouldFetchOnboardingState &&
        !onboardingStore.loading
      ) {
        const loadedSuccessfully = await onboardingStore.fetchState()
        if (!loadedSuccessfully && !onboardingStore.loaded && !isOnboardingRoute) {
          return '/onboarding'
        }
      }
    }

    if (onboardingEnabled && onboardingStore.loaded) {
      if (!onboardingStore.isOnboardingComplete && !isOnboardingRoute) {
        return '/onboarding'
      }
      if (onboardingStore.isOnboardingComplete && to.name === 'onboarding') {
        return '/home'
      }
    }

    if (isOnboardingRoute) return true

    // Fetch role permissions if not loaded yet
    if (
      authStore.user?.role !== 'super_admin'
      && (!rolesStore.loaded || rolesStore.loadedForUserId !== authStore.user?.id)
    ) {
      await rolesStore.fetchMyPermissions()
    }
    if (authStore.user?.role === 'super_admin') {
      await rolesStore.fetchCatalog()
    }

    // Check if user can access this route
    if (!rolesStore.canAccessRoute(to.path)) {
      const fallbackRoute = rolesStore.firstAccessibleRoute
      if (fallbackRoute && fallbackRoute !== to.path) {
        return fallbackRoute
      }
      return '/login'
    }
  }

  return true
})

export default router
