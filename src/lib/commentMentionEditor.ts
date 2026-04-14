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
