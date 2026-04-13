<script setup lang="ts">
import { watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, GripVertical } from 'lucide-vue-next'
import type { IssueStatusCatalogEntry } from '@/types/formConfig'
import draggable from 'vuedraggable'
import { normalizeIssueStatusHexColor } from '@/lib/issueStatusColors'

const model = defineModel<IssueStatusCatalogEntry[]>({ required: true })

/** HSL (h 0–360, s/l 0–100) → #rrggbb */
function hslToHex(hDeg: number, sPct: number, lPct: number): string {
  const h = (hDeg % 360) / 360
  const s = sPct / 100
  const l = lPct / 100
  let r: number
  let g: number
  let b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  const toHex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function randomIssueStatusColor(): string {
  const h = Math.floor(Math.random() * 360)
  const s = 48 + Math.floor(Math.random() * 42)
  const l = 40 + Math.floor(Math.random() * 22)
  const raw = hslToHex(h, s, l)
  return normalizeIssueStatusHexColor(raw) ?? '#6b7280'
}

function pickerValue(row: IssueStatusCatalogEntry) {
  return normalizeIssueStatusHexColor(row.color) ?? '#6b7280'
}

function onNativeColor(row: IssueStatusCatalogEntry, ev: Event) {
  const v = (ev.target as HTMLInputElement).value
  const n = normalizeIssueStatusHexColor(v)
  if (n) row.color = n
}

function renumber() {
  model.value.forEach((e, i) => {
    e.order = i
  })
}

/** When the catalog set or order of rows changes, fill missing colors (picker-only UX). */
watch(
  () => model.value.map(r => r.id).join(),
  () => {
    renumber()
    for (const row of model.value) {
      if (!normalizeIssueStatusHexColor(row.color)) {
        row.color = randomIssueStatusColor()
      }
    }
  },
  { immediate: true },
)

function addRow() {
  model.value.push({
    id: crypto.randomUUID(),
    name: 'New status',
    order: model.value.length,
    color: randomIssueStatusColor(),
  })
  renumber()
}

function removeRow(id: string) {
  if (model.value.length <= 1) return
  const idx = model.value.findIndex(e => e.id === id)
  if (idx !== -1) model.value.splice(idx, 1)
  renumber()
}

function onDragEnd() {
  renumber()
}
</script>

<template>
  <div class="min-w-0 space-y-2">
    <p class="text-xs text-gray-500">
      Each status has a stable id (used in the database). Edit the display name freely; drag to reorder.
      Colors default to a random value—use the picker to change them.
    </p>
    <draggable
      v-model="model"
      item-key="id"
      handle=".status-drag-handle"
      ghost-class="opacity-50"
      animation="180"
      class="max-h-[min(50vh,380px)] space-y-2 overflow-y-auto overflow-x-hidden overscroll-y-contain pr-1"
      @end="onDragEnd"
    >
      <template #item="{ element: row }">
        <div
          class="flex min-w-0 flex-col gap-1.5 rounded-lg border border-gray-200 bg-gray-50/80 px-2 py-2"
        >
          <div class="flex min-w-0 items-center gap-2">
            <button
              type="button"
              class="status-drag-handle shrink-0 cursor-grab text-gray-300 hover:text-gray-500 active:cursor-grabbing"
              aria-label="Reorder"
            >
              <GripVertical :size="16" />
            </button>
            <Input
              v-model="row.name"
              class="h-9 min-w-0 flex-1 text-sm"
              placeholder="Display name"
            />
            <label
              class="relative flex h-9 w-[4.5rem] shrink-0 cursor-pointer overflow-hidden rounded-md border border-gray-200 bg-white"
              title="Pick a color"
            >
              <input
                type="color"
                class="absolute inset-0 h-[150%] w-[150%] -translate-x-[10%] -translate-y-[10%] cursor-pointer border-0 p-0"
                :value="pickerValue(row)"
                @input="onNativeColor(row, $event)"
              />
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-9 w-9 shrink-0 text-gray-400 hover:text-red-600"
              :disabled="model.length <= 1"
              @click="removeRow(row.id)"
            >
              <Trash2 :size="16" />
            </Button>
          </div>
          <p
            class="break-all font-mono text-[10px] leading-snug text-gray-400"
            :title="`${row.id}${row.slugKey ? ` (${row.slugKey})` : ''}`"
          >
            id: {{ row.id }}
            <span v-if="row.slugKey" class="text-gray-500"> · legacy key: {{ row.slugKey }}</span>
          </p>
        </div>
      </template>
    </draggable>
    <Button
      type="button"
      variant="outline"
      size="sm"
      class="w-full border-dashed"
      @click="addRow"
    >
      <Plus :size="16" class="mr-1" />
      Add status
    </Button>
  </div>
</template>
