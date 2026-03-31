import { describe, expect, it } from 'vitest'
import { apiRequest, createTestApp, registerAndLogin } from '../setup/testApp'

describe('workflow chain integration', () => {
  it('covers story -> task -> delivery -> release -> deployment flow', async () => {
    const app = await createTestApp()
    const { token } = await registerAndLogin(app, 'super_admin')

    const productRes = await apiRequest(app, '/api/products', {
      method: 'POST',
      token,
      body: {
        name: `Integration Product ${Date.now()}`,
        description: 'workflow-chain test',
      },
    })
    expect(productRes.status).toBe(200)
    const productId = productRes.body?.id as string
    expect(productId).toBeTruthy()

    const deliveryRes = await apiRequest(app, '/api/deliveries', {
      method: 'POST',
      token,
      body: {
        title: 'Delivery for workflow',
        productId,
      },
    })
    expect(deliveryRes.status).toBe(200)
    const deliveryId = deliveryRes.body?.id as string
    expect(deliveryId).toBeTruthy()

    const storyRes = await apiRequest(app, '/api/stories', {
      method: 'POST',
      token,
      body: {
        title: 'Story for workflow',
        productId,
        description: 'story in integration flow',
      },
    })
    expect(storyRes.status).toBe(200)
    const storyId = storyRes.body?.id as string
    expect(storyId).toBeTruthy()

    const taskRes = await apiRequest(app, `/api/tasks/by-story/${storyId}`, {
      method: 'POST',
      token,
      body: {
        title: 'Task linked to delivery',
        status: 'in_progress',
        deliveryId,
      },
    })
    expect(taskRes.status).toBe(200)
    expect(taskRes.body?.deliveryId).toBe(deliveryId)

    const deliveryAfterTask = await apiRequest(app, `/api/deliveries/${deliveryId}`, {
      method: 'GET',
      token,
    })
    expect(deliveryAfterTask.status).toBe(200)
    expect(deliveryAfterTask.body?.status).toBe('in_progress')

    const releaseCreate = await apiRequest(app, '/api/releases', {
      method: 'POST',
      token,
      body: {
        title: 'Release for workflow',
        productId,
        deliveryIds: [deliveryId],
      },
    })
    expect(releaseCreate.status).toBe(200)
    const releaseId = releaseCreate.body?.id as string
    expect(releaseId).toBeTruthy()

    const releaseDetails = await apiRequest(app, `/api/releases/${releaseId}`, {
      method: 'GET',
      token,
    })
    expect(releaseDetails.status).toBe(200)
    expect(Array.isArray(releaseDetails.body?.releaseDeployments)).toBe(true)
    expect(releaseDetails.body.releaseDeployments).toHaveLength(3)

    const devDeployment = releaseDetails.body.releaseDeployments.find(
      (deployment: { environment: string }) => deployment.environment === 'dev'
    )
    expect(devDeployment).toBeTruthy()

    const serverCreate = await apiRequest(app, '/api/servers', {
      method: 'POST',
      token,
      body: {
        name: 'DEV Server',
        environment: 'dev',
        productId,
      },
    })
    expect(serverCreate.status).toBe(200)
    const serverId = serverCreate.body?.id as string
    expect(serverId).toBeTruthy()

    const attachTarget = await apiRequest(
      app,
      `/api/releases/${releaseId}/deployments/${devDeployment.id}/targets`,
      {
        method: 'POST',
        token,
        body: { serverIds: [serverId] },
      }
    )
    expect(attachTarget.status).toBe(200)
    expect(Array.isArray(attachTarget.body)).toBe(true)
    const targetId = attachTarget.body[0]?.id as string
    expect(targetId).toBeTruthy()

    const updateTarget = await apiRequest(
      app,
      `/api/releases/${releaseId}/deployments/${devDeployment.id}/targets/${targetId}`,
      {
        method: 'PUT',
        token,
        body: { status: 'deployed' },
      }
    )
    expect(updateTarget.status).toBe(200)
    expect(updateTarget.body?.status).toBe('deployed')

    const releaseAfterDeploy = await apiRequest(app, `/api/releases/${releaseId}`, {
      method: 'GET',
      token,
    })
    expect(releaseAfterDeploy.status).toBe(200)

    const updatedDeployment = releaseAfterDeploy.body.releaseDeployments.find(
      (deployment: { id: string }) => deployment.id === devDeployment.id
    )
    expect(updatedDeployment?.status).toBe('deployed')
    expect(releaseAfterDeploy.body.status).toBe('in_progress')
  })

  it('returns canonical 401 for protected release/delivery/server writes', async () => {
    const app = await createTestApp()

    const checks = [
      apiRequest(app, '/api/servers', {
        method: 'POST',
        body: { name: 'Server', environment: 'dev', productId: '00000000-0000-0000-0000-000000000000' },
      }),
      apiRequest(app, '/api/deliveries', {
        method: 'POST',
        body: { title: 'Delivery', productId: '00000000-0000-0000-0000-000000000000' },
      }),
      apiRequest(app, '/api/releases', {
        method: 'POST',
        body: { title: 'Release', productId: '00000000-0000-0000-0000-000000000000' },
      }),
    ]

    const responses = await Promise.all(checks)
    for (const response of responses) {
      expect(response.status).toBe(401)
      expect(response.body?.error).toBe('Unauthorized')
      expect(response.body?.code).toBe('UNAUTHORIZED')
    }
  })

  it('returns 400 when adding deployment targets without server ids', async () => {
    const app = await createTestApp()
    const { token } = await registerAndLogin(app, 'super_admin')

    const productRes = await apiRequest(app, '/api/products', {
      method: 'POST',
      token,
      body: {
        name: `Targets Product ${Date.now()}`,
        description: 'target validation test',
      },
    })
    expect(productRes.status).toBe(200)
    const productId = productRes.body?.id as string

    const releaseCreate = await apiRequest(app, '/api/releases', {
      method: 'POST',
      token,
      body: {
        title: 'Release target validation',
        productId,
      },
    })
    expect(releaseCreate.status).toBe(200)
    const releaseId = releaseCreate.body?.id as string

    const releaseDetails = await apiRequest(app, `/api/releases/${releaseId}`, {
      method: 'GET',
      token,
    })
    expect(releaseDetails.status).toBe(200)
    const devDeployment = releaseDetails.body.releaseDeployments.find(
      (deployment: { environment: string }) => deployment.environment === 'dev'
    )
    expect(devDeployment).toBeTruthy()

    const addTargets = await apiRequest(
      app,
      `/api/releases/${releaseId}/deployments/${devDeployment.id}/targets`,
      {
        method: 'POST',
        token,
        body: { serverIds: [] },
      }
    )

    expect(addTargets.status).toBe(400)
    expect(addTargets.body?.error).toBe('No server IDs provided')
    expect(addTargets.body?.code).toBe('BAD_REQUEST')
  })

  it('returns canonical 404 for missing releases', async () => {
    const app = await createTestApp()
    const { token } = await registerAndLogin(app, 'super_admin')

    const missingRelease = await apiRequest(
      app,
      '/api/releases/00000000-0000-0000-0000-000000000000',
      {
        method: 'GET',
        token,
      }
    )

    expect(missingRelease.status).toBe(404)
    expect(missingRelease.body?.error).toBe('Release not found')
    expect(missingRelease.body?.code).toBe('NOT_FOUND')
  })

  it('returns 422 validation payloads for schema validation failures', async () => {
    const app = await createTestApp()
    const { token } = await registerAndLogin(app, 'super_admin')

    const invalidServerPayload = await apiRequest(app, '/api/servers', {
      method: 'POST',
      token,
      body: {
        environment: 'dev',
        productId: '00000000-0000-0000-0000-000000000000',
      },
    })

    expect(invalidServerPayload.status).toBe(422)
    expect(invalidServerPayload.body?.type).toBe('validation')
    expect(invalidServerPayload.body?.on).toBe('body')
  })
})
