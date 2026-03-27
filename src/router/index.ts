import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useRolesStore } from '@/stores/roles'

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

    // App pages (require auth)
    {
      path: '/',
      redirect: '/home',
    },
    {
      path: '/overview',
      redirect: '/metrics',
    },
    {
      path: '/home',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
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
      path: '/metrics',
      name: 'metrics',
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
      component: () => import('../views/SettingsView.vue'),
      meta: { requiresAuth: true },
    },
  ],
})

// Navigation guard
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  const rolesStore = useRolesStore()

  // Wait for auth to initialize on first load
  if (!authStore.initialized) {
    await authStore.init()
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } else if (to.meta.guest && authStore.isAuthenticated) {
    next('/')
  } else if (to.meta.requiresAuth && authStore.isAuthenticated) {
    // Fetch role permissions if not loaded yet
    if (!rolesStore.loaded && authStore.user?.role !== 'super_admin') {
      await rolesStore.fetchMyPermissions()
    }

    // Check if user can access this route
    if (!rolesStore.canAccessRoute(to.path)) {
      // Redirect to first accessible page
      next('/home')
    } else {
      next()
    }
  } else {
    next()
  }
})

export default router
