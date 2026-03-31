<script setup lang="ts">
import { ref } from 'vue'
import { Plus, PanelLeftOpen } from 'lucide-vue-next'
import { useProductStore } from '@/stores/products'
import CreateProductDialog from '@/components/product/CreateProductDialog.vue'
import draggable from 'vuedraggable'

const productStore = useProductStore()
const showCreateDialog = ref(false)
const failedLogoIds = ref<Record<string, true>>({})

function onProductCreated(name: string) {
  // Product is already selected in the store after creation
}

function logoAvailable(productId: string, logo: string | null | undefined): boolean {
  return Boolean(logo) && !failedLogoIds.value[productId]
}

function onLogoError(productId: string): void {
  failedLogoIds.value = { ...failedLogoIds.value, [productId]: true }
}
</script>

<template>
  <aside
    class="flex w-[70px] flex-col items-center pt-4 pb-3 gap-2"
    style="background-color: rgb(44 49 102)"
  >
    <!-- Add new product button -->
    <button
      class="flex items-center justify-center w-10 h-10 rounded-xl border-2 border-white/40 border-dashed text-white hover:bg-white/10 transition-colors"
      title="Create new product"
      @click="showCreateDialog = true"
    >
      <Plus :size="18" />
    </button>

    <!-- Divider -->
    <div class="w-6 border-t border-white/30 my-4 opacity-30"></div>

    <!-- Draggable product icons -->
    <draggable
      v-model="productStore.products"
      item-key="id"
      :animation="200"
      ghost-class="opacity-30"
      drag-class="scale-110"
      class="flex flex-col items-center gap-6 flex-1"
    >
      <template #item="{ element, index }">
        <button
          class="relative flex items-center justify-center w-10 h-10 rounded-xl overflow-hidden transition-all shadow-md shadow-black/20 cursor-grab active:cursor-grabbing"
          :class="[
            productStore.activeProductId === element.id
              ? 'ring-2 ring-white shadow-lg shadow-black/30'
              : 'opacity-80 hover:opacity-100 hover:shadow-lg hover:shadow-black/30'
          ]"
          :title="element.name"
          @click="productStore.selectProduct(index)"
        >
          <img
            v-if="logoAvailable(element.id, element.logo)"
            :src="element.logo"
            :alt="element.name"
            class="w-full h-full object-cover pointer-events-none"
            @error="onLogoError(element.id)"
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center bg-linear-to-br from-[#4857FE] to-[#7C5CFC] text-white text-xs font-bold pointer-events-none"
          >
            {{ element.name.slice(0, 2).toUpperCase() }}
          </div>
        </button>
      </template>
    </draggable>

    <!-- Expand sub-sidebar button (shown when collapsed) -->
    <button
      v-if="productStore.subSidebarCollapsed"
      class="flex items-center justify-center w-10 h-10 rounded-xl bg-white/15 text-white/70 hover:bg-white/25 hover:text-white transition-colors cursor-pointer"
      title="Expand sidebar"
      @click="productStore.toggleSubSidebar()"
    >
      <PanelLeftOpen :size="18" />
    </button>

  </aside>

  <!-- Create Product Dialog -->
  <CreateProductDialog v-model:open="showCreateDialog" @created="onProductCreated" />
</template>
