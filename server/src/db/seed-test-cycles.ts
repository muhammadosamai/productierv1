import { db } from './index'
import { testCycles, testCycleIssues, users, deliveries, releases, stories } from './schema'
import { eq } from 'drizzle-orm'

async function seed() {
  console.log('Seeding test cycles...')

  const allUsers = await db.select().from(users)
  const allDeliveries = await db.select().from(deliveries)
  const allReleases = await db.select().from(releases)
  const allStories = await db.select().from(stories)

  if (allUsers.length === 0) { console.error('No users'); process.exit(1) }

  const u1 = allUsers[0]!
  const u2 = allUsers[1] || u1
  const u3 = allUsers[2] || u1
  const productId = allDeliveries[0]?.productId || 'Traderboards'

  await db.delete(testCycleIssues)
  await db.delete(testCycles)

  // Cycle 1: In progress, linked to delivery
  const [c1] = await db.insert(testCycles).values({
    title: '#1 Sprint 5 Regression',
    description: 'Full regression testing for Sprint 5 delivery including auth flow, navigation, and search.',
    status: 'in_progress',
    deliveryId: allDeliveries[0]?.id || null,
    productId,
    startDate: '2026-03-15',
    endDate: '2026-03-22',
    createdByUserId: u1.id,
  }).returning()

  await db.insert(testCycleIssues).values([
    { testCycleId: c1!.id, title: 'Login form resets on tab switch', severity: 'major', status: 'open', reportedByUserId: u2.id, storyId: allStories[0]?.id || null },
    { testCycleId: c1!.id, title: 'Search results not clearing on empty query', severity: 'minor', status: 'in_progress', reportedByUserId: u1.id, assignedToUserId: u3.id },
    { testCycleId: c1!.id, title: 'Dashboard stats show NaN for new products', severity: 'major', status: 'open', reportedByUserId: u3.id },
    { testCycleId: c1!.id, title: 'Avatar upload fails for WEBP format', severity: 'minor', status: 'resolved', reportedByUserId: u2.id, assignedToUserId: u1.id },
    { testCycleId: c1!.id, title: 'Sidebar flickers on route change', severity: 'trivial', status: 'closed', reportedByUserId: u1.id },
  ])

  // Cycle 2: Completed, linked to release
  const [c2] = await db.insert(testCycles).values({
    title: '#2 Release 1.0.0 UAT',
    description: 'User acceptance testing for the initial production release.',
    status: 'completed',
    releaseId: allReleases[0]?.id || null,
    productId,
    startDate: '2026-02-18',
    endDate: '2026-02-24',
    createdByUserId: u2.id,
  }).returning()

  await db.insert(testCycleIssues).values([
    { testCycleId: c2!.id, title: 'Password reset email not sent', severity: 'blocker', status: 'resolved', reportedByUserId: u1.id, assignedToUserId: u2.id, storyId: allStories[1]?.id || null },
    { testCycleId: c2!.id, title: 'Team member role not saving', severity: 'major', status: 'closed', reportedByUserId: u3.id, assignedToUserId: u1.id },
    { testCycleId: c2!.id, title: 'Mobile nav menu z-index issue', severity: 'minor', status: 'closed', reportedByUserId: u2.id },
  ])

  // Cycle 3: Planned
  const [c3] = await db.insert(testCycles).values({
    title: '#3 Performance Load Test',
    description: 'Load testing for API endpoints under 500 concurrent users.',
    status: 'planned',
    productId,
    startDate: '2026-03-25',
    endDate: '2026-03-28',
    createdByUserId: u1.id,
  }).returning()

  // Cycle 4: Archived
  const [c4] = await db.insert(testCycles).values({
    title: '#4 Alpha Smoke Test',
    description: 'Initial smoke testing during alpha phase.',
    status: 'archived',
    productId,
    startDate: '2026-01-10',
    endDate: '2026-01-12',
    createdByUserId: u3.id,
  }).returning()

  await db.insert(testCycleIssues).values([
    { testCycleId: c4!.id, title: 'App crashes on empty DB', severity: 'critical', status: 'closed', reportedByUserId: u1.id },
    { testCycleId: c4!.id, title: 'Missing 404 page', severity: 'minor', status: 'deferred', reportedByUserId: u2.id },
  ])

  console.log('\n✅ Test cycle seed complete!')
  console.log('  4 cycles (in_progress, completed, planned, archived)')
  console.log('  10 issues with varied severities and statuses')

  process.exit(0)
}

seed().catch((err) => { console.error('Seed failed:', err); process.exit(1) })
