import { db } from './index'
import { releases, releaseDeliveries, releaseDeployments, servers, deploymentTargets, deliveries, users } from './schema'
import { eq } from 'drizzle-orm'

async function seedReleases() {
  console.log('Seeding releases...')

  // Get existing users
  const allUsers = await db.select().from(users)
  if (allUsers.length === 0) {
    console.error('No users found. Run seed-users first.')
    process.exit(1)
  }
  const user1 = allUsers[0]
  const user2 = allUsers[1] || allUsers[0]
  const user3 = allUsers[2] || allUsers[0]

  // Get existing deliveries
  const allDeliveries = await db.select().from(deliveries)
  if (allDeliveries.length === 0) {
    console.error('No deliveries found. Create some deliveries first.')
    process.exit(1)
  }

  const productId = allDeliveries[0].productId

  // Clean existing release data
  await db.delete(deploymentTargets)
  await db.delete(releaseDeployments)
  await db.delete(releaseDeliveries)
  await db.delete(releases)
  await db.delete(servers)

  console.log('Creating servers...')

  // Create servers for each environment
  const [devServer1] = await db.insert(servers).values({
    name: 'dev-app-01',
    environment: 'dev',
    host: 'dev-app-01.internal.productier.io',
    port: 8080,
    protocol: 'https',
    region: 'us-east-1',
    provider: 'AWS',
    instanceId: 'i-0a1b2c3d4e5f60001',
    isActive: 1,
    productId,
  }).returning()

  const [devServer2] = await db.insert(servers).values({
    name: 'dev-app-02',
    environment: 'dev',
    host: 'dev-app-02.internal.productier.io',
    port: 8080,
    protocol: 'https',
    region: 'us-east-1',
    provider: 'AWS',
    instanceId: 'i-0a1b2c3d4e5f60002',
    isActive: 1,
    productId,
  }).returning()

  const [stageServer1] = await db.insert(servers).values({
    name: 'stage-app-01',
    environment: 'stage',
    host: 'stage-app-01.internal.productier.io',
    port: 443,
    protocol: 'https',
    region: 'us-east-1',
    provider: 'AWS',
    instanceId: 'i-0a1b2c3d4e5f70001',
    isActive: 1,
    productId,
  }).returning()

  const [stageServer2] = await db.insert(servers).values({
    name: 'stage-app-02',
    environment: 'stage',
    host: 'stage-app-02.internal.productier.io',
    port: 443,
    protocol: 'https',
    region: 'us-east-1',
    provider: 'AWS',
    instanceId: 'i-0a1b2c3d4e5f70002',
    isActive: 1,
    productId,
  }).returning()

  const [prodServer1] = await db.insert(servers).values({
    name: 'prod-app-01',
    environment: 'prod',
    host: 'prod-app-01.internal.productier.io',
    port: 443,
    protocol: 'https',
    region: 'us-east-1',
    provider: 'AWS',
    instanceId: 'i-0a1b2c3d4e5f80001',
    isActive: 1,
    productId,
  }).returning()

  const [prodServer2] = await db.insert(servers).values({
    name: 'prod-app-02',
    environment: 'prod',
    host: 'prod-app-02.internal.productier.io',
    port: 443,
    protocol: 'https',
    region: 'us-east-1',
    provider: 'AWS',
    instanceId: 'i-0a1b2c3d4e5f80002',
    isActive: 1,
    productId,
  }).returning()

  const [prodServer3] = await db.insert(servers).values({
    name: 'prod-app-03',
    environment: 'prod',
    host: 'prod-app-03.internal.productier.io',
    port: 443,
    protocol: 'https',
    region: 'us-west-2',
    provider: 'AWS',
    instanceId: 'i-0a1b2c3d4e5f80003',
    isActive: 1,
    productId,
  }).returning()

  console.log(`Created 7 servers (2 dev, 2 stage, 3 prod)`)

  // ── Release 1: Completed release (all environments deployed) ──
  console.log('Creating Release 1 (completed)...')
  const [release1] = await db.insert(releases).values({
    code: 'R-1',
    version: '1.0.0',
    title: 'Initial Launch',
    status: 'completed',
    releaseType: 'feature',
    plannedAt: new Date('2026-02-15'),
    startedAt: new Date('2026-02-20'),
    completedAt: new Date('2026-02-25'),
    createdByUserId: user1.id,
    releaseManagerId: user2.id,
    notes: 'First production release with core authentication and navigation features.',
    releaseNotes: '## What\'s New\n- User authentication (login, signup, password reset)\n- Main navigation and sidebar\n- Product switching\n- Team management basics',
    productId,
  }).returning()

  // Attach deliveries to release 1
  if (allDeliveries.length >= 2) {
    await db.insert(releaseDeliveries).values({
      releaseId: release1.id,
      deliveryId: allDeliveries[1].id, // Auth & Navigation
      deploymentOrder: 1,
      addedByUserId: user1.id,
    })
  }

  // Create deployments for release 1 (all deployed)
  const [r1Dev] = await db.insert(releaseDeployments).values({
    releaseId: release1.id,
    environment: 'dev',
    sequence: 1,
    status: 'deployed',
    startedAt: new Date('2026-02-20'),
    completedAt: new Date('2026-02-20'),
    deployedByUserId: user1.id,
    notes: 'Clean deployment to dev',
  }).returning()

  const [r1Stage] = await db.insert(releaseDeployments).values({
    releaseId: release1.id,
    environment: 'stage',
    sequence: 2,
    status: 'deployed',
    startedAt: new Date('2026-02-22'),
    completedAt: new Date('2026-02-22'),
    deployedByUserId: user2.id,
    notes: 'QA verified on staging',
  }).returning()

  const [r1Prod] = await db.insert(releaseDeployments).values({
    releaseId: release1.id,
    environment: 'prod',
    sequence: 3,
    status: 'deployed',
    startedAt: new Date('2026-02-25'),
    completedAt: new Date('2026-02-25'),
    deployedByUserId: user2.id,
    notes: 'Production rollout complete',
  }).returning()

  // Add deployment targets for release 1
  await db.insert(deploymentTargets).values([
    { releaseDeploymentId: r1Dev.id, serverId: devServer1.id, status: 'deployed', deployedAt: new Date('2026-02-20') },
    { releaseDeploymentId: r1Dev.id, serverId: devServer2.id, status: 'deployed', deployedAt: new Date('2026-02-20') },
    { releaseDeploymentId: r1Stage.id, serverId: stageServer1.id, status: 'deployed', deployedAt: new Date('2026-02-22') },
    { releaseDeploymentId: r1Stage.id, serverId: stageServer2.id, status: 'deployed', deployedAt: new Date('2026-02-22') },
    { releaseDeploymentId: r1Prod.id, serverId: prodServer1.id, status: 'deployed', deployedAt: new Date('2026-02-25') },
    { releaseDeploymentId: r1Prod.id, serverId: prodServer2.id, status: 'deployed', deployedAt: new Date('2026-02-25') },
    { releaseDeploymentId: r1Prod.id, serverId: prodServer3.id, status: 'deployed', deployedAt: new Date('2026-02-25') },
  ])

  // ── Release 2: In progress (dev deployed, stage deploying, prod pending) ──
  console.log('Creating Release 2 (in_progress)...')
  const [release2] = await db.insert(releases).values({
    code: 'R-2',
    version: '1.1.0',
    title: 'Search & Performance',
    status: 'in_progress',
    releaseType: 'feature',
    plannedAt: new Date('2026-03-20'),
    startedAt: new Date('2026-03-14'),
    createdByUserId: user1.id,
    releaseManagerId: user1.id,
    notes: 'AI-powered search and performance improvements bundled together.',
    releaseNotes: '## What\'s New\n- AI-powered search across all entities\n- Dark mode support\n- Performance optimizations\n- Caching layer improvements',
    productId,
  }).returning()

  // Attach deliveries
  if (allDeliveries.length >= 1) {
    await db.insert(releaseDeliveries).values({
      releaseId: release2.id,
      deliveryId: allDeliveries[0].id, // Search & Dark Mode
      deploymentOrder: 1,
      addedByUserId: user1.id,
    })
  }
  if (allDeliveries.length >= 3) {
    await db.insert(releaseDeliveries).values({
      releaseId: release2.id,
      deliveryId: allDeliveries[2].id, // Performance
      deploymentOrder: 2,
      addedByUserId: user1.id,
    })
  }

  const [r2Dev] = await db.insert(releaseDeployments).values({
    releaseId: release2.id,
    environment: 'dev',
    sequence: 1,
    status: 'deployed',
    startedAt: new Date('2026-03-14'),
    completedAt: new Date('2026-03-14'),
    deployedByUserId: user1.id,
    notes: 'Dev deployment verified',
  }).returning()

  const [r2Stage] = await db.insert(releaseDeployments).values({
    releaseId: release2.id,
    environment: 'stage',
    sequence: 2,
    status: 'deploying',
    startedAt: new Date('2026-03-16'),
    deployedByUserId: user2.id,
    notes: 'Rolling out to staging servers',
  }).returning()

  const [r2Prod] = await db.insert(releaseDeployments).values({
    releaseId: release2.id,
    environment: 'prod',
    sequence: 3,
    status: 'pending',
  }).returning()

  await db.insert(deploymentTargets).values([
    { releaseDeploymentId: r2Dev.id, serverId: devServer1.id, status: 'deployed', deployedAt: new Date('2026-03-14') },
    { releaseDeploymentId: r2Dev.id, serverId: devServer2.id, status: 'deployed', deployedAt: new Date('2026-03-14') },
    { releaseDeploymentId: r2Stage.id, serverId: stageServer1.id, status: 'deployed', deployedAt: new Date('2026-03-16') },
    { releaseDeploymentId: r2Stage.id, serverId: stageServer2.id, status: 'deploying' },
  ])

  // ── Release 3: Failed release (dev deployed, stage failed) ──
  console.log('Creating Release 3 (failed)...')
  const [release3] = await db.insert(releases).values({
    code: 'R-3',
    version: '1.1.1',
    title: 'Hotfix: Login Timeout',
    status: 'failed',
    releaseType: 'hotfix',
    plannedAt: new Date('2026-03-10'),
    startedAt: new Date('2026-03-10'),
    createdByUserId: user3.id,
    releaseManagerId: user2.id,
    notes: 'Emergency fix for login timeout issues reported by multiple users.',
    releaseNotes: '## Fixes\n- Fixed session timeout causing repeated login prompts\n- Increased token refresh window',
    productId,
  }).returning()

  if (allDeliveries.length >= 4) {
    await db.insert(releaseDeliveries).values({
      releaseId: release3.id,
      deliveryId: allDeliveries[3].id, // Bug Fixes
      deploymentOrder: 1,
      addedByUserId: user3.id,
    })
  }

  const [r3Dev] = await db.insert(releaseDeployments).values({
    releaseId: release3.id,
    environment: 'dev',
    sequence: 1,
    status: 'deployed',
    startedAt: new Date('2026-03-10'),
    completedAt: new Date('2026-03-10'),
    deployedByUserId: user3.id,
  }).returning()

  const [r3Stage] = await db.insert(releaseDeployments).values({
    releaseId: release3.id,
    environment: 'stage',
    sequence: 2,
    status: 'failed',
    startedAt: new Date('2026-03-11'),
    failedAt: new Date('2026-03-11'),
    deployedByUserId: user3.id,
    notes: 'Migration script failed on stage DB',
  }).returning()

  const [r3Prod] = await db.insert(releaseDeployments).values({
    releaseId: release3.id,
    environment: 'prod',
    sequence: 3,
    status: 'pending',
  }).returning()

  await db.insert(deploymentTargets).values([
    { releaseDeploymentId: r3Dev.id, serverId: devServer1.id, status: 'deployed', deployedAt: new Date('2026-03-10') },
    { releaseDeploymentId: r3Dev.id, serverId: devServer2.id, status: 'deployed', deployedAt: new Date('2026-03-10') },
    { releaseDeploymentId: r3Stage.id, serverId: stageServer1.id, status: 'failed', failedAt: new Date('2026-03-11'), logsUrl: 'https://logs.productier.io/deploy/r3-stage-001' },
    { releaseDeploymentId: r3Stage.id, serverId: stageServer2.id, status: 'pending' },
  ])

  // ── Release 4: Draft (planned, no deployments started) ──
  console.log('Creating Release 4 (draft)...')
  const [release4] = await db.insert(releases).values({
    code: 'R-4',
    version: '1.2.0',
    title: 'Analytics & Reporting',
    status: 'draft',
    releaseType: 'feature',
    plannedAt: new Date('2026-04-01'),
    createdByUserId: user1.id,
    releaseManagerId: user1.id,
    notes: 'Upcoming analytics dashboard and reporting features.',
    releaseNotes: '## Planned\n- Product analytics dashboard\n- Sprint velocity reports\n- Burndown charts\n- CSV/PDF export for reports',
    productId,
  }).returning()

  await db.insert(releaseDeployments).values([
    { releaseId: release4.id, environment: 'dev', sequence: 1, status: 'pending' },
    { releaseId: release4.id, environment: 'stage', sequence: 2, status: 'pending' },
    { releaseId: release4.id, environment: 'prod', sequence: 3, status: 'pending' },
  ])

  // ── Release 5: Planned patch ──
  console.log('Creating Release 5 (planned)...')
  const [release5] = await db.insert(releases).values({
    code: 'R-5',
    version: '1.0.2',
    title: 'Patch: UI Polish',
    status: 'planned',
    releaseType: 'patch',
    plannedAt: new Date('2026-03-25'),
    createdByUserId: user2.id,
    releaseManagerId: user2.id,
    notes: 'Minor UI fixes and polish across all views.',
    releaseNotes: '## Fixes\n- Sidebar alignment on smaller screens\n- Table sort indicator visibility\n- Empty state illustrations\n- Tooltip positioning fixes',
    productId,
  }).returning()

  await db.insert(releaseDeployments).values([
    { releaseId: release5.id, environment: 'dev', sequence: 1, status: 'pending' },
    { releaseId: release5.id, environment: 'stage', sequence: 2, status: 'pending' },
    { releaseId: release5.id, environment: 'prod', sequence: 3, status: 'pending' },
  ])

  console.log('\n✅ Release seed complete!')
  console.log('  5 releases (completed, in_progress, failed, draft, planned)')
  console.log('  7 servers (2 dev, 2 stage, 3 prod)')
  console.log('  15 deployments (3 per release)')
  console.log('  Deployment targets with varied statuses')

  process.exit(0)
}

seedReleases().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
