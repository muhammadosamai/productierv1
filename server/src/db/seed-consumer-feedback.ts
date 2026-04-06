import { db } from './index'
import { consumerFeedbacks, consumerFeedbackComments, users } from './schema'

async function seed() {
  console.log('Seeding consumer feedback...')

  const allUsers = await db.select().from(users)
  const productId = 'Traderverse'

  await db.delete(consumerFeedbackComments)
  await db.delete(consumerFeedbacks)

  const feedbacks = [
    {
      title: 'Login page crashes on Safari iOS',
      description: 'When trying to log in on Safari for iPhone, the page freezes after entering credentials and tapping Sign In. The spinner appears but never resolves.',
      type: 'bug' as const, status: 'investigating' as const, priority: 'high' as const,
      reporterName: 'Sarah Chen', reporterEmail: 'sarah.chen@gmail.com',
      reporterBrowser: 'Safari 17.2', reporterOs: 'iOS 17.3', reporterDevice: 'iPhone 15 Pro',
      pageUrl: '/login', stepsToReproduce: '1. Open app on Safari iOS\n2. Enter valid credentials\n3. Tap Sign In\n4. Page freezes with spinner',
      expectedBehavior: 'Should redirect to dashboard', actualBehavior: 'Page freezes, must force-close browser',
      tags: ['ios', 'safari', 'login', 'critical'],
    },
    {
      title: 'Dashboard charts not loading for large datasets',
      description: 'When there are more than 500 tasks, the charts on the dashboard take forever to render and sometimes crash the browser tab.',
      type: 'bug' as const, status: 'acknowledged' as const, priority: 'high' as const,
      reporterName: 'Mike Johnson', reporterEmail: 'mike.j@techcorp.io',
      reporterBrowser: 'Chrome 121', reporterOs: 'Windows 11', reporterDevice: 'Desktop',
      pageUrl: '/metrics', stepsToReproduce: '1. Have 500+ tasks in a product\n2. Navigate to Metrics\n3. Wait for charts to load',
      expectedBehavior: 'Charts should load within 2 seconds', actualBehavior: 'Charts take 15+ seconds or crash',
      tags: ['performance', 'charts', 'dashboard'],
    },
    {
      title: 'Add CSV export for task lists',
      description: 'It would be incredibly helpful to export task lists as CSV files for reporting to stakeholders who don\'t use Productier.',
      type: 'feature' as const, status: 'new' as const, priority: 'medium' as const,
      reporterName: 'Anna Williams', reporterEmail: 'anna@startupco.com',
      tags: ['export', 'csv', 'reporting'],
    },
    {
      title: 'Kanban cards should show due dates visually',
      description: 'On the delivery kanban board, it\'s hard to see which tasks are approaching their due date. A visual indicator like a colored border or icon would help.',
      type: 'enhancement' as const, status: 'new' as const, priority: 'low' as const,
      reporterName: 'Tom Davis', reporterEmail: 'tom.d@devshop.co',
      pageUrl: '/deliveries/kanban', tags: ['kanban', 'ux', 'due-dates'],
    },
    {
      title: 'Notification bell doesn\'t clear after reading',
      description: 'After clicking on a notification and reading it, the red badge count on the bell icon doesn\'t decrease. Have to refresh the page.',
      type: 'bug' as const, status: 'resolved' as const, priority: 'medium' as const,
      reporterName: 'Lisa Park', reporterEmail: 'lisa.park@corp.com',
      reporterBrowser: 'Firefox 122', reporterOs: 'macOS Sonoma', reporterDevice: 'MacBook Pro',
      stepsToReproduce: '1. Receive a notification\n2. Click the bell icon\n3. Click on a notification\n4. Observe badge count',
      expectedBehavior: 'Badge count should decrease by 1', actualBehavior: 'Badge count stays the same',
      tags: ['notifications', 'ui-bug'],
    },
    {
      title: 'Allow bulk status change for tasks',
      description: 'When managing a large delivery with 50+ tasks, I need to change status for multiple tasks at once. Currently I have to do them one by one.',
      type: 'feature' as const, status: 'new' as const, priority: 'high' as const,
      reporterName: 'James Rodriguez', reporterEmail: 'james@bigco.com',
      tags: ['bulk-actions', 'tasks', 'productivity'],
    },
    {
      title: 'Mobile layout is broken on Android Chrome',
      description: 'The sidebar overlaps with the main content area when using the app on Android phones in portrait mode. Landscape works fine.',
      type: 'bug' as const, status: 'new' as const, priority: 'medium' as const,
      reporterName: 'Kim Nguyen', reporterEmail: 'kim.n@freelancer.com',
      reporterBrowser: 'Chrome 121', reporterOs: 'Android 14', reporterDevice: 'Pixel 8',
      pageUrl: '/stories', stepsToReproduce: '1. Open app on Android phone in portrait mode\n2. Sidebar overlaps content',
      expectedBehavior: 'Sidebar should be hidden or collapsible on mobile', actualBehavior: 'Sidebar overlaps main content',
      tags: ['mobile', 'android', 'responsive'],
    },
    {
      title: 'Dark mode for better nighttime usage',
      description: 'A dark theme option would reduce eye strain during late-night work sessions. Most modern tools have this.',
      type: 'enhancement' as const, status: 'new' as const, priority: 'low' as const,
      reporterName: 'Alex Turner', reporterEmail: 'alex.t@nightowl.dev',
      tags: ['dark-mode', 'theme', 'accessibility'],
    },
    {
      title: 'Drag and drop doesn\'t work on Firefox',
      description: 'The kanban board drag and drop functionality is broken on Firefox. Cards can be picked up but can\'t be dropped into other columns.',
      type: 'bug' as const, status: 'wont_fix' as const, priority: 'medium' as const,
      reporterName: 'Roberto Silva', reporterEmail: 'roberto@webdev.br',
      reporterBrowser: 'Firefox 121', reporterOs: 'Ubuntu 22.04', reporterDevice: 'Desktop',
      pageUrl: '/deliveries', stepsToReproduce: '1. Open a delivery kanban board on Firefox\n2. Try to drag a card\n3. Card lifts but drop zones not highlighted',
      expectedBehavior: 'Cards should be draggable between columns', actualBehavior: 'Drop zones don\'t activate',
      tags: ['firefox', 'drag-drop', 'kanban'],
    },
    {
      title: 'Integrate with Jira for 2-way sync',
      description: 'Our team uses both Jira and Productier. Would love to see a native integration that syncs issues and tasks between the two platforms.',
      type: 'feature' as const, status: 'new' as const, priority: 'high' as const,
      reporterName: 'Priya Sharma', reporterEmail: 'priya@enterprise.co',
      tags: ['jira', 'integration', 'sync'],
    },
    {
      title: 'Search doesn\'t find tasks in archived stories',
      description: 'When searching for a task title that belongs to an archived story, no results appear. Archived content should still be searchable.',
      type: 'bug' as const, status: 'duplicate' as const, priority: 'low' as const,
      reporterName: 'Chris Evans', reporterEmail: 'chris.e@startup.io',
      tags: ['search', 'archive'],
    },
    {
      title: 'Improve keyboard navigation across all pages',
      description: 'Power users would benefit from comprehensive keyboard shortcuts — j/k for navigation, enter to open, esc to close, etc. Similar to GitHub or Linear.',
      type: 'enhancement' as const, status: 'acknowledged' as const, priority: 'medium' as const,
      reporterName: 'Yuki Tanaka', reporterEmail: 'yuki@devtools.jp',
      tags: ['keyboard', 'accessibility', 'productivity'],
    },
  ]

  for (const fb of feedbacks) {
    const [created] = await db.insert(consumerFeedbacks).values({
      productId,
      title: fb.title,
      description: fb.description,
      type: fb.type,
      status: fb.status,
      priority: fb.priority,
      reporterName: fb.reporterName || null,
      reporterEmail: fb.reporterEmail || null,
      reporterBrowser: fb.reporterBrowser || null,
      reporterOs: fb.reporterOs || null,
      reporterDevice: fb.reporterDevice || null,
      pageUrl: fb.pageUrl || null,
      stepsToReproduce: fb.stepsToReproduce || null,
      expectedBehavior: fb.expectedBehavior || null,
      actualBehavior: fb.actualBehavior || null,
      tags: fb.tags || null,
      assignedToUserId: Math.random() > 0.5 ? allUsers[Math.floor(Math.random() * allUsers.length)].id : null,
    }).returning()

    // Add 0-2 internal comments
    const commentCount = Math.floor(Math.random() * 3)
    const commentTexts = [
      'I can reproduce this. Looking into it now.',
      'This is a known issue — will be fixed in the next release.',
      'Discussed with the team, we\'ll prioritize this for next sprint.',
      'Thanks for reporting. We need more details about the environment.',
      'Fixed in commit abc123. Will deploy shortly.',
      'Linking this to the related story for tracking.',
    ]
    for (let c = 0; c < commentCount; c++) {
      await db.insert(consumerFeedbackComments).values({
        feedbackId: created.id,
        userId: allUsers[Math.floor(Math.random() * allUsers.length)].id,
        content: commentTexts[Math.floor(Math.random() * commentTexts.length)],
        isInternal: Math.random() > 0.3 ? 1 : 0,
      })
    }
  }

  console.log(`✅ Created ${feedbacks.length} consumer feedbacks with comments`)
  process.exit(0)
}

seed().catch(e => { console.error(e); process.exit(1) })
