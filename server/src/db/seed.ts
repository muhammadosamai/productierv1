import { db } from './index'
import { stories, tasks } from './schema'

async function seed() {
  console.log('Seeding database...')

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
    { title: 'Research CSS custom properties approach', status: 'done', storyId: darkMode!.id },
    { title: 'Implement theme toggle component', status: 'todo', storyId: darkMode!.id },
    { title: 'Update color palette for dark theme', status: 'todo', storyId: darkMode!.id },
    { title: 'Design CSV export format', status: 'todo', storyId: exportCsv!.id },
    { title: 'Build export API endpoint', status: 'todo', storyId: exportCsv!.id },
    { title: 'Set up webhook endpoint handler', status: 'in_progress', storyId: webhooks!.id },
    { title: 'Add webhook retry logic', status: 'todo', storyId: webhooks!.id },
    { title: 'Write webhook documentation', status: 'todo', storyId: webhooks!.id },
    { title: 'Evaluate i18n libraries', status: 'todo', storyId: i18n!.id },
    { title: 'Extract all hardcoded strings', status: 'todo', storyId: i18n!.id },
  ])

  console.log('Seed complete - 4 stories with 10 tasks created')
  process.exit(0)
}

seed()
