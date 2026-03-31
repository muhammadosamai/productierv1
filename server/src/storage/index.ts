import { getStorageConfig, type StorageConfig } from '../config/storage'
import { LocalStorageAdapter } from './localAdapter'
import { S3StorageAdapter } from './s3Adapter'
import type { StorageAdapter } from './types'

let cachedStorage: StorageAdapter | null = null
let cachedBackend: StorageConfig['backend'] | null = null

export function getStorage(): StorageAdapter {
  const config = getStorageConfig()
  if (cachedStorage && cachedBackend === config.backend) return cachedStorage

  cachedStorage = config.backend === 'local'
    ? new LocalStorageAdapter(config)
    : new S3StorageAdapter(config)

  cachedBackend = config.backend
  return cachedStorage
}

export function resetStorageForTests() {
  cachedStorage = null
  cachedBackend = null
}

