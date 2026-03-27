import { db } from './index'
import { featureRequests, featureRequestUpvotes, featureRequestComments, users } from './schema'
import { eq } from 'drizzle-orm'

async function seed() {
  console.log('Seeding feature requests...')

  const allUsers = await db.select().from(users)
  if (allUsers.length < 2) {
    console.error('Need at least 2 users.')
    process.exit(1)
  }

  const productId = 'Traderverse'

  // Clean existing
  await db.delete(featureRequestComments)
  await db.delete(featureRequestUpvotes)
  await db.delete(featureRequests)

  const requests = [
    { title: 'Dark mode for all views', description: 'Would love a system-wide dark mode toggle that applies to all views including the kanban board, timeline, and wiki.', category: 'ux_improvement' as const, status: 'planned' as const, tags: ['ui', 'theme', 'accessibility'] },
    { title: 'Slack integration for task notifications', description: 'Get notified in Slack when tasks are assigned, status changes, or comments are added. Should support channel and DM notifications.', category: 'integration' as const, status: 'open' as const, tags: ['slack', 'notifications'] },
    { title: 'Custom fields on stories and tasks', description: 'Allow users to add custom fields (text, number, date, dropdown) to stories and tasks for tracking project-specific metadata.', category: 'new_feature' as const, status: 'under_review' as const, tags: ['customization', 'fields'] },
    { title: 'Burndown chart on deliveries', description: 'Show a burndown chart on each delivery view tracking estimated vs actual task completion over time.', category: 'enhancement' as const, status: 'open' as const, tags: ['charts', 'metrics', 'delivery'] },
    { title: 'API for external integrations', description: 'Provide a REST API with API keys so external tools can create stories, tasks, and update statuses programmatically.', category: 'integration' as const, status: 'planned' as const, tags: ['api', 'developer'] },
    { title: 'Mobile responsive layout', description: 'The app should work well on tablets and mobile devices. At minimum, viewing tasks and updating statuses on the go.', category: 'ux_improvement' as const, status: 'open' as const, tags: ['mobile', 'responsive'] },
    { title: 'Bulk task operations', description: 'Select multiple tasks and perform bulk actions like status change, assign to user, move to delivery, or delete.', category: 'enhancement' as const, status: 'open' as const, tags: ['productivity', 'bulk'] },
    { title: 'Time tracking on tasks', description: 'Built-in timer to track time spent on tasks. Show total logged hours and allow manual time entries.', category: 'new_feature' as const, status: 'in_progress' as const, tags: ['time', 'tracking', 'productivity'] },
    { title: 'Email digest of daily activity', description: 'Send a daily email summary of what happened across products — tasks completed, stories updated, releases deployed.', category: 'enhancement' as const, status: 'open' as const, tags: ['email', 'notifications', 'digest'] },
    { title: 'Export to PDF/CSV', description: 'Export stories, tasks, deliveries, and metrics to PDF or CSV format for reporting and stakeholder presentations.', category: 'enhancement' as const, status: 'completed' as const, tags: ['export', 'reporting'] },
    { title: 'Keyboard shortcuts everywhere', description: 'Add vim-style keyboard shortcuts for power users — quick navigation, task creation, status changes without touching the mouse.', category: 'ux_improvement' as const, status: 'open' as const, tags: ['keyboard', 'productivity'] },
    { title: 'Improve page load performance', description: 'Some pages take too long to load especially with many tasks. Implement pagination, virtual scrolling, and lazy loading.', category: 'performance' as const, status: 'declined' as const, tags: ['performance', 'speed'] },
  ]

  for (const req of requests) {
    const creator = allUsers[Math.floor(Math.random() * allUsers.length)]
    const [created] = await db.insert(featureRequests).values({
      productId,
      title: req.title,
      description: req.description,
      category: req.category,
      status: req.status,
      tags: req.tags,
      createdByUserId: creator.id,
      upvoteCount: 0,
    }).returning()

    // Random upvotes (2-8 users)
    const upvoteCount = 2 + Math.floor(Math.random() * 7)
    const shuffled = [...allUsers].sort(() => Math.random() - 0.5).slice(0, Math.min(upvoteCount, allUsers.length))
    for (const voter of shuffled) {
      try {
        await db.insert(featureRequestUpvotes).values({
          featureRequestId: created.id,
          userId: voter.id,
        })
      } catch { /* ignore duplicate */ }
    }
    await db.update(featureRequests)
      .set({ upvoteCount: shuffled.length })
      .where(eq(featureRequests.id, created.id))

    // Random comments (0-3)
    const commentCount = Math.floor(Math.random() * 4)
    const commentTexts = [
      'This would be really useful for our team!',
      'We need this ASAP, it would save us hours every week.',
      '+1, our customers have been asking for this too.',
      'I can help test this once it\'s ready.',
      'Would love to see this integrated with our existing workflow.',
      'This aligns well with our Q2 goals.',
    ]
    for (let c = 0; c < commentCount; c++) {
      const commenter = allUsers[Math.floor(Math.random() * allUsers.length)]
      await db.insert(featureRequestComments).values({
        featureRequestId: created.id,
        userId: commenter.id,
        content: commentTexts[Math.floor(Math.random() * commentTexts.length)],
      })
    }
  }

  console.log(`✅ Created ${requests.length} feature requests with upvotes and comments`)
  process.exit(0)
}

seed().catch(e => { console.error(e); process.exit(1) })
