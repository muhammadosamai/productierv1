import { db } from './index'
import { stories, tasks, users } from './schema'

async function seed() {
  console.log('Seeding database...')

  // Clear existing data
  await db.delete(tasks)
  await db.delete(stories)

  // Create a seed user to satisfy createdByUserId FK
  const [seedUser] = await db.insert(users).values({
    name: 'Seed User',
    email: 'seed@example.com',
    password: 'placeholder',
    role: 'admin',
  }).onConflictDoNothing().returning()

  // Insert stories matching existing hardcoded data
  const [darkMode] = await db.insert(stories).values({
    title: 'Add dark mode support',
    description: 'Users have requested dark mode',
    type: 'feature',
    priority: 'medium',
    status: 'backlog',
    product: 'Product',
  }).returning()

  const [exportCsv] = await db.insert(stories).values({
    title: 'Export to CSV',
    description: 'Allow users to export data',
    type: 'feature',
    priority: 'low',
    status: 'backlog',
    product: 'Product',
  }).returning()

  const [webhooks] = await db.insert(stories).values({
    title: 'Webhook integrations',
    description: 'Support third-party webhook callbacks',
    type: 'feature',
    priority: 'medium',
    status: 'in_progress',
    product: 'Product',
  }).returning()

  const [i18n] = await db.insert(stories).values({
    title: 'Multi-language support',
    description: 'i18n framework integration',
    type: 'research',
    priority: 'low',
    status: 'backlog',
    product: 'Product',
  }).returning()

  const userId = seedUser!.id

  // Add sample tasks
  await db.insert(tasks).values([
    { title: 'Research CSS custom properties approach', status: 'done', storyId: darkMode!.id, productId: 'Product', createdByUserId: userId },
    { title: 'Implement theme toggle component', status: 'created', storyId: darkMode!.id, productId: 'Product', createdByUserId: userId },
    { title: 'Update color palette for dark theme', status: 'created', storyId: darkMode!.id, productId: 'Product', createdByUserId: userId },
    { title: 'Design CSV export format', status: 'created', storyId: exportCsv!.id, productId: 'Product', createdByUserId: userId },
    { title: 'Build export API endpoint', status: 'created', storyId: exportCsv!.id, productId: 'Product', createdByUserId: userId },
    { title: 'Set up webhook endpoint handler', status: 'in_progress', storyId: webhooks!.id, productId: 'Product', createdByUserId: userId },
    { title: 'Add webhook retry logic', status: 'created', storyId: webhooks!.id, productId: 'Product', createdByUserId: userId },
    { title: 'Write webhook documentation', status: 'created', storyId: webhooks!.id, productId: 'Product', createdByUserId: userId },
    { title: 'Evaluate i18n libraries', status: 'created', storyId: i18n!.id, productId: 'Product', createdByUserId: userId },
    { title: 'Extract all hardcoded strings', status: 'created', storyId: i18n!.id, productId: 'Product', createdByUserId: userId },
  ])

  console.log('Seed complete - 4 stories with 10 tasks created')
  process.exit(0)
}

seed()
