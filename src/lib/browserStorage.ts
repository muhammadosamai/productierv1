export interface NumberBounds {
  min?: number
  max?: number
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function storageGet(key: string): string | null {
  const storage = getStorage()
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

export function storageSet(key: string, value: string): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(key, value)
  } catch {
    // Ignore quota/availability errors to keep UI responsive.
  }
}

export function storageRemove(key: string): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    // Ignore deletion errors.
  }
}

export function storageGetJson<T>(key: string, fallback: T): T {
  const raw = storageGet(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function storageSetJson(key: string, value: unknown): void {
  storageSet(key, JSON.stringify(value))
}

export function storageGetBoolean(key: string, fallback = false): boolean {
  const raw = storageGet(key)
  if (raw === null) return fallback
  return raw === 'true'
}

export function storageGetNumber(
  key: string,
  fallback: number,
  bounds: NumberBounds = {},
): number {
  const raw = storageGet(key)
  if (!raw) return fallback

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return fallback

  if (typeof bounds.min === 'number' && parsed < bounds.min) {
    return bounds.min
  }
  if (typeof bounds.max === 'number' && parsed > bounds.max) {
    return bounds.max
  }
  return parsed
}
