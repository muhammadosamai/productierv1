# Rich Text Comments

This feature adds chat-style rich text formatting to comments across Stories, Issues, and Task chat while preserving compatibility with existing plain comments.

## Scope

- Supported formatting in comment composer:
  - bold, italic, underline, strikethrough
  - links
  - bullet and ordered lists
  - mentions (`@user`)
- Not supported:
  - headings
  - embedded images

## Surfaces

- Story comments in `src/components/backlog/StoryDetailPanel.vue`
- Issue comments in `src/components/issue/IssueDetailPanel.vue`
- Task chat comments in `src/components/delivery/TaskDetailPanel.vue`

## Storage and Backward Compatibility

Comments still use the same `content` text columns:

- `story_comments.content`
- `issue_comments.content`
- `task_comments.content`

Serialization rules:

- Legacy plain comments remain plain text (including existing `@[uuid]` mention tokens).
- Rich comments are stored as HTML produced by the TipTap-based composer.

Rendering rules:

- Plain comments render through mention-segment parsing for token compatibility.
- HTML comments render with `v-html` and typography styling for list/link formatting.

## Security

All comment writes are sanitized on the server before persistence:

- Route handlers sanitize in:
  - `server/src/routes/stories.ts`
  - `server/src/routes/issues.ts`
  - `server/src/routes/tasks.ts`
- Sanitization helper:
  - `server/src/lib/sanitizeCommentHtml.ts`
- Allowed tags/attributes are restricted to the chat formatting subset and safe links.

## Notification and Activity Previews

Notification text previews now strip HTML and normalize whitespace before truncation:

- Preview helper: `server/src/lib/richTextPreview.ts`
- Used by story/issue/task comment notifications and task activity comment preview text.

## Implementation Notes

- Shared comment editor extension setup lives in `src/lib/tiptap/commentComposerExtensions.ts`.
- Composer serialization/hydration logic is centralized in `src/lib/commentMentionEditor.ts`.
- Comment renderer format branching lives in `src/components/comments/FormattedCommentContent.vue`.
