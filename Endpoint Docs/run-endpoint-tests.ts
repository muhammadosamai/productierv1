import { buildEndpointCases, type EndpointCase } from './endpoint-cases'
import {
  cleanupFixtures,
  createDefaultContext,
  login,
  requestEndpoint,
  setupFixtures,
  type EndpointResponse,
  type EndpointRunContext,
} from './fixtures'

type Nullable<T> = T | null

interface EndpointExecutionResult {
  id: string
  method: EndpointCase['method']
  pathTemplate: string
  resolvedPath: string
  status: number
  expectedStatuses: number[]
  passed: boolean
  statusMatched: boolean
  hasErrorField: boolean
  errorFieldMessage: string | null
  executionError: string | null
  durationMs: number
  slowOver1s: boolean
  slowOver2s: boolean
  isNull: boolean
  isEmptyArray: boolean
  isEmptyObject: boolean
  isEmptyString: boolean
  auth: EndpointCase['auth']
  contentType: EndpointCase['contentType']
  requiredPathParams: string[]
  requiredQueryParams: string[]
  requiredBodyFields: string[]
  dependencyNote?: string
  responsePreview: string
}

interface RunSummary {
  total: number
  passed: number
  failed: number
  slowOver1s: number
  slowOver2s: number
  nullResponses: number
  emptyArrayResponses: number
  emptyObjectResponses: number
  emptyStringResponses: number
}

function truncate(value: string, max = 240): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function serializePreview(data: unknown): string {
  if (data === null) return 'null'
  if (data === undefined) return 'undefined'
  if (typeof data === 'string') return truncate(data)
  if (typeof data === 'number' || typeof data === 'boolean') return String(data)
  return truncate(safeStringify(data))
}

function getErrorField(data: unknown): Nullable<string> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const maybeError = (data as Record<string, unknown>).error
  return typeof maybeError === 'string' && maybeError.length > 0 ? maybeError : null
}

function isEmptyObject(data: unknown): boolean {
  return !!(data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data as Record<string, unknown>).length === 0)
}

function resolvePathWithQuery(path: string, query?: Record<string, string | number | boolean | null | undefined>): string {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    params.set(key, String(value))
  }
  const encoded = params.toString()
  return encoded.length > 0 ? `${path}?${encoded}` : path
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : '-'
}

function formatMs(ms: number): string {
  return `${Math.round(ms * 100) / 100}`
}

async function executeCase(ctx: EndpointRunContext, testCase: EndpointCase): Promise<EndpointExecutionResult> {
  const started = performance.now()

  try {
    const requestSpec = await testCase.buildRequest(ctx)
    const resolvedPath = resolvePathWithQuery(requestSpec.path, requestSpec.query)
    const response: EndpointResponse = await requestEndpoint(ctx, requestSpec)
    const ended = performance.now()
    const durationMs = ended - started
    const errorField = getErrorField(response.data)
    const statusMatched = testCase.expectedStatuses.includes(response.status)
    const expectsErrorStatus = testCase.expectedStatuses.every((status) => status >= 400)
    const allowsErrorField = expectsErrorStatus || response.status >= 400
    const passed = statusMatched && (allowsErrorField || !errorField)

    if (passed && testCase.onSuccess) {
      await testCase.onSuccess(ctx, response)
    }

    const data = response.data
    return {
      id: testCase.id,
      method: testCase.method,
      pathTemplate: testCase.pathTemplate,
      resolvedPath,
      status: response.status,
      expectedStatuses: [...testCase.expectedStatuses],
      passed,
      statusMatched,
      hasErrorField: !!errorField,
      errorFieldMessage: errorField,
      executionError: null,
      durationMs,
      slowOver1s: durationMs > 1000,
      slowOver2s: durationMs > 2000,
      isNull: data === null,
      isEmptyArray: Array.isArray(data) && data.length === 0,
      isEmptyObject: isEmptyObject(data),
      isEmptyString: data === '',
      auth: testCase.auth,
      contentType: testCase.contentType,
      requiredPathParams: [...testCase.requiredPathParams],
      requiredQueryParams: [...testCase.requiredQueryParams],
      requiredBodyFields: [...testCase.requiredBodyFields],
      dependencyNote: testCase.dependencyNote,
      responsePreview: serializePreview(data),
    }
  } catch (error) {
    const ended = performance.now()
    const durationMs = ended - started
    const message = error instanceof Error ? error.message : String(error)
    return {
      id: testCase.id,
      method: testCase.method,
      pathTemplate: testCase.pathTemplate,
      resolvedPath: testCase.pathTemplate,
      status: 0,
      expectedStatuses: [...testCase.expectedStatuses],
      passed: false,
      statusMatched: false,
      hasErrorField: false,
      errorFieldMessage: null,
      executionError: message,
      durationMs,
      slowOver1s: durationMs > 1000,
      slowOver2s: durationMs > 2000,
      isNull: false,
      isEmptyArray: false,
      isEmptyObject: false,
      isEmptyString: false,
      auth: testCase.auth,
      contentType: testCase.contentType,
      requiredPathParams: [...testCase.requiredPathParams],
      requiredQueryParams: [...testCase.requiredQueryParams],
      requiredBodyFields: [...testCase.requiredBodyFields],
      dependencyNote: testCase.dependencyNote,
      responsePreview: truncate(message),
    }
  }
}

function summarize(results: EndpointExecutionResult[]): RunSummary {
  return {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    slowOver1s: results.filter((r) => r.slowOver1s).length,
    slowOver2s: results.filter((r) => r.slowOver2s).length,
    nullResponses: results.filter((r) => r.isNull).length,
    emptyArrayResponses: results.filter((r) => r.isEmptyArray).length,
    emptyObjectResponses: results.filter((r) => r.isEmptyObject).length,
    emptyStringResponses: results.filter((r) => r.isEmptyString).length,
  }
}

function buildReportMarkdown(
  ctx: EndpointRunContext,
  startedAtIso: string,
  completedAtIso: string,
  setupError: Nullable<string>,
  results: EndpointExecutionResult[],
): string {
  const summary = summarize(results)
  const slowest = [...results].sort((a, b) => b.durationMs - a.durationMs).slice(0, 20)
  const failures = results.filter((r) => !r.passed)
  const nullOrEmpty = results.filter((r) => r.isNull || r.isEmptyArray || r.isEmptyObject || r.isEmptyString)

  const lines: string[] = []
  lines.push('# Endpoint Test Report')
  lines.push('')
  lines.push(`- Generated at: ${completedAtIso}`)
  lines.push(`- Run started at: ${startedAtIso}`)
  lines.push(`- Base URL: \`${ctx.baseUrl}\``)
  lines.push(`- Product fixture name: \`${ctx.fixtures.productName}\``)
  lines.push(`- Product fixture id: \`${ctx.fixtures.productId ?? 'unknown'}\``)
  lines.push(`- Run ID: \`${ctx.fixtures.runId}\``)
  lines.push(`- Total endpoints tested: **${summary.total}**`)
  lines.push(`- Passed: **${summary.passed}**`)
  lines.push(`- Failed: **${summary.failed}**`)
  lines.push(`- Slow >1s: **${summary.slowOver1s}**`)
  lines.push(`- Slow >2s: **${summary.slowOver2s}**`)
  lines.push(`- Null responses: **${summary.nullResponses}**`)
  lines.push(`- Empty array responses: **${summary.emptyArrayResponses}**`)
  lines.push(`- Empty object responses: **${summary.emptyObjectResponses}**`)
  lines.push(`- Empty string responses: **${summary.emptyStringResponses}**`)
  if (setupError) {
    lines.push(`- Fixture setup note: **${setupError}**`)
  }
  lines.push('')

  lines.push('## Slowest Endpoints')
  lines.push('')
  lines.push('| Endpoint | Status | Duration (ms) | Slow Tag | Pass |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const row of slowest) {
    const slowTag = row.slowOver2s ? '>2s' : row.slowOver1s ? '>1s' : '-'
    lines.push(`| \`${row.method} ${escapeCell(row.resolvedPath)}\` | ${row.status} | ${formatMs(row.durationMs)} | ${slowTag} | ${row.passed ? 'yes' : 'no'} |`)
  }
  lines.push('')

  lines.push('## Failing Endpoints')
  lines.push('')
  if (failures.length === 0) {
    lines.push('No failing endpoints.')
  } else {
    lines.push('| Endpoint | Status | Expected | Duration (ms) | Error |')
    lines.push('| --- | --- | --- | --- | --- |')
    for (const row of failures) {
      const error = row.executionError || row.errorFieldMessage || 'status mismatch'
      lines.push(`| \`${row.method} ${escapeCell(row.resolvedPath)}\` | ${row.status} | ${escapeCell(row.expectedStatuses.join(', '))} | ${formatMs(row.durationMs)} | ${escapeCell(truncate(error, 200))} |`)
    }
  }
  lines.push('')

  lines.push('## Null / Empty Responses')
  lines.push('')
  if (nullOrEmpty.length === 0) {
    lines.push('No null or empty responses detected.')
  } else {
    lines.push('| Endpoint | Status | Null | Empty Array | Empty Object | Empty String |')
    lines.push('| --- | --- | --- | --- | --- | --- |')
    for (const row of nullOrEmpty) {
      lines.push(`| \`${row.method} ${escapeCell(row.resolvedPath)}\` | ${row.status} | ${row.isNull ? 'yes' : 'no'} | ${row.isEmptyArray ? 'yes' : 'no'} | ${row.isEmptyObject ? 'yes' : 'no'} | ${row.isEmptyString ? 'yes' : 'no'} |`)
    }
  }
  lines.push('')

  lines.push('## Endpoint Parameter Checklist')
  lines.push('')
  lines.push('| Endpoint | Auth | Required Path Params | Required Query Params | Required Body Fields | Status | Pass | Duration (ms) |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const row of results) {
    lines.push(`| \`${row.method} ${escapeCell(row.pathTemplate)}\` | ${row.auth} | ${escapeCell(formatList(row.requiredPathParams))} | ${escapeCell(formatList(row.requiredQueryParams))} | ${escapeCell(formatList(row.requiredBodyFields))} | ${row.status} | ${row.passed ? 'yes' : 'no'} | ${formatMs(row.durationMs)} |`)
  }
  lines.push('')

  lines.push('## Full Execution Results')
  lines.push('')
  lines.push('| Case ID | Endpoint | Status | Expected | Pass | Error Field | Duration (ms) | Response Preview |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const row of results) {
    const errorField = row.errorFieldMessage ?? '-'
    lines.push(`| \`${escapeCell(row.id)}\` | \`${row.method} ${escapeCell(row.resolvedPath)}\` | ${row.status} | ${escapeCell(row.expectedStatuses.join(', '))} | ${row.passed ? 'yes' : 'no'} | ${escapeCell(truncate(errorField, 80))} | ${formatMs(row.durationMs)} | ${escapeCell(truncate(row.responsePreview, 160))} |`)
  }
  lines.push('')

  return `${lines.join('\n')}\n`
}

async function main(): Promise<void> {
  let ctx: EndpointRunContext
  try {
    ctx = createDefaultContext()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      'Endpoint docs configuration is invalid. ' +
      `${message} ` +
      'Set required API_* env vars before running endpoint tests.',
    )
  }

  const startedAtIso = new Date().toISOString()
  const failOnFailure = (process.env.FAIL_ON_ENDPOINT_FAILURE || 'false').toLowerCase() === 'true'

  console.log(`Running endpoint tests against ${ctx.baseUrl}`)
  console.log(`Run ID: ${ctx.fixtures.runId}`)

  ctx.sessions.superAdmin = await login(ctx.baseUrl, ctx.credentials.email, ctx.credentials.password)
  if (ctx.sessions.superAdmin.role === 'super_admin') {
    let demotionOrganizationId = ''
    const onboardingStateRes = await requestEndpoint(ctx, {
      method: 'GET',
      path: '/api/onboarding/state',
      auth: 'superAdmin',
    })
    if (onboardingStateRes.status === 200) {
      const payload = onboardingStateRes.data as Record<string, unknown> | null
      demotionOrganizationId = typeof payload?.activeOrganizationId === 'string'
        ? payload.activeOrganizationId.trim()
        : ''
    }

    if (demotionOrganizationId) {
      const demotionPath =
        `/api/organizations/${encodeURIComponent(demotionOrganizationId)}/users-admin/${encodeURIComponent(ctx.sessions.superAdmin.userId)}/role`
      const demoteRes = await requestEndpoint(ctx, {
        method: 'PUT',
        path: demotionPath,
        auth: 'superAdmin',
        json: { role: 'admin' },
      })
      if (demoteRes.status === 200) {
        ctx.sessions.superAdmin = await login(ctx.baseUrl, ctx.credentials.email, ctx.credentials.password)
      }
    }
  }
  if (ctx.sessions.superAdmin.role !== 'admin' && ctx.sessions.superAdmin.role !== 'super_admin') {
    throw new Error(
      `API_EMAIL must be an admin-level account for endpoint docs coverage (got role="${ctx.sessions.superAdmin.role}").`,
    )
  }
  ctx.sessions.regularUser = await login(ctx.baseUrl, ctx.credentials.regularEmail, ctx.credentials.regularPassword)

  let setupError: string | null = null
  try {
    await setupFixtures(ctx)
  } catch (error) {
    setupError = error instanceof Error ? error.message : String(error)
    console.warn(`Fixture setup had issues: ${setupError}`)
  }

  const endpointCases = buildEndpointCases()
  console.log(`Executing ${endpointCases.length} endpoint cases...`)

  const results: EndpointExecutionResult[] = []
  for (const endpointCase of endpointCases) {
    const result = await executeCase(ctx, endpointCase)
    results.push(result)
    const statusLabel = result.passed ? 'PASS' : 'FAIL'
    console.log(
      `[${statusLabel}] ${result.method} ${result.resolvedPath} | status=${result.status} | ${formatMs(result.durationMs)}ms`,
    )
  }

  await cleanupFixtures(ctx)

  const completedAtIso = new Date().toISOString()
  const summary = summarize(results)
  const reportMarkdown = buildReportMarkdown(ctx, startedAtIso, completedAtIso, setupError, results)
  const outputPayload = {
    generatedAt: completedAtIso,
    startedAt: startedAtIso,
    baseUrl: ctx.baseUrl,
    runId: ctx.fixtures.runId,
    setupError,
    summary,
    results,
  }

  const reportPath = new URL('./endpoint-report.md', import.meta.url)
  const resultsPath = new URL('./endpoint-results.json', import.meta.url)
  await Bun.write(reportPath, reportMarkdown)
  await Bun.write(resultsPath, JSON.stringify(outputPayload, null, 2))

  console.log('')
  console.log(`Report written: ${reportPath.pathname}`)
  console.log(`Raw results written: ${resultsPath.pathname}`)
  console.log(`Summary -> total=${summary.total}, passed=${summary.passed}, failed=${summary.failed}, slow>1s=${summary.slowOver1s}, slow>2s=${summary.slowOver2s}`)

  if (failOnFailure && summary.failed > 0) {
    throw new Error(`Endpoint test run completed with ${summary.failed} failing endpoints.`)
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error('Endpoint test run failed:', message)
  process.exit(1)
})
