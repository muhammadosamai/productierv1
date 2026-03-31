export interface SaveFileInput {
  namespace: string
  filename: string
  contentType: string
  bytes: Uint8Array
}

export interface SavedFile {
  key: string
  publicPath: string
}

export interface ReadFileOutput {
  bytes: Uint8Array
  contentType: string | null
}

export interface StorageAdapter {
  saveFile(input: SaveFileInput): Promise<SavedFile>
  readByPublicPath(publicPath: string): Promise<ReadFileOutput | null>
  deleteByPublicPath(publicPath: string): Promise<void>
}

export function normalizeNamespace(namespace: string): string {
  const normalized = namespace.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!normalized) throw new Error('Upload namespace must not be empty')
  return normalized
}

export function normalizeFilename(filename: string): string {
  const normalized = filename.trim().replace(/[/\\]+/g, '-')
  if (!normalized) throw new Error('Upload filename must not be empty')
  return normalized
}

export function buildObjectKey(namespace: string, filename: string): string {
  return `${normalizeNamespace(namespace)}/${normalizeFilename(filename)}`
}

export function encodePathSegments(pathValue: string): string {
  return pathValue
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

