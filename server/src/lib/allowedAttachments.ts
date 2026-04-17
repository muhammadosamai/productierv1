import { fileTypeFromBuffer } from 'file-type'

/**
 * Allowed task/story/issue attachment types.
 * Keep in sync with `src/utils/allowedAttachments.ts`.
 */
export const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  '.doc',
  '.docx',
  '.xlsx',
  '.xls',
  '.png',
  '.webp',
  '.svg',
  '.jpg',
  '.jpeg',
  '.pdf',
  '.mp4',
  '.webm',
  '.mov',
])

/** `file-type` output must match extension (sniffed content). */
const EXTENSION_TO_DETECTED_MIMES: Record<string, readonly string[]> = {
  '.pdf': ['application/pdf'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  /** Legacy OLE; `file-type` cannot distinguish Word vs Excel — extension is trusted after CFB check. */
  '.doc': ['application/x-cfb'],
  '.xls': ['application/x-cfb'],
  '.mp4': ['video/mp4'],
  /** `audio/webm` for audio-only WebM with same extension. */
  '.webm': ['video/webm', 'audio/webm'],
  '.mov': ['video/quicktime'],
}

function attachmentExtension(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, '')
  const i = base.lastIndexOf('.')
  if (i < 0) return ''
  return base.slice(i).toLowerCase()
}

function isLikelySvgXml(bytes: Uint8Array, maxScan = 24_576): boolean {
  const slice = bytes.subarray(0, Math.min(bytes.length, maxScan))
  const text = new TextDecoder('utf-8', { fatal: false }).decode(slice).trimStart().replace(/^\uFEFF/, '')
  if (!/<svg\b/i.test(text)) return false
  if (/<!DOCTYPE\s+html\b/i.test(text)) return false
  return true
}

export function validateAttachmentFileName(fileName: string): { ok: true } | { ok: false; error: string } {
  const ext = attachmentExtension(fileName)
  if (!ext || !ALLOWED_ATTACHMENT_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error:
        'File type not allowed. Allowed: .doc, .docx, .xlsx, .xls, .png, .webp, .svg, .jpg, .jpeg, .pdf, .mp4, .webm, .mov',
    }
  }
  return { ok: true }
}

/**
 * Magic-byte / structure check after extension allowlist.
 * Returns a canonical MIME for storage (better than relying on browser `file.type`).
 */
export async function validateAttachmentContent(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<{ ok: true; mime: string } | { ok: false; error: string }> {
  if (buffer.byteLength === 0) {
    return { ok: false, error: 'Empty file' }
  }

  const ext = attachmentExtension(fileName)
  if (!ext || !ALLOWED_ATTACHMENT_EXTENSIONS.has(ext)) {
    return { ok: false, error: 'File type not allowed' }
  }

  const u8 = new Uint8Array(buffer)

  if (ext === '.svg') {
    if (!isLikelySvgXml(u8)) {
      return {
        ok: false,
        error: 'File content is not a valid SVG (expected XML with an <svg> root)',
      }
    }
    return { ok: true, mime: 'image/svg+xml' }
  }

  let detected
  try {
    detected = await fileTypeFromBuffer(u8)
  } catch {
    return {
      ok: false,
      error: 'Could not verify file content; file may be truncated, corrupted, or not an allowed type',
    }
  }

  if (!detected) {
    return {
      ok: false,
      error: 'Could not verify file content; file may be corrupted or not an allowed type',
    }
  }

  const expected = EXTENSION_TO_DETECTED_MIMES[ext]
  if (!expected?.includes(detected.mime)) {
    return {
      ok: false,
      error: `File content does not match extension (detected ${detected.mime})`,
    }
  }

  if (ext === '.doc') return { ok: true, mime: 'application/msword' }
  if (ext === '.xls') return { ok: true, mime: 'application/vnd.ms-excel' }

  return { ok: true, mime: detected.mime }
}
