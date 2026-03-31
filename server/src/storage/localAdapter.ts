import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { LocalStorageConfig } from '../config/storage'
import { buildObjectKey, type ReadFileOutput, type SaveFileInput, type SavedFile, type StorageAdapter } from './types'

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/')
}

function normalizePublicPath(pathValue: string): string {
  if (/^https?:\/\//i.test(pathValue)) {
    try {
      return new URL(pathValue).pathname
    } catch {
      return pathValue
    }
  }
  return pathValue
}

function stripKnownPrefix(input: string, prefix: string): string {
  const normalizedInput = input.replace(/^\/+/, '')
  const normalizedPrefix = prefix.replace(/^\/+/, '').replace(/\/+$/, '')
  if (!normalizedPrefix) return normalizedInput

  if (normalizedInput === normalizedPrefix) return ''
  if (normalizedInput.startsWith(`${normalizedPrefix}/`)) {
    return normalizedInput.slice(normalizedPrefix.length + 1)
  }
  return normalizedInput
}

function inferContentTypeFromFilename(pathValue: string): string | null {
  const extension = path.extname(pathValue).toLowerCase()
  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    case '.pdf':
      return 'application/pdf'
    case '.txt':
      return 'text/plain; charset=utf-8'
    case '.csv':
      return 'text/csv; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.zip':
      return 'application/zip'
    default:
      return null
  }
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly config: LocalStorageConfig) {}

  private buildPublicPath(key: string): string {
    const prefixedPath = `${this.config.publicPrefix}/${key}`.replace(/\/{2,}/g, '/')
    if (!this.config.publicBaseUrl) return prefixedPath
    return `${this.config.publicBaseUrl}${prefixedPath}`
  }

  async saveFile(input: SaveFileInput): Promise<SavedFile> {
    const key = buildObjectKey(input.namespace, input.filename)
    const keyAsPosix = toPosixPath(key)
    const fullPath = path.resolve(this.config.localRoot, ...keyAsPosix.split('/'))
    const directory = path.dirname(fullPath)

    await mkdir(directory, { recursive: true })
    await writeFile(fullPath, input.bytes)

    return {
      key,
      publicPath: this.buildPublicPath(key),
    }
  }

  private resolvePathFromPublicPath(publicPath: string): string | null {
    const maybePathname = normalizePublicPath(publicPath)
    const withoutLeadingSlash = maybePathname.replace(/^\/+/, '')
    const strippedByPrefix = stripKnownPrefix(withoutLeadingSlash, this.config.publicPrefix)
    const normalizedKey = toPosixPath(strippedByPrefix).replace(/^\/+/, '')
    if (!normalizedKey) return null

    const resolved = path.resolve(this.config.localRoot, ...normalizedKey.split('/'))
    const rootResolved = path.resolve(this.config.localRoot)
    const rootWithSeparator = rootResolved.endsWith(path.sep) ? rootResolved : `${rootResolved}${path.sep}`
    if (resolved !== rootResolved && !resolved.startsWith(rootWithSeparator)) return null
    return resolved
  }

  async readByPublicPath(publicPath: string): Promise<ReadFileOutput | null> {
    const resolvedPath = this.resolvePathFromPublicPath(publicPath)
    if (!resolvedPath) return null
    try {
      const bytes = new Uint8Array(await readFile(resolvedPath))
      return {
        bytes,
        contentType: inferContentTypeFromFilename(resolvedPath),
      }
    } catch {
      return null
    }
  }

  async deleteByPublicPath(publicPath: string): Promise<void> {
    const resolvedPath = this.resolvePathFromPublicPath(publicPath)
    if (!resolvedPath) return
    try {
      await unlink(resolvedPath)
    } catch {
      // Best-effort cleanup.
    }
  }
}

