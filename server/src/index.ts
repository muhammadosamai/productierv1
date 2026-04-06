import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { staticPlugin } from '@elysiajs/static'
import { storyRoutes } from './routes/stories'
import { taskRoutes } from './routes/tasks'
import { initiativeRoutes } from './routes/initiatives'
import { authRoutes } from './routes/auth'
import { activityRoutes } from './routes/activities'
import { productRoutes } from './routes/products'
import { deliveryRoutes } from './routes/deliveries'
import { settingsRoutes } from './routes/settings'
import { metricsRoutes } from './routes/metrics'
import { releaseRoutes } from './routes/releases'
import { serverRoutes } from './routes/servers'
import { testCycleRoutes } from './routes/testCycles'
import { favoriteRoutes } from './routes/favorites'
import { wikiRoutes } from './routes/wiki'
import { featureRequestRoutes } from './routes/featureRequests'
import { consumerFeedbackRoutes } from './routes/consumerFeedback'
import { rolesRoutes } from './routes/roles'
import { inviteRoutes } from './routes/invites'
import { issueRoutes } from './routes/issues'
import { formConfigRoutes, customFieldRoutes } from './routes/formConfigs'
import { searchRoutes } from './routes/search'
import { startDeadlineReminder } from './services/deadlineReminder'

const app = new Elysia()
  .use(cors({
    origin: 'http://localhost:5173',
  }))
  .use(staticPlugin({
    assets: 'uploads',
    prefix: '/uploads',
  }))
  .use(storyRoutes)
  .use(taskRoutes)
  .use(initiativeRoutes)
  .use(authRoutes)
  .use(activityRoutes)
  .use(productRoutes)
  .use(deliveryRoutes)
  .use(settingsRoutes)
  .use(metricsRoutes)
  .use(releaseRoutes)
  .use(serverRoutes)
  .use(testCycleRoutes)
  .use(favoriteRoutes)
  .use(wikiRoutes)
  .use(featureRequestRoutes)
  .use(consumerFeedbackRoutes)
  .use(rolesRoutes)
  .use(inviteRoutes)
  .use(issueRoutes)
  .use(searchRoutes)
  .use(formConfigRoutes)
  .use(customFieldRoutes)
  .get('/api/health', () => ({ status: 'ok' }))
  .listen(3001)

console.log(`Server running at http://localhost:${app.server?.port}`)

startDeadlineReminder()
