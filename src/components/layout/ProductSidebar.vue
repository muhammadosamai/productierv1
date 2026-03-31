<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Plus, PanelLeftOpen, Trash2 } from 'lucide-vue-next'
import { useProductStore } from '@/stores/products'
import { useAuthStore } from '@/stores/auth'
import CreateProductDialog from '@/components/product/CreateProductDialog.vue'
import DeleteProductDialog from '@/components/product/DeleteProductDialog.vue'
import draggable from 'vuedraggable'

const productStore = useProductStore()
const authStore = useAuthStore()
const showCreateDialog = ref(false)
const showDeleteDialog = ref(false)
const deleteTargetProduct = ref('')

// Context menu
const contextMenu = ref<{ show: boolean; x: number; y: number; productName: string }>({
  show: false, x: 0, y: 0, productName: '',
})

function canDeleteProduct(productName: string): boolean {
  const product = productStore.products.find(p => p.name === productName)
  if (!product) return false
  return product.createdByUserId === authStore.user?.id || authStore.user?.role === 'super_admin'
}

function onContextMenu(productName: string, event: MouseEvent) {
  if (!canDeleteProduct(productName)) return
  event.preventDefault()
  contextMenu.value = { show: true, x: event.clientX, y: event.clientY, productName }
}

function closeContextMenu() {
  contextMenu.value.show = false
}

function onDeleteClick() {
  deleteTargetProduct.value = contextMenu.value.productName
  closeContextMenu()
  showDeleteDialog.value = true
}

function onClickOutside() {
  if (contextMenu.value.show) closeContextMenu()
}

onMounted(() => document.addEventListener('click', onClickOutside))
onUnmounted(() => document.removeEventListener('click', onClickOutside))

function onProductCreated(name: string) {
  // Product is already selected in the store after creation
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
      item-key="name"
      :animation="200"
      ghost-class="opacity-30"
      drag-class="scale-110"
      class="flex flex-col items-center gap-6 flex-1"
    >
      <template #item="{ element, index }">
        <button
          class="relative flex items-center justify-center w-10 h-10 rounded-xl overflow-hidden transition-all shadow-md shadow-black/20 cursor-grab active:cursor-grabbing"
          :class="[
            productStore.activeProductName === element.name
              ? 'ring-2 ring-white shadow-lg shadow-black/30'
              : 'opacity-80 hover:opacity-100 hover:shadow-lg hover:shadow-black/30'
          ]"
          :title="element.name"
          @click="productStore.selectProduct(index)"
          @contextmenu="onContextMenu(element.name, $event)"
        >
          <img
            v-if="element.logo"
            :src="element.logo"
            :alt="element.name"
            class="w-full h-full object-cover pointer-events-none"
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#4857FE] to-[#7C5CFC] text-white text-xs font-bold pointer-events-none"
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

    <!-- Bottom add button -->
    <button
      class="flex items-center justify-center w-10 h-10 rounded-full bg-white text-[#3E4BDE] hover:bg-white/90 transition-colors shadow-md"
      title="Create new product"
      @click="showCreateDialog = true"
    >
      <Plus :size="18" />
    </button>
  </aside>

  <!-- Context Menu -->
  <Teleport to="body">
    <div
      v-if="contextMenu.show"
      class="fixed z-[9999] bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[160px]"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    >
      <button
        class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
        @click="onDeleteClick"
      >
        <Trash2 :size="14" />
        Delete product
      </button>
    </div>
  </Teleport>

  <!-- Create Product Dialog -->
  <CreateProductDialog v-model:open="showCreateDialog" @created="onProductCreated" />

  <!-- Delete Product Dialog -->
  <DeleteProductDialog
    v-model:open="showDeleteDialog"
    :product-name="deleteTargetProduct"
  />
</template>
