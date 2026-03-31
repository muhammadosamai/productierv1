import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { S3StorageConfig } from '../config/storage'
import {
  buildObjectKey,
  encodePathSegments,
  type ReadFileOutput,
  type SaveFileInput,
  type SavedFile,
  type StorageAdapter,
} from './types'

function trimSlashes(input: string): string {
  return input.replace(/^\/+|\/+$/g, '')
}

export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      region: config.s3Region,
      endpoint: config.s3Endpoint || undefined,
      forcePathStyle: config.s3ForcePathStyle,
    })
  }

  private buildPublicPath(key: string): string {
    const encodedKey = encodePathSegments(key)

    if (this.config.publicBaseUrl) {
      return `${this.config.publicBaseUrl}/${encodedKey}`
    }

    if (this.config.s3Endpoint) {
      if (this.config.s3ForcePathStyle) {
        return `${this.config.s3Endpoint}/${this.config.s3Bucket}/${encodedKey}`
      }
      return `${this.config.s3Endpoint}/${encodedKey}`
    }

    return `https://${this.config.s3Bucket}.s3.${this.config.s3Region}.amazonaws.com/${encodedKey}`
  }

  async saveFile(input: SaveFileInput): Promise<SavedFile> {
    const key = buildObjectKey(input.namespace, input.filename)

    await this.client.send(new PutObjectCommand({
      Bucket: this.config.s3Bucket,
      Key: key,
      Body: input.bytes,
      ContentType: input.contentType || undefined,
    }))

    return {
      key,
      publicPath: this.buildPublicPath(key),
    }
  }

  async readByPublicPath(publicPath: string): Promise<ReadFileOutput | null> {
    const key = this.extractKey(publicPath)
    if (!key) return null

    try {
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.config.s3Bucket,
        Key: key,
      }))
      const body = response.Body as {
        transformToByteArray?: () => Promise<Uint8Array>
        arrayBuffer?: () => Promise<ArrayBuffer>
      } | Uint8Array | undefined

      if (!body) return null
      if (body instanceof Uint8Array) {
        return {
          bytes: body,
          contentType: response.ContentType || null,
        }
      }

      if (typeof body.transformToByteArray === 'function') {
        return {
          bytes: await body.transformToByteArray(),
          contentType: response.ContentType || null,
        }
      }

      if (typeof body.arrayBuffer === 'function') {
        return {
          bytes: new Uint8Array(await body.arrayBuffer()),
          contentType: response.ContentType || null,
        }
      }

      return null
    } catch {
      return null
    }
  }

  private extractKey(publicPath: string): string | null {
    let working = publicPath.trim()
    if (!working) return null

    if (/^https?:\/\//i.test(working)) {
      try {
        working = new URL(working).pathname
      } catch {
        return null
      }
    }

    working = working.replace(/^\/+/, '')
    const normalizedPrefix = trimSlashes(this.config.publicPrefix)
    if (normalizedPrefix && working.startsWith(`${normalizedPrefix}/`)) {
      working = working.slice(normalizedPrefix.length + 1)
    }

    const bucketPrefix = `${this.config.s3Bucket}/`
    if (working.startsWith(bucketPrefix)) {
      working = working.slice(bucketPrefix.length)
    }

    const decoded = working
      .split('/')
      .filter((segment) => segment.length > 0)
      .map((segment) => {
        try {
          return decodeURIComponent(segment)
        } catch {
          return segment
        }
      })
      .join('/')

    return decoded || null
  }

  async deleteByPublicPath(publicPath: string): Promise<void> {
    const key = this.extractKey(publicPath)
    if (!key) return

    try {
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.config.s3Bucket,
        Key: key,
      }))
    } catch {
      // Best-effort cleanup.
    }
  }
}

