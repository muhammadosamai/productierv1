<script setup lang="ts">
import type { RangeCalendarRootEmits, RangeCalendarRootProps } from "reka-ui"
import { ChevronLeft, ChevronRight } from "lucide-vue-next"
import {
  RangeCalendarCell,
  RangeCalendarCellTrigger,
  RangeCalendarGrid,
  RangeCalendarGridBody,
  RangeCalendarGridHead,
  RangeCalendarGridRow,
  RangeCalendarHeadCell,
  RangeCalendarHeader,
  RangeCalendarHeading,
  RangeCalendarNext,
  RangeCalendarPrev,
  RangeCalendarRoot,
  useForwardPropsEmits,
} from "reka-ui"

const props = withDefaults(defineProps<RangeCalendarRootProps>(), {
  numberOfMonths: 2,
  weekdayFormat: 'short',
})
const emits = defineEmits<RangeCalendarRootEmits>()

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <RangeCalendarRoot
    v-slot="{ weekDays, grid }"
    data-slot="range-calendar"
    v-bind="forwarded"
    class="p-3"
  >
    <RangeCalendarHeader class="flex items-center justify-between mb-4">
      <RangeCalendarPrev
        class="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
      >
        <ChevronLeft :size="16" />
      </RangeCalendarPrev>

      <RangeCalendarHeading class="text-sm font-semibold text-gray-900" />

      <RangeCalendarNext
        class="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
      >
        <ChevronRight :size="16" />
      </RangeCalendarNext>
    </RangeCalendarHeader>

    <div class="flex gap-6">
      <RangeCalendarGrid
        v-for="month in grid"
        :key="month.value.toString()"
        class="w-full border-collapse"
      >
        <RangeCalendarGridHead>
          <RangeCalendarGridRow class="flex">
            <RangeCalendarHeadCell
              v-for="day in weekDays"
              :key="day"
              class="w-9 h-9 flex items-center justify-center text-xs font-medium text-gray-400"
            >
              {{ day }}
            </RangeCalendarHeadCell>
          </RangeCalendarGridRow>
        </RangeCalendarGridHead>

        <RangeCalendarGridBody>
          <RangeCalendarGridRow
            v-for="(weekDates, index) in month.rows"
            :key="`weekDate-${index}`"
            class="flex"
          >
            <RangeCalendarCell
              v-for="weekDate in weekDates"
              :key="weekDate.toString()"
              :date="weekDate"
              class="relative w-9 h-9 flex items-center justify-center text-sm p-0
                data-[selected]:bg-[#4857FE]/10
                data-[selection-start]:rounded-l-full
                data-[selection-end]:rounded-r-full"
            >
              <RangeCalendarCellTrigger
                :day="weekDate"
                :month="month.value"
                class="inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-normal transition-colors
                  hover:bg-gray-100
                  data-[today]:font-bold data-[today]:text-[#4857FE]
                  data-[selected]:bg-[#4857FE]/10 data-[selected]:text-[#4857FE]
                  data-[selection-start]:bg-[#4857FE] data-[selection-start]:text-white data-[selection-start]:hover:bg-[#3E4BDE] data-[selection-start]:font-semibold
                  data-[selection-end]:bg-[#4857FE] data-[selection-end]:text-white data-[selection-end]:hover:bg-[#3E4BDE] data-[selection-end]:font-semibold
                  data-[highlighted]:bg-[#4857FE]/10
                  data-[disabled]:text-gray-300 data-[disabled]:pointer-events-none
                  data-[outside-month]:text-gray-300 data-[outside-month]:pointer-events-none
                  data-[unavailable]:text-gray-300 data-[unavailable]:line-through"
              />
            </RangeCalendarCell>
          </RangeCalendarGridRow>
        </RangeCalendarGridBody>
      </RangeCalendarGrid>
    </div>
  </RangeCalendarRoot>
</template>
