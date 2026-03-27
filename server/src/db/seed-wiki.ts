import { db } from './index'
import { assetTypes, assets, users } from './schema'

async function seedWiki() {
  console.log('Seeding wiki assets...')

  const allUsers = await db.select().from(users)
  if (allUsers.length === 0) {
    console.error('No users found.')
    process.exit(1)
  }
  const u1 = allUsers[0]
  const u2 = allUsers[1] || allUsers[0]
  const u3 = allUsers[2] || allUsers[0]
  const productId = 'Traderverse'

  // Clean
  await db.delete(assets)
  await db.delete(assetTypes)

  console.log('Creating asset types...')

  // Engineering types
  const types: Record<string, any> = {}
  const typeDefs = [
    { name: 'API', slug: 'api', category: 'engineering', icon: '🔌', color: '#4857FE' },
    { name: 'Service', slug: 'service', category: 'engineering', icon: '⚙️', color: '#7C5CFC' },
    { name: 'Module', slug: 'module', category: 'engineering', icon: '📦', color: '#06b6d4' },
    { name: 'Database', slug: 'database', category: 'engineering', icon: '🗄️', color: '#f59e0b' },
    { name: 'Table', slug: 'table', category: 'engineering', icon: '📊', color: '#eab308' },
    { name: 'Server', slug: 'server', category: 'engineering', icon: '🖥️', color: '#64748b' },
    { name: 'Environment', slug: 'environment', category: 'engineering', icon: '🌍', color: '#10b981' },
    { name: 'Queue', slug: 'queue', category: 'engineering', icon: '📬', color: '#8b5cf6' },
    { name: 'Storage', slug: 'storage', category: 'engineering', icon: '💾', color: '#f97316' },
    // Product types
    { name: 'Page', slug: 'page', category: 'product', icon: '📄', color: '#3b82f6' },
    { name: 'Feature', slug: 'feature', category: 'product', icon: '✨', color: '#8b5cf6' },
    { name: 'Flow', slug: 'flow', category: 'product', icon: '🔀', color: '#06b6d4' },
    { name: 'Component', slug: 'component', category: 'product', icon: '🧩', color: '#ec4899' },
    // Business types
    { name: 'Article', slug: 'article', category: 'business', icon: '📝', color: '#6366f1' },
    { name: 'SOP', slug: 'sop', category: 'business', icon: '📋', color: '#f59e0b' },
    { name: 'Policy', slug: 'policy', category: 'business', icon: '📜', color: '#ef4444' },
    { name: 'Metric', slug: 'metric', category: 'business', icon: '📈', color: '#10b981' },
    { name: 'Experiment', slug: 'experiment', category: 'business', icon: '🧪', color: '#a855f7' },
    // External types
    { name: 'Third-party API', slug: 'third-party-api', category: 'external', icon: '🔗', color: '#64748b' },
    { name: 'Vendor', slug: 'vendor', category: 'external', icon: '🏢', color: '#78716c' },
    { name: 'Tool', slug: 'tool', category: 'external', icon: '🛠️', color: '#0ea5e9' },
  ]

  for (const td of typeDefs) {
    const [created] = await db.insert(assetTypes).values({ ...td, productId }).returning()
    types[td.slug] = created
  }
  console.log(`Created ${typeDefs.length} asset types`)

  // Create sample assets
  console.log('Creating sample assets...')

  const assetDefs = [
    {
      typeSlug: 'api', title: 'REST API v1', description: 'Main REST API for Traderverse platform',
      content: `## REST API v1\n\nThe primary API serving the Traderverse frontend and mobile applications.\n\n### Base URL\n\n\`https://api.traderverse.io/v1\`\n\n### Authentication\n\nAll endpoints require Bearer token authentication.\n\n### Rate Limits\n\n- 100 requests/minute for authenticated users\n- 10 requests/minute for public endpoints\n\n### Core Endpoints\n\n- \`/auth\` — Authentication and user management\n- \`/portfolios\` — Portfolio CRUD operations\n- \`/trades\` — Trade execution and history\n- \`/market-data\` — Real-time market data\n- \`/analytics\` — Performance analytics`,
      status: 'active', owner: u1, tags: ['rest', 'backend', 'core'],
    },
    {
      typeSlug: 'api', title: 'WebSocket API', description: 'Real-time data streaming API',
      content: `## WebSocket API\n\nHandles real-time data streaming for live market prices, trade notifications, and portfolio updates.\n\n### Connection\n\n\`wss://ws.traderverse.io\`\n\n### Channels\n\n- \`prices:{symbol}\` — Live price updates\n- \`trades:{userId}\` — Trade execution notifications\n- \`portfolio:{userId}\` — Portfolio value changes\n\n### Message Format\n\nAll messages use JSON with \`type\` and \`data\` fields.`,
      status: 'active', owner: u2, tags: ['websocket', 'realtime', 'streaming'],
    },
    {
      typeSlug: 'service', title: 'Auth Service', description: 'Authentication and authorization microservice',
      content: `## Auth Service\n\nManages user authentication, JWT token issuance, and role-based access control.\n\n### Technology\n\n- Elysia on Bun runtime\n- PostgreSQL for user storage\n- bcrypt for password hashing\n- JWT RS256 for tokens\n\n### Responsibilities\n\n- User registration and login\n- Token refresh and revocation\n- Password reset flow\n- Role management (admin, trader, viewer)\n- OAuth2 integration (Google, GitHub)`,
      status: 'active', owner: u1, tags: ['auth', 'security', 'jwt'],
    },
    {
      typeSlug: 'service', title: 'Market Data Service', description: 'Aggregates and distributes market data from exchanges',
      content: `## Market Data Service\n\nAggregates real-time and historical market data from multiple exchange APIs.\n\n### Data Sources\n\n- Binance API\n- Coinbase Pro\n- Kraken\n- Yahoo Finance\n\n### Features\n\n- Price normalization across exchanges\n- OHLCV candle aggregation\n- Order book depth snapshots\n- Historical data backfill`,
      status: 'active', owner: u2, tags: ['market-data', 'exchanges', 'aggregation'],
    },
    {
      typeSlug: 'database', title: 'Primary PostgreSQL', description: 'Main application database',
      content: `## Primary PostgreSQL\n\nThe main relational database for all application data.\n\n### Connection\n\n- Host: \`db.internal.traderverse.io\`\n- Port: 5432\n- Database: \`traderverse_prod\`\n\n### Key Tables\n\n- users, portfolios, trades, positions\n- market_data, candles, order_books\n- notifications, activity_log\n\n### Backup Schedule\n\n- Full backup: Daily at 2 AM UTC\n- WAL archiving: Continuous\n- Retention: 30 days`,
      status: 'active', owner: u3, tags: ['postgresql', 'database', 'production'],
    },
    {
      typeSlug: 'queue', title: 'NATS Message Broker', description: 'Event streaming and message queue infrastructure',
      content: `## NATS Message Broker\n\nDistributed messaging system for event-driven architecture.\n\n### Subjects\n\n- \`trades.executed\` — Trade execution events\n- \`prices.updated\` — Price change notifications\n- \`portfolio.rebalance\` — Rebalance triggers\n- \`notifications.send\` — User notification dispatch\n\n### Configuration\n\n- Cluster: 3-node JetStream\n- Retention: 7 days\n- Max message size: 1MB`,
      status: 'active', owner: u1, tags: ['nats', 'messaging', 'events'],
    },
    {
      typeSlug: 'page', title: 'Dashboard', description: 'Main user dashboard with portfolio overview',
      content: `## Dashboard Page\n\nThe primary landing page after login showing portfolio summary and market overview.\n\n### Components\n\n- Portfolio value card with sparkline\n- Asset allocation donut chart\n- Recent trades table\n- Watchlist with live prices\n- News feed sidebar\n\n### Data Sources\n\n- Portfolio API for holdings\n- Market Data API for live prices\n- Analytics API for performance charts`,
      status: 'active', owner: u2, tags: ['ui', 'dashboard', 'portfolio'],
    },
    {
      typeSlug: 'feature', title: 'Copy Trading', description: 'Follow and automatically copy trades from top performers',
      content: `## Copy Trading Feature\n\nAllows users to follow successful traders and automatically mirror their trades.\n\n### User Flow\n\n1. Browse leaderboard of top traders\n2. View trader profile with performance history\n3. Click "Follow" and set allocation amount\n4. Trades are automatically copied in proportion\n5. Real-time P&L tracking per followed trader\n\n### Business Rules\n\n- Minimum follow amount: $100\n- Maximum 10 followed traders\n- 1% platform fee on copy trade profits\n- Instant unfollow with position close option`,
      status: 'draft', owner: u1, tags: ['copy-trading', 'social', 'feature'],
    },
    {
      typeSlug: 'sop', title: 'Incident Response', description: 'Standard operating procedure for production incidents',
      content: `## Incident Response SOP\n\n### Severity Levels\n\n- **P1 Critical**: Service down, data loss risk — respond in 5 min\n- **P2 High**: Major feature broken — respond in 15 min\n- **P3 Medium**: Degraded performance — respond in 1 hour\n- **P4 Low**: Minor issue — respond next business day\n\n### Response Steps\n\n1. Acknowledge the alert\n2. Assess severity and impact\n3. Communicate in #incidents Slack channel\n4. Investigate root cause\n5. Apply fix or rollback\n6. Verify resolution\n7. Write post-mortem (P1/P2 only)\n\n### Escalation\n\n- P1: Notify on-call → Engineering Lead → CTO\n- P2: Notify on-call → Engineering Lead`,
      status: 'active', owner: u3, tags: ['incident', 'operations', 'procedure'],
    },
    {
      typeSlug: 'third-party-api', title: 'Stripe Payments', description: 'Payment processing integration',
      content: `## Stripe Integration\n\nHandles all payment processing for subscriptions and one-time charges.\n\n### API Version\n\n\`2024-11-20.acacia\`\n\n### Features Used\n\n- Checkout Sessions for subscription signup\n- Customer Portal for self-service billing\n- Webhooks for payment events\n- Payment Intents for one-time charges\n\n### Webhook Events\n\n- \`checkout.session.completed\`\n- \`invoice.paid\`\n- \`customer.subscription.updated\`\n- \`customer.subscription.deleted\`\n\n### Environment\n\n- Test: \`sk_test_...\`\n- Live: \`sk_live_...\` (in Vault)`,
      status: 'active', owner: u1, tags: ['stripe', 'payments', 'billing'],
    },
    {
      typeSlug: 'tool', title: 'Slack', description: 'Team communication and alerting',
      content: `## Slack Integration\n\n### Channels\n\n- \`#general\` — Team-wide announcements\n- \`#engineering\` — Technical discussions\n- \`#incidents\` — Production incident coordination\n- \`#deployments\` — Automated deployment notifications\n- \`#alerts\` — Monitoring alerts from Datadog\n\n### Bots\n\n- **DeployBot** — Posts deployment status\n- **AlertBot** — Forwards critical alerts\n- **StandupBot** — Daily standup reminders`,
      status: 'active', owner: u2, tags: ['slack', 'communication', 'alerts'],
    },
    {
      typeSlug: 'article', title: 'Getting Started Guide', description: 'Onboarding guide for new team members',
      content: `## Getting Started Guide\n\nWelcome to Traderverse! This guide will help you get set up.\n\n### Day 1\n\n1. Set up your development environment (see Local Setup Guide)\n2. Get access to GitHub, Slack, and Figma\n3. Meet your buddy/mentor\n4. Read the Architecture Overview\n\n### Week 1\n\n1. Complete a "hello world" PR\n2. Attend sprint planning\n3. Shadow a code review\n4. Read through core API documentation\n\n### Month 1\n\n1. Own and deliver your first task\n2. Present at team demo\n3. Contribute to wiki documentation`,
      status: 'active', owner: u3, tags: ['onboarding', 'guide', 'new-hire'],
    },
  ]

  for (const ad of assetDefs) {
    const assetType = types[ad.typeSlug]
    if (!assetType) continue
    await db.insert(assets).values({
      productId,
      assetTypeId: assetType.id,
      title: ad.title,
      slug: ad.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      description: ad.description,
      content: ad.content,
      status: (ad.status as any) || 'draft',
      visibility: 'internal',
      ownerUserId: ad.owner.id,
      tags: ad.tags,
      sortOrder: 0,
      createdByUserId: ad.owner.id,
    })
  }

  console.log(`Created ${assetDefs.length} sample assets`)
  console.log('\n✅ Wiki seed complete!')
  process.exit(0)
}

seedWiki().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
