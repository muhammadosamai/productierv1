import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHybridSettings } from '@/composables/useHybridSettings'

const { setByKeyMock, getAllMock } = vi.hoisted(() => ({
  setByKeyMock: vi.fn(),
  getAllMock: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  settingsApi: {
    setByKey: setByKeyMock,
    getAll: getAllMock,
  },
}))

describe('useHybridSettings', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setByKeyMock.mockReset()
    getAllMock.mockReset()
    setByKeyMock.mockResolvedValue({ key: 'x', value: null })
    getAllMock.mockResolvedValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces per key without dropping cross-key writes', async () => {
    const authToken = ref('token-1')
    const { saveSetting } = useHybridSettings(authToken, 200)

    saveSetting('home.activeView', 'my_tasks')
    saveSetting('home.briefMode', 'summary')

    await vi.advanceTimersByTimeAsync(200)

    expect(setByKeyMock).toHaveBeenCalledTimes(2)
    expect(setByKeyMock).toHaveBeenCalledWith('home.activeView', 'my_tasks', 'token-1')
    expect(setByKeyMock).toHaveBeenCalledWith('home.briefMode', 'summary', 'token-1')
  })

  it('coalesces rapid updates for the same key', async () => {
    const authToken = ref('token-1')
    const { saveSetting } = useHybridSettings(authToken, 200)

    saveSetting('home.activeView', 'my_tasks')
    saveSetting('home.activeView', 'team')
    saveSetting('home.activeView', 'executive')

    await vi.advanceTimersByTimeAsync(200)

    expect(setByKeyMock).toHaveBeenCalledTimes(1)
    expect(setByKeyMock).toHaveBeenCalledWith('home.activeView', 'executive', 'token-1')
  })

  it('flushes pending writes on cleanup', async () => {
    const authToken = ref('token-1')
    const { saveSetting, cleanup } = useHybridSettings(authToken, 500)

    saveSetting('home.activeView', 'my_tasks')
    saveSetting('home.briefMode', 'summary')
    cleanup()

    expect(setByKeyMock).toHaveBeenCalledTimes(2)

    await vi.runAllTimersAsync()
    expect(setByKeyMock).toHaveBeenCalledTimes(2)
  })
})
