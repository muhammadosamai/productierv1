<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { SlidersHorizontal, ArrowLeft, BookOpen, ListChecks, Bug } from 'lucide-vue-next'
import FormBuilder from '@/components/forms/FormBuilder.vue'
import type { EntityType } from '@/types/formConfig'

const router = useRouter()

const activeTab = ref<EntityType>('story')
</script>

<template>
  <div class="max-w-4xl mx-auto py-10 px-6">
    <!-- Back button + title -->
    <div class="mb-8">
      <button
        class="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium mb-4"
        @click="router.back()"
      >
        <ArrowLeft :size="14" />
        Back
      </button>
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-[#7C5CFC]/10 flex items-center justify-center">
          <SlidersHorizontal :size="20" class="text-[#7C5CFC]" />
        </div>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Form Builder</h1>
          <p class="text-sm text-gray-500 mt-0.5">Customize which fields appear for stories, tasks, and issues</p>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 mb-6 border-b border-gray-200">
      <button
        class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative"
        :class="activeTab === 'story'
          ? 'text-[#7C5CFC]'
          : 'text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'story'"
      >
        <BookOpen :size="16" />
        Stories
        <span
          v-if="activeTab === 'story'"
          class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#7C5CFC] rounded-t"
        />
      </button>
      <button
        class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative"
        :class="activeTab === 'task'
          ? 'text-[#7C5CFC]'
          : 'text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'task'"
      >
        <ListChecks :size="16" />
        Tasks
        <span
          v-if="activeTab === 'task'"
          class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#7C5CFC] rounded-t"
        />
      </button>
      <button
        class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative"
        :class="activeTab === 'issue'
          ? 'text-[#7C5CFC]'
          : 'text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'issue'"
      >
        <Bug :size="16" />
        Issues
        <span
          v-if="activeTab === 'issue'"
          class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#7C5CFC] rounded-t"
        />
      </button>
    </div>

    <!-- Form Builder -->
    <FormBuilder :entity-type="activeTab" />
  </div>
</template>
