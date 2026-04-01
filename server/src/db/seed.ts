import { db } from './index'
import { stories, tasks, users } from './schema'

async function ensureSeedUser() {
  const existing = await db.query.users.findFirst({
    columns: { id: true, name: true, email: true },
  })

  if (existing) return existing

  const [created] = await db.insert(users).values({
    name: 'Seed User',
    email: 'seed@productier.local',
    password: 'seed-password',
    role: 'admin',
    avatar: null,
  }).returning({
    id: users.id,
    name: users.name,
    email: users.email,
  })

  return created!
}

async function seed() {
  console.log('Seeding database...')

  const seedUser = await ensureSeedUser()

  // Clear existing data
  await db.delete(tasks)
  await db.delete(stories)

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

  // Add sample tasks
  await db.insert(tasks).values([
    {
      title: 'Research CSS custom properties approach',
      status: 'done',
      storyId: darkMode!.id,
      productId: darkMode!.product,
      createdByUserId: seedUser.id,
    },
    {
      title: 'Implement theme toggle component',
      status: 'created',
      storyId: darkMode!.id,
      productId: darkMode!.product,
      createdByUserId: seedUser.id,
    },
    {
      title: 'Update color palette for dark theme',
      status: 'created',
      storyId: darkMode!.id,
      productId: darkMode!.product,
      createdByUserId: seedUser.id,
    },
    {
      title: 'Design CSV export format',
      status: 'created',
      storyId: exportCsv!.id,
      productId: exportCsv!.product,
      createdByUserId: seedUser.id,
    },
    {
      title: 'Build export API endpoint',
      status: 'created',
      storyId: exportCsv!.id,
      productId: exportCsv!.product,
      createdByUserId: seedUser.id,
    },
    {
      title: 'Set up webhook endpoint handler',
      status: 'in_progress',
      storyId: webhooks!.id,
      productId: webhooks!.product,
      createdByUserId: seedUser.id,
    },
    {
      title: 'Add webhook retry logic',
      status: 'created',
      storyId: webhooks!.id,
      productId: webhooks!.product,
      createdByUserId: seedUser.id,
    },
    {
      title: 'Write webhook documentation',
      status: 'created',
      storyId: webhooks!.id,
      productId: webhooks!.product,
      createdByUserId: seedUser.id,
    },
    {
      title: 'Evaluate i18n libraries',
      status: 'created',
      storyId: i18n!.id,
      productId: i18n!.product,
      createdByUserId: seedUser.id,
    },
    {
      title: 'Extract all hardcoded strings',
      status: 'created',
      storyId: i18n!.id,
      productId: i18n!.product,
      createdByUserId: seedUser.id,
    },
  ])

  console.log('Seed complete - 4 stories with 10 tasks created')
  process.exit(0)
}

seed()
