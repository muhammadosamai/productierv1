# Video attachments

Parent-task/story/issue/initiative attachments accept **`.mp4`**, **`.webm`**, and **`.mov`** in addition to existing document and image types. Raster images include **`.webp`** (`image/webp`) alongside PNG and JPEG.

- **Server validation:** [`server/src/lib/allowedAttachments.ts`](../../server/src/lib/allowedAttachments.ts) — extension allowlist + `file-type` sniffing; MIME map includes `video/mp4`, `video/webm` / `audio/webm`, `video/quicktime`.
- **Client allowlist / copy:** [`src/utils/allowedAttachments.ts`](../../src/utils/allowedAttachments.ts) — `ATTACHMENT_FILE_ACCEPT`, `ALLOWED_ATTACHMENT_TYPES_HINT`, `isVideoMimeType()`.
- **UI:** Attachment lists use a video thumbnail (blob URL) or `Video` icon for `video/*` (and `audio/webm` for WebM edge cases).

## Fullscreen media preview (zoom)

Story, Task, Issue, and Initiative detail panels share the attachment preview lightbox. Zoom behavior is implemented in [`src/utils/useAttachmentMediaPreviewZoom.ts`](../../src/utils/useAttachmentMediaPreviewZoom.ts) and wired into each panel’s Teleport modal.

- **Scroll wheel:** Zoom in/out over the media area (1×–5×).
- **Toolbar:** − / + buttons, current zoom percentage, reset when zoomed (also **double-click** the media to reset).
- **Keyboard:** `+` / `=` zoom in, `-` zoom out, `0` reset (while the modal is open). Arrow keys still change attachments; Escape closes.
- **Pan:** When zoomed in on an **image**, drag to pan. Videos zoom but are not drag-panned (controls stay usable).

No DB migration: `mimeType` is already a string column.

**Ops note:** Large uploads are not capped in app code; consider reverse-proxy body limits and storage for production.
