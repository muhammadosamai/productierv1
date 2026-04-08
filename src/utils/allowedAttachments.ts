/**
 * Allowed task/story/issue attachment types.
 * Keep in sync with `server/src/lib/allowedAttachments.ts`.
 */
export const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  '.doc',
  '.docx',
  '.xlsx',
  '.xls',
  '.png',
  '.svg',
  '.jpg',
  '.jpeg',
  '.pdf',
])

/** `accept` value for `<input type="file">` */
export const ATTACHMENT_FILE_ACCEPT = '.doc,.docx,.xlsx,.xls,.png,.svg,.jpg,.jpeg,.pdf'

/** Short copy for UI / toasts */
export const ALLOWED_ATTACHMENT_TYPES_HINT =
  'PDF, Word (.doc, .docx), Excel (.xls, .xlsx), PNG, JPG, JPEG, SVG'

export function attachmentFileExtension(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, '')
  const i = base.lastIndexOf('.')
  if (i < 0) return ''
  return base.slice(i).toLowerCase()
}

export function isAllowedAttachmentFileName(fileName: string): boolean {
  const ext = attachmentFileExtension(fileName)
  return ext !== '' && ALLOWED_ATTACHMENT_EXTENSIONS.has(ext)
}

export function partitionAllowedAttachmentFiles(files: Iterable<File>): {
  allowed: File[]
  rejectedNames: string[]
} {
  const allowed: File[] = []
  const rejectedNames: string[] = []
  for (const f of files) {
    if (isAllowedAttachmentFileName(f.name)) allowed.push(f)
    else rejectedNames.push(f.name)
  }
  return { allowed, rejectedNames }
}
