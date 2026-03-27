<script setup lang="ts">
import { Users } from 'lucide-vue-next'
</script>

<template>
  <div class="flex flex-col h-full bg-[#FAFBFD]">
    <!-- Page Header -->
    <div class="bg-white px-8 py-5 border-b border-gray-100">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-[#4857FE]/10 flex items-center justify-center">
          <Users :size="18" class="text-[#4857FE]" />
        </div>
        <div>
          <h1 class="text-xl font-semibold text-gray-900">Users</h1>
          <p class="text-sm text-gray-400 mt-0.5">Manage organization users and roles</p>
        </div>
      </div>
    </div>

    <!-- Placeholder Content -->
    <div class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <div class="w-16 h-16 rounded-2xl bg-[#4857FE]/5 flex items-center justify-center mx-auto mb-4">
          <Users :size="28" class="text-[#4857FE]/40" />
        </div>
        <h2 class="text-lg font-semibold text-gray-700">User Management</h2>
        <p class="text-sm text-gray-400 mt-1 max-w-sm">Organization-wide user management, role assignments, and access controls will appear here.</p>
      </div>
    </div>
  </div>
</template>
