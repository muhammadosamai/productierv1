<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { CalendarRange } from 'lucide-vue-next'
import { type DateValue, CalendarDate, today, getLocalTimeZone } from '@internationalized/date'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { RangeCalendar } from '@/components/ui/range-calendar'
import { Button } from '@/components/ui/button'

interface DateRange {
  start: string | null
  end: string | null
}

type CalendarRangeValue = { start: DateValue | undefined; end: DateValue | undefined }

const props = withDefaults(defineProps<{
  modelValue?: DateRange
  placeholder?: string
  numberOfMonths?: number
}>(), {
  placeholder: 'Pick a date range',
  numberOfMonths: 2,
})

const emit = defineEmits<{
  'update:modelValue': [value: DateRange]
}>()

const open = ref(false)

// Convert ISO string to CalendarDate
function isoToCalendarDate(iso: string | null | undefined): DateValue | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

// Convert CalendarDate to ISO string
function calendarDateToIso(date: DateValue): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

// Internal range value for the calendar
const internalValue = ref<CalendarRangeValue | undefined>()

// Sync modelValue → internal
watch(() => props.modelValue, (val) => {
  if (val?.start && val?.end) {
    const s = isoToCalendarDate(val.start)
    const e = isoToCalendarDate(val.end)
    if (s && e) {
      internalValue.value = { start: s, end: e }
    }
  } else {
    internalValue.value = undefined
  }
}, { immediate: true })

// Sync internal → modelValue
function onUpdate(val: CalendarRangeValue) {
  internalValue.value = val
  if (val?.start && val?.end) {
    emit('update:modelValue', {
      start: calendarDateToIso(val.start),
      end: calendarDateToIso(val.end),
    })
  }
}

// Format display
function formatDate(date: DateValue): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[date.month - 1]} ${date.day}, ${date.year}`
}

const displayText = computed(() => {
  if (internalValue.value?.start && internalValue.value?.end) {
    return `${formatDate(internalValue.value.start)} – ${formatDate(internalValue.value.end)}`
  }
  return props.placeholder
})

const hasValue = computed(() => !!internalValue.value?.start && !!internalValue.value?.end)

// Presets
const tz = getLocalTimeZone()

function applyPreset(preset: string) {
  const now = today(tz)
  let start: DateValue
  let end: DateValue

  switch (preset) {
    case 'thisQuarter': {
      const qStart = Math.floor((now.month - 1) / 3) * 3 + 1
      start = new CalendarDate(now.year, qStart, 1)
      const qEndMonth = qStart + 2
      const lastDay = new CalendarDate(now.year, qEndMonth, 1)
      end = lastDay.add({ months: 1 }).subtract({ days: 1 })
      break
    }
    case 'nextQuarter': {
      const nqStart = Math.floor((now.month - 1) / 3) * 3 + 4
      const yr = nqStart > 12 ? now.year + 1 : now.year
      const m = nqStart > 12 ? nqStart - 12 : nqStart
      start = new CalendarDate(yr, m, 1)
      const nqEndMonth = m + 2
      end = new CalendarDate(yr, nqEndMonth, 1).add({ months: 1 }).subtract({ days: 1 })
      break
    }
    case 'thisYear':
      start = new CalendarDate(now.year, 1, 1)
      end = new CalendarDate(now.year, 12, 31)
      break
    case 'thisMonth':
      start = new CalendarDate(now.year, now.month, 1)
      end = start.add({ months: 1 }).subtract({ days: 1 })
      break
    default:
      return
  }

  const rangeVal = { start, end }
  onUpdate(rangeVal)
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="inline-flex items-center gap-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors text-left"
        :class="hasValue ? 'text-gray-900' : 'text-gray-400'"
      >
        <CalendarRange :size="16" class="text-gray-400 shrink-0" />
        <span class="flex-1 truncate">{{ displayText }}</span>
      </button>
    </PopoverTrigger>

    <PopoverContent align="start" :side-offset="8" class="w-auto p-0">
      <div class="flex">
        <!-- Presets sidebar -->
        <div class="flex flex-col gap-1 border-r border-gray-100 p-3 min-w-[140px]">
          <p class="text-xs font-medium text-gray-400 uppercase tracking-wider px-2 mb-1">Presets</p>
          <button
            v-for="preset in [
              { key: 'thisMonth', label: 'This Month' },
              { key: 'thisQuarter', label: 'This Quarter' },
              { key: 'nextQuarter', label: 'Next Quarter' },
              { key: 'thisYear', label: 'This Year' },
            ]"
            :key="preset.key"
            type="button"
            class="text-left px-3 py-2 text-sm text-gray-600 hover:bg-[#4857FE]/10 hover:text-[#4857FE] rounded-lg transition-colors"
            @click="applyPreset(preset.key)"
          >
            {{ preset.label }}
          </button>
        </div>

        <!-- Calendar -->
        <div class="p-2">
          <RangeCalendar
            :model-value="internalValue"
            :number-of-months="numberOfMonths"
            @update:model-value="onUpdate"
          />
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
