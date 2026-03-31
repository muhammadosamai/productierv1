import { readFileSync } from 'node:fs'

type RolloutMode = 'on' | 'shadow' | 'off'

interface EndpointRunResult {
  id: string
  passed: boolean
  durationMs: number
  status: number
}

interface EndpointRunOutput {
  generatedAt: string
  summary: {
    total: number
    passed: number
    failed: number
  }
  results: EndpointRunResult[]
}

const TRACKED_CASE_IDS = [
  'metrics.dashboard.get',
  'metrics.throughput.get',
  'metrics.flow.get',
  'metrics.quality.get',
  'metrics.blockers.get',
  'metrics.predictability.get',
  'metrics.workload.get',
  'metrics.deliveries-metrics.get',
  'auth.users.paged.get',
  'activities.paged.get',
  'stories.paged.get',
  'tasks.get.paged',
  'deliveries.paged.get',
  'releases.paged.get',
  'test-cycles.paged.get',
  'feature-requests.paged.get',
  'consumer-feedbacks.paged.get',
  'users.admin.get',
  'issues.get',
  'initiatives.insights.get',
  'integrations.connections.get',
  'wiki.revisions.get',
  'notifications.inbox.get',
  'notifications.unread-count.get',
  'notifications.read-all.post',
  'notifications.archive-all.post',
  'notifications.preferences.get',
  'notifications.preferences.put',
  'notifications.admin.publish.post',
  'notifications.admin.stats.get',
] as const

function parseRolloutMode(raw: string | undefined): RolloutMode {
  const normalized = (raw || 'on').trim().toLowerCase()
  if (normalized === 'off' || normalized === 'rollback') return 'off'
  if (normalized === 'shadow') return 'shadow'
  return 'on'
}

function parseThreshold(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)
  if (lower === upper) return sorted[lower]!
  const weight = rank - lower
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * weight
}

function formatMs(ms: number): string {
  return `${Math.round(ms * 100) / 100}ms`
}

function loadResultsFile(): EndpointRunOutput {
  const text = readFileSync(new URL('./endpoint-results.json', import.meta.url), 'utf8')
  return JSON.parse(text) as EndpointRunOutput
}

function main() {
  const rolloutMode = parseRolloutMode(process.env.SCALABILITY_ROLLOUT_MODE)
  if (rolloutMode === 'off') {
    console.log('[scalability-check] Rollout mode is OFF. Skipping performance gate.')
    process.exit(0)
  }

  const maxTrackedFailures = parseThreshold(process.env.SCALABILITY_PERF_MAX_FAILURES, 0)
  const maxTrackedP95Ms = parseThreshold(process.env.SCALABILITY_PERF_MAX_P95_MS, 1500)
  const maxTrackedSlowOver1s = parseThreshold(process.env.SCALABILITY_PERF_MAX_SLOW_OVER_1S, 4)
  const maxNotificationsP95Ms = parseThreshold(process.env.SCALABILITY_NOTIFICATIONS_MAX_P95_MS, 900)
  const maxNotificationsSlowOver500Ms = parseThreshold(process.env.SCALABILITY_NOTIFICATIONS_MAX_SLOW_OVER_500MS, 3)

  const output = loadResultsFile()
  const byId = new Map(output.results.map((result) => [result.id, result] as const))
  const missingIds = TRACKED_CASE_IDS.filter((id) => !byId.has(id))
  const tracked = TRACKED_CASE_IDS
    .map((id) => byId.get(id))
    .filter((value): value is EndpointRunResult => !!value)

  const trackedFailures = tracked.filter((result) => !result.passed)
  const trackedDurations = tracked.map((result) => result.durationMs)
  const trackedP95 = percentile(trackedDurations, 95)
  const trackedSlowOver1s = tracked.filter((result) => result.durationMs > 1000).length
  const notificationTracked = tracked.filter((result) => result.id.startsWith('notifications.'))
  const notificationP95 = percentile(notificationTracked.map((result) => result.durationMs), 95)
  const notificationSlowOver500ms = notificationTracked.filter((result) => result.durationMs > 500).length

  const violations: string[] = []
  if (missingIds.length > 0) {
    violations.push(`Missing tracked cases (${missingIds.length}): ${missingIds.join(', ')}`)
  }
  if (trackedFailures.length > maxTrackedFailures) {
    violations.push(
      `Tracked case failures ${trackedFailures.length} exceed threshold ${maxTrackedFailures}: ${trackedFailures
        .map((result) => `${result.id}(status=${result.status})`)
        .join(', ')}`,
    )
  }
  if (trackedP95 > maxTrackedP95Ms) {
    violations.push(`Tracked p95 ${formatMs(trackedP95)} exceeds threshold ${formatMs(maxTrackedP95Ms)}`)
  }
  if (trackedSlowOver1s > maxTrackedSlowOver1s) {
    violations.push(
      `Tracked slow endpoints >1s count ${trackedSlowOver1s} exceeds threshold ${maxTrackedSlowOver1s}`,
    )
  }
  if (notificationTracked.length === 0) {
    violations.push('No notification endpoints found in tracked performance set')
  } else {
    if (notificationP95 > maxNotificationsP95Ms) {
      violations.push(
        `Notification endpoint p95 ${formatMs(notificationP95)} exceeds threshold ${formatMs(maxNotificationsP95Ms)}`,
      )
    }
    if (notificationSlowOver500ms > maxNotificationsSlowOver500Ms) {
      violations.push(
        `Notification endpoints >500ms count ${notificationSlowOver500ms} exceeds threshold ${maxNotificationsSlowOver500Ms}`,
      )
    }
  }

  console.log('[scalability-check] generatedAt=', output.generatedAt)
  console.log(
    `[scalability-check] tracked=${tracked.length}, failures=${trackedFailures.length}, p95=${formatMs(
      trackedP95,
    )}, slow>1s=${trackedSlowOver1s}`,
  )
  console.log(
    `[scalability-check] notifications tracked=${notificationTracked.length}, p95=${formatMs(
      notificationP95,
    )}, slow>500ms=${notificationSlowOver500ms}`,
  )

  if (violations.length === 0) {
    console.log('[scalability-check] PASS')
    process.exit(0)
  }

  console.error('[scalability-check] VIOLATIONS:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  console.error('[scalability-check] Rollback hint: set LIST_PAGING_ROLLOUT=off to disable paged list contract quickly.')
  console.error('[scalability-check] Optional cache fallback: set METRICS_CACHE_ENABLED=false.')

  if (rolloutMode === 'shadow') {
    console.warn('[scalability-check] Shadow mode keeps this non-blocking.')
    process.exit(0)
  }
  process.exit(1)
}

main()
