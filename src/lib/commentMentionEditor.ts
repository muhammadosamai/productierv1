import type { JSONContent } from '@tiptap/core'
import {
  mentionTokenForUser,
  parseCommentSegments,
  type MentionUser,
} from '@/lib/commentMentions'

function resolveMentionLabel(users: MentionUser[], userId: string): string {
  const id = userId.toLowerCase()
  for (const u of users) {
    if (u.id.toLowerCase() === id) return u.name
  }
  return 'unknown'
}

/** Push text, splitting on `\n` into text + hardBreak nodes. */
function pushTextWithHardBreaks(out: JSONContent[], value: string) {
  if (!value) return
  const parts = value.split('\n')
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part === undefined) continue
    if (part.length > 0) {
      out.push({ type: 'text', text: part })
    }
    if (i < parts.length - 1) {
      out.push({ type: 'hardBreak' })
    }
  }
}

/**
 * Build TipTap JSON from stored plain comment text (uses `parseCommentSegments` only).
 */
export function plainCommentToTiptapDoc(plain: string, users: MentionUser[]): JSONContent {
  const segments = parseCommentSegments(plain || '')
  const inner: JSONContent[] = []

  for (const seg of segments) {
    if (seg.type === 'text') {
      pushTextWithHardBreaks(inner, seg.value)
    } else {
      inner.push({
        type: 'mention',
        attrs: {
          id: seg.userId,
          label: resolveMentionLabel(users, seg.userId),
          mentionSuggestionChar: '@',
        },
      })
    }
  }

  if (inner.length === 0) {
    return { type: 'doc', content: [{ type: 'paragraph' }] }
  }
  return { type: 'doc', content: [{ type: 'paragraph', content: inner }] }
}

function paragraphInnerToPlain(nodes: JSONContent[] | undefined): string {
  if (!nodes?.length) return ''
  let out = ''
  for (const n of nodes) {
    if (n.type === 'text') out += n.text ?? ''
    else if (n.type === 'hardBreak') out += '\n'
    else if (n.type === 'mention' && n.attrs?.id) {
      out += mentionTokenForUser(String(n.attrs.id))
    }
  }
  return out
}

/**
 * Serialize editor JSON to plain comment text for API / v-model.
 */
export function tiptapDocToPlainComment(doc: JSONContent): string {
  if (doc.type !== 'doc' || !doc.content?.length) return ''
  const parts: string[] = []
  for (const block of doc.content) {
    if (block.type === 'paragraph') {
      parts.push(paragraphInnerToPlain(block.content))
    } else {
      parts.push('')
    }
  }
  return parts.join('\n')
}

function hasHtmlTag(input: string): boolean {
  return /<[a-z][\s\S]*>/i.test(input)
}

export function looksLikeLegacyPlainComment(input = ''): boolean {
  return !hasHtmlTag(input)
}

function isDefaultParagraphNode(node: JSONContent): boolean {
  if (node.type !== 'paragraph') return false
  if (!node.content?.length) return true
  for (const child of node.content) {
    if (child.type === 'text') {
      if (child.marks?.length) return false
      continue
    }
    if (child.type === 'hardBreak') continue
    if (child.type === 'mention') continue
    return false
  }
  return true
}

export function commentDocUsesRichFeatures(doc: JSONContent): boolean {
  if (doc.type !== 'doc') return false
  const blocks = doc.content ?? []
  if (blocks.length > 1) return true
  const first = blocks[0]
  if (!first) return false
  return !isDefaultParagraphNode(first)
}

function normalizeEmptyCommentHtml(html: string): string {
  const raw = html.trim()
  if (!raw) return ''
  const textOnly = raw.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
  return textOnly ? raw : ''
}

export function serializeCommentEditor(doc: JSONContent, html: string): string {
  if (!commentDocUsesRichFeatures(doc)) {
    return tiptapDocToPlainComment(doc)
  }
  return normalizeEmptyCommentHtml(html)
}

export function hydrateCommentEditorContent(
  stored: string,
  users: MentionUser[],
): JSONContent | string {
  if (looksLikeLegacyPlainComment(stored)) {
    return plainCommentToTiptapDoc(stored, users)
  }
  return stored
}
