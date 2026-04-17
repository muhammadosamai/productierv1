import { ref, computed, watch, type Ref } from 'vue'

export const MEDIA_PREVIEW_ZOOM_MIN = 1
export const MEDIA_PREVIEW_ZOOM_MAX = 5

function clampZoom(z: number): number {
  return Math.min(MEDIA_PREVIEW_ZOOM_MAX, Math.max(MEDIA_PREVIEW_ZOOM_MIN, z))
}

/**
 * Wheel zoom, +/- keys (handled by caller), optional drag-pan for images when zoomed.
 */
export function useAttachmentMediaPreviewZoom(options: {
  mediaPreviewOpen: Ref<boolean>
  selectedMediaId: Ref<string | null>
  isImage: () => boolean
}) {
  const zoom = ref(1)
  const pan = ref({ x: 0, y: 0 })
  const panning = ref(false)
  const panStart = ref({ x: 0, y: 0, panX: 0, panY: 0 })

  function resetTransform() {
    zoom.value = MEDIA_PREVIEW_ZOOM_MIN
    pan.value = { x: 0, y: 0 }
    panning.value = false
  }

  function zoomIn() {
    zoom.value = clampZoom(zoom.value * 1.15)
    if (zoom.value === MEDIA_PREVIEW_ZOOM_MIN) pan.value = { x: 0, y: 0 }
  }

  function zoomOut() {
    zoom.value = clampZoom(zoom.value / 1.15)
    if (zoom.value === MEDIA_PREVIEW_ZOOM_MIN) pan.value = { x: 0, y: 0 }
  }

  function onWheel(e: WheelEvent) {
    if (!options.mediaPreviewOpen.value) return
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.92 : 1.08
    zoom.value = clampZoom(zoom.value * factor)
    if (zoom.value === MEDIA_PREVIEW_ZOOM_MIN) pan.value = { x: 0, y: 0 }
  }

  function onPanPointerDown(e: PointerEvent) {
    if (!options.isImage() || zoom.value <= MEDIA_PREVIEW_ZOOM_MIN) return
    if (e.button !== 0) return
    e.preventDefault()
    panning.value = true
    panStart.value = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.value.x,
      panY: pan.value.y,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPanPointerMove(e: PointerEvent) {
    if (!panning.value) return
    pan.value = {
      x: panStart.value.panX + (e.clientX - panStart.value.x),
      y: panStart.value.panY + (e.clientY - panStart.value.y),
    }
  }

  function onPanPointerUp(e: PointerEvent) {
    if (!panning.value) return
    panning.value = false
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  function onPanPointerCancel(e: PointerEvent) {
    panning.value = false
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const transformStyle = computed(() => ({
    transform: `translate(${pan.value.x}px, ${pan.value.y}px) scale(${zoom.value})`,
    transformOrigin: 'center center' as const,
  }))

  const zoomPercentLabel = computed(() => `${Math.round(zoom.value * 100)}%`)

  const showGrabCursor = computed(
    () => options.isImage() && zoom.value > MEDIA_PREVIEW_ZOOM_MIN,
  )

  watch(
    [() => options.mediaPreviewOpen.value, () => options.selectedMediaId.value],
    () => {
      resetTransform()
    },
  )

  return {
    zoom,
    pan,
    panning,
    resetTransform,
    zoomIn,
    zoomOut,
    onWheel,
    onPanPointerDown,
    onPanPointerMove,
    onPanPointerUp,
    onPanPointerCancel,
    transformStyle,
    zoomPercentLabel,
    showGrabCursor,
  }
}
