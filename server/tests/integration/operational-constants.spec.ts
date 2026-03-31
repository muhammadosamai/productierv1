import { afterEach, describe, expect, it } from 'vitest'
import { resetApiConfigCacheForTests } from '../../src/config/api'
import { apiRequest, createTestApp, registerAndLogin } from '../setup/testApp'

const initialApiUsersSearchLimit = process.env.API_USERS_SEARCH_LIMIT
const initialApiUsersListLimit = process.env.API_USERS_LIST_LIMIT

function restoreApiLimitEnv() {
  if (initialApiUsersSearchLimit === undefined) {
    delete process.env.API_USERS_SEARCH_LIMIT
  } else {
    process.env.API_USERS_SEARCH_LIMIT = initialApiUsersSearchLimit
  }

  if (initialApiUsersListLimit === undefined) {
    delete process.env.API_USERS_LIST_LIMIT
  } else {
    process.env.API_USERS_LIST_LIMIT = initialApiUsersListLimit
  }
}

afterEach(() => {
  restoreApiLimitEnv()
  resetApiConfigCacheForTests()
})

describe('operational constants', () => {
  it('uses API users list/search limits from runtime config', async () => {
    process.env.API_USERS_SEARCH_LIMIT = '2'
    process.env.API_USERS_LIST_LIMIT = '4'
    resetApiConfigCacheForTests()

    const app = await createTestApp()
    const { token } = await registerAndLogin(app, 'super_admin')

    for (let index = 0; index < 6; index += 1) {
      const response = await apiRequest(app, '/api/auth/register', {
        method: 'POST',
        body: {
          name: `Limit User ${index + 1}`,
          email: `limit-user-${index + 1}-${Date.now()}@productier.test`,
          password: 'password123',
        },
      })
      expect(response.status).toBe(200)
    }

    const legacyList = await apiRequest(app, '/api/auth/users', {
      method: 'GET',
      token,
    })
    expect(legacyList.status).toBe(200)
    expect(Array.isArray(legacyList.body)).toBe(true)
    expect((legacyList.body as unknown[]).length).toBe(4)

    const legacySearch = await apiRequest(app, '/api/auth/users?q=Limit%20User', {
      method: 'GET',
      token,
    })
    expect(legacySearch.status).toBe(200)
    expect(Array.isArray(legacySearch.body)).toBe(true)
    expect((legacySearch.body as unknown[]).length).toBe(2)

    const pagedList = await apiRequest(app, '/api/auth/users?paged=1&limit=999', {
      method: 'GET',
      token,
    })
    expect(pagedList.status).toBe(200)
    expect(Array.isArray(pagedList.body)).toBe(false)
    expect(Array.isArray(pagedList.body?.items)).toBe(true)
    expect(pagedList.body?.items.length).toBe(4)
  })

  it('uses product metrics overload threshold in workload classification', async () => {
    const app = await createTestApp()
    const { token, user } = await registerAndLogin(app, 'super_admin')

    const productResponse = await apiRequest(app, '/api/products', {
      method: 'POST',
      token,
      body: {
        name: `Workload Product ${Date.now()}`,
        description: 'operational constants integration test',
      },
    })
    expect(productResponse.status).toBe(200)
    const productId = productResponse.body?.id as string
    expect(productId).toBeTruthy()

    const storyResponse = await apiRequest(app, '/api/stories', {
      method: 'POST',
      token,
      body: {
        title: 'Workload Story',
        productId,
        description: 'story for workload thresholds',
      },
    })
    expect(storyResponse.status).toBe(200)
    const storyId = storyResponse.body?.id as string
    expect(storyId).toBeTruthy()

    for (let index = 0; index < 6; index += 1) {
      const taskResponse = await apiRequest(app, `/api/tasks/by-story/${storyId}`, {
        method: 'POST',
        token,
        body: {
          title: `WIP Task ${index + 1}`,
          status: 'in_progress',
          ownerUserId: user.id,
        },
      })
      expect(taskResponse.status).toBe(200)
    }

    const workloadBefore = await apiRequest(
      app,
      `/api/metrics/workload?productId=${encodeURIComponent(productId)}`,
      { method: 'GET', token },
    )
    expect(workloadBefore.status).toBe(200)
    expect(workloadBefore.body?.overloadThreshold).toBe(5)
    expect(Array.isArray(workloadBefore.body?.overloaded)).toBe(true)
    expect(workloadBefore.body.overloaded.length).toBeGreaterThan(0)

    const updateThreshold = await apiRequest(
      app,
      `/api/products/${encodeURIComponent(productId)}/settings/metrics`,
      {
        method: 'PATCH',
        token,
        body: { overloadWipThreshold: 10 },
      },
    )
    expect(updateThreshold.status).toBe(200)
    expect(updateThreshold.body?.metricsOverloadWipThreshold).toBe(10)

    const workloadAfter = await apiRequest(
      app,
      `/api/metrics/workload?productId=${encodeURIComponent(productId)}`,
      { method: 'GET', token },
    )
    expect(workloadAfter.status).toBe(200)
    expect(workloadAfter.body?.overloadThreshold).toBe(10)
    expect(Array.isArray(workloadAfter.body?.overloaded)).toBe(true)
    expect(workloadAfter.body.overloaded.length).toBe(0)
  })

  it('supports aggregate and team-scoped metrics queries without productId', async () => {
    const app = await createTestApp()
    const { token, user } = await registerAndLogin(app, 'super_admin')

    const productOneRes = await apiRequest(app, '/api/products', {
      method: 'POST',
      token,
      body: {
        name: `Aggregate Metrics Product 1 ${Date.now()}`,
      },
    })
    expect(productOneRes.status).toBe(200)
    const productOneId = productOneRes.body?.id as string
    const organizationId = productOneRes.body?.organizationId as string
    expect(productOneId).toBeTruthy()
    expect(organizationId).toBeTruthy()

    const productTwoRes = await apiRequest(app, '/api/products', {
      method: 'POST',
      token,
      body: {
        organizationId,
        name: `Aggregate Metrics Product 2 ${Date.now()}`,
      },
    })
    expect(productTwoRes.status).toBe(200)
    const productTwoId = productTwoRes.body?.id as string
    expect(productTwoId).toBeTruthy()

    const teamRes = await apiRequest(app, `/api/organizations/${encodeURIComponent(organizationId)}/teams`, {
      method: 'POST',
      token,
      body: {
        name: `Metrics Team ${Date.now()}`,
        key: `metrics-team-${Date.now().toString(36)}`,
        leadUserId: user.id,
      },
    })
    expect(teamRes.status).toBe(200)
    const teamId = teamRes.body?.id as string
    expect(teamId).toBeTruthy()

    const storyOneRes = await apiRequest(app, '/api/stories', {
      method: 'POST',
      token,
      body: {
        title: 'Aggregate Story One',
        productId: productOneId,
      },
    })
    expect(storyOneRes.status).toBe(200)
    const storyOneId = storyOneRes.body?.id as string
    expect(storyOneId).toBeTruthy()

    const storyTwoRes = await apiRequest(app, '/api/stories', {
      method: 'POST',
      token,
      body: {
        title: 'Aggregate Story Two',
        productId: productTwoId,
      },
    })
    expect(storyTwoRes.status).toBe(200)
    const storyTwoId = storyTwoRes.body?.id as string
    expect(storyTwoId).toBeTruthy()

    const teamTaskRes = await apiRequest(app, `/api/tasks/by-story/${encodeURIComponent(storyOneId)}`, {
      method: 'POST',
      token,
      body: {
        title: 'Team Scoped Task',
        status: 'in_progress',
        ownerUserId: user.id,
        ownerTeamId: teamId,
        assigneeTeamIds: [teamId],
        reviewerTeamIds: [teamId],
      },
    })
    expect(teamTaskRes.status).toBe(200)

    const globalTaskRes = await apiRequest(app, `/api/tasks/by-story/${encodeURIComponent(storyTwoId)}`, {
      method: 'POST',
      token,
      body: {
        title: 'Cross Product Task',
        status: 'blocked',
        ownerUserId: user.id,
      },
    })
    expect(globalTaskRes.status).toBe(200)

    const dashboardAll = await apiRequest(app, '/api/metrics/dashboard?scopeMode=all&period=30', {
      method: 'GET',
      token,
    })
    expect(dashboardAll.status).toBe(200)
    expect(typeof dashboardAll.body?.kpi?.totalTasks).toBe('number')
    expect(dashboardAll.body?.kpi?.totalTasks).toBeGreaterThanOrEqual(2)
    expect(typeof dashboardAll.body?.kpi?.onTimeRate).toBe('number')
    expect(typeof dashboardAll.body?.kpi?.onTimeRatePlanned).toBe('number')
    expect(typeof dashboardAll.body?.kpi?.onTimeRateUnplanned).toBe('number')
    expect(typeof dashboardAll.body?.kpi?.onTimeDueCountPlanned).toBe('number')
    expect(typeof dashboardAll.body?.kpi?.onTimeDueCountUnplanned).toBe('number')
    expect(typeof dashboardAll.body?.kpi?.dueDateQualityRate).toBe('number')
    expect(typeof dashboardAll.body?.atRiskWork?.total).toBe('number')
    expect(Array.isArray(dashboardAll.body?.atRiskWork?.trend)).toBe(true)
    expect(Array.isArray(dashboardAll.body?.atRiskWork?.byOwner)).toBe(true)
    expect(typeof dashboardAll.body?.atRiskWork?.timeInRisk?.medianDays).toBe('number')
    expect(typeof dashboardAll.body?.atRiskWork?.timeInRisk?.p85Days).toBe('number')
    expect(typeof dashboardAll.body?.atRiskWork?.timeInRisk?.sampleSize).toBe('number')

    const teamLeadKpisAll = await apiRequest(app, '/api/metrics/team-lead-kpis?scopeMode=all&period=30', {
      method: 'GET',
      token,
    })
    expect(teamLeadKpisAll.status).toBe(200)
    expect(Array.isArray(teamLeadKpisAll.body?.order)).toBe(true)
    expect(teamLeadKpisAll.body?.order?.length).toBe(11)
    expect(typeof teamLeadKpisAll.body?.items?.review_sla_adherence?.value).toBe('number')
    expect(typeof teamLeadKpisAll.body?.items?.execution_focus_ratio?.value).toBe('number')

    const executiveKpisAll = await apiRequest(app, '/api/metrics/executive-kpis?scopeMode=all&period=30', {
      method: 'GET',
      token,
    })
    expect(executiveKpisAll.status).toBe(200)
    expect(typeof executiveKpisAll.body?.kpis?.portfolioHealthScore?.value).toBe('number')
    expect(typeof executiveKpisAll.body?.kpis?.customerImpactProxy?.value).toBe('number')
    expect(typeof executiveKpisAll.body?.details?.throughputStabilityIndex?.score).toBe('number')
    expect(Array.isArray(executiveKpisAll.body?.details?.crossProductBottleneckHeatmap?.cells)).toBe(true)

    const workloadTeam = await apiRequest(
      app,
      `/api/metrics/workload?scopeMode=team&teamId=${encodeURIComponent(teamId)}&period=30`,
      {
        method: 'GET',
        token,
      },
    )
    expect(workloadTeam.status).toBe(200)
    expect(Array.isArray(workloadTeam.body?.memberWorkload)).toBe(true)
    expect(typeof workloadTeam.body?.overloadThreshold).toBe('number')
    expect(typeof workloadTeam.body?.capacityModel?.teamAdjustmentFactor).toBe('number')
    if (Array.isArray(workloadTeam.body?.memberWorkload) && workloadTeam.body.memberWorkload.length > 0) {
      const firstMember = workloadTeam.body.memberWorkload[0]
      expect(typeof firstMember?.sampleSize).toBe('number')
      expect(typeof firstMember?.loadRatioCalibrated).toBe('number')
      expect(typeof firstMember?.capacityConfidence).toBe('string')
      expect(typeof firstMember?.sampleConfidence).toBe('string')
    }

    const qualityAll = await apiRequest(app, '/api/metrics/quality?scopeMode=all&period=30', {
      method: 'GET',
      token,
    })
    expect(qualityAll.status).toBe(200)
    expect(typeof qualityAll.body?.firstPassRate).toBe('number')
    expect(typeof qualityAll.body?.reworkRate).toBe('number')
    expect(typeof qualityAll.body?.reworkPer100Completed).toBe('number')
    expect(typeof qualityAll.body?.reopenPer100Completed).toBe('number')
    expect(typeof qualityAll.body?.trend?.reworkSlope).toBe('number')
    expect(typeof qualityAll.body?.trend?.reopenSlope).toBe('number')
    expect(['healthy', 'watch', 'breach']).toContain(qualityAll.body?.trend?.reworkStatus)
    expect(Array.isArray(qualityAll.body?.reviewLoad)).toBe(true)

    const blockersAll = await apiRequest(app, '/api/metrics/blockers?scopeMode=all&period=30', {
      method: 'GET',
      token,
    })
    expect(blockersAll.status).toBe(200)
    expect(typeof blockersAll.body?.weightedBlockedDays).toBe('number')
    expect(typeof blockersAll.body?.blockedSlaBreachRate).toBe('number')
    expect(typeof blockersAll.body?.blockedSlaBreaches).toBe('number')

    const flowAll = await apiRequest(app, '/api/metrics/flow?scopeMode=all&period=30', {
      method: 'GET',
      token,
    })
    expect(flowAll.status).toBe(200)
    expect(typeof flowAll.body?.flowEfficiency).toBe('number')
    expect(typeof flowAll.body?.cycleTime?.p85).toBe('number')
    expect(typeof flowAll.body?.leadTime?.p85).toBe('number')
    expect(typeof flowAll.body?.cycleTime?.sampleSize).toBe('number')
    expect(typeof flowAll.body?.leadTime?.sampleSize).toBe('number')

    const predictabilityAll = await apiRequest(app, '/api/metrics/predictability?scopeMode=all&period=30', {
      method: 'GET',
      token,
    })
    expect(predictabilityAll.status).toBe(200)
    expect(typeof predictabilityAll.body?.avgPredictability).toBe('number')
    expect(Array.isArray(predictabilityAll.body?.riskMatrix)).toBe(true)
    expect(typeof predictabilityAll.body?.confidenceDrivers?.scopeChurn?.penalty).toBe('number')
    expect(typeof predictabilityAll.body?.confidenceDrivers?.scheduleVariance?.penalty).toBe('number')
    expect(typeof predictabilityAll.body?.confidenceDrivers?.completionStability?.baseline).toBe('number')

    const deliveriesAll = await apiRequest(app, '/api/metrics/deliveries-metrics?scopeMode=all&period=30', {
      method: 'GET',
      token,
    })
    expect(deliveriesAll.status).toBe(200)
    expect(typeof deliveriesAll.body?.activeDeliveries).toBe('number')
    expect(Array.isArray(deliveriesAll.body?.deliveryDetails)).toBe(true)
    if (Array.isArray(deliveriesAll.body?.deliveryDetails) && deliveriesAll.body.deliveryDetails.length > 0) {
      const firstDelivery = deliveriesAll.body.deliveryDetails[0]
      expect(typeof firstDelivery?.riskBreakdown?.varianceDays).toBe('number')
      expect(typeof firstDelivery?.riskBreakdown?.scopeAddedAfterStart).toBe('number')
      expect(typeof firstDelivery?.riskBreakdown?.blockedPressure).toBe('number')
    }

    const dashboardProductCompat = await apiRequest(
      app,
      `/api/metrics/dashboard?productId=${encodeURIComponent(productOneId)}&period=30`,
      {
        method: 'GET',
        token,
      },
    )
    expect(dashboardProductCompat.status).toBe(200)
    expect(typeof dashboardProductCompat.body?.kpi?.totalTasks).toBe('number')
  })
})
