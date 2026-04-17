import { db } from './index'
import { stories, tasks, users, products, productCounters } from './schema'
import { eq } from 'drizzle-orm'

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

async function ensureSeedProduct(userId: string) {
  const existing = await db.query.products.findFirst({
    where: eq(products.name, 'Product'),
    columns: { id: true, name: true, projectKey: true },
  })

  if (existing) {
    if (!existing.projectKey) {
      await db.update(products)
        .set({ projectKey: 'PRD' })
        .where(eq(products.id, existing.id))
    }
    return { ...existing, projectKey: existing.projectKey || 'PRD' }
  }

  const [created] = await db.insert(products).values({
    name: 'Product',
    projectKey: 'PRD',
    logo: null,
    description: 'Seed product',
    createdByUserId: userId,
  }).returning({
    id: products.id,
    name: products.name,
    projectKey: products.projectKey,
  })

  return created!
}

async function seed() {
  console.log('Seeding database...')

  const seedUser = await ensureSeedUser()
  const seedProduct = await ensureSeedProduct(seedUser.id)

  // Clear existing data
  await db.delete(tasks)
  await db.delete(stories)

  // Insert stories matching existing hardcoded data
  const [darkMode] = await db.insert(stories).values({
    publicId: 'PRD-1',
    title: 'Add dark mode support',
    description: 'Users have requested dark mode',
    type: 'feature',
    priority: 'medium',
    status: 'backlog',
    product: seedProduct.name,
    productId: seedProduct.id,
  }).returning()

  const [exportCsv] = await db.insert(stories).values({
    publicId: 'PRD-2',
    title: 'Export to CSV',
    description: 'Allow users to export data',
    type: 'feature',
    priority: 'low',
    status: 'backlog',
    product: seedProduct.name,
    productId: seedProduct.id,
  }).returning()

  const [webhooks] = await db.insert(stories).values({
    publicId: 'PRD-3',
    title: 'Webhook integrations',
    description: 'Support third-party webhook callbacks',
    type: 'feature',
    priority: 'medium',
    status: 'in_progress',
    product: seedProduct.name,
    productId: seedProduct.id,
  }).returning()

  const [i18n] = await db.insert(stories).values({
    publicId: 'PRD-4',
    title: 'Multi-language support',
    description: 'i18n framework integration',
    type: 'research',
    priority: 'low',
    status: 'backlog',
    product: seedProduct.name,
    productId: seedProduct.id,
  }).returning()

  // Add sample tasks
  await db.insert(tasks).values([
    {
      publicId: 'PRD-5',
      title: 'Research CSS custom properties approach',
      status: 'done',
      storyId: darkMode!.id,
      productId: seedProduct.id,
      createdByUserId: seedUser.id,
    },
    {
      publicId: 'PRD-6',
      title: 'Implement theme toggle component',
      status: 'created',
      storyId: darkMode!.id,
      productId: seedProduct.id,
      createdByUserId: seedUser.id,
    },
    {
      publicId: 'PRD-7',
      title: 'Update color palette for dark theme',
      status: 'created',
      storyId: darkMode!.id,
      productId: seedProduct.id,
      createdByUserId: seedUser.id,
    },
    {
      publicId: 'PRD-8',
      title: 'Design CSV export format',
      status: 'created',
      storyId: exportCsv!.id,
      productId: seedProduct.id,
      createdByUserId: seedUser.id,
    },
    {
      publicId: 'PRD-9',
      title: 'Build export API endpoint',
      status: 'created',
      storyId: exportCsv!.id,
      productId: seedProduct.id,
      createdByUserId: seedUser.id,
    },
    {
      publicId: 'PRD-10',
      title: 'Set up webhook endpoint handler',
      status: 'in_progress',
      storyId: webhooks!.id,
      productId: seedProduct.id,
      createdByUserId: seedUser.id,
    },
    {
      publicId: 'PRD-11',
      title: 'Add webhook retry logic',
      status: 'created',
      storyId: webhooks!.id,
      productId: seedProduct.id,
      createdByUserId: seedUser.id,
    },
    {
      publicId: 'PRD-12',
      title: 'Write webhook documentation',
      status: 'created',
      storyId: webhooks!.id,
      productId: seedProduct.id,
      createdByUserId: seedUser.id,
    },
    {
      publicId: 'PRD-13',
      title: 'Evaluate i18n libraries',
      status: 'created',
      storyId: i18n!.id,
      productId: seedProduct.id,
      createdByUserId: seedUser.id,
    },
    {
      publicId: 'PRD-14',
      title: 'Extract all hardcoded strings',
      status: 'created',
      storyId: i18n!.id,
      productId: seedProduct.id,
      createdByUserId: seedUser.id,
    },
  ])

  await db.insert(productCounters).values({
    productId: seedProduct.id,
    nextValue: 15,
  }).onConflictDoUpdate({
    target: productCounters.productId,
    set: { nextValue: 15 },
  })

  console.log('Seed complete - 4 stories with 10 tasks created')
  process.exit(0)
}

seed()
