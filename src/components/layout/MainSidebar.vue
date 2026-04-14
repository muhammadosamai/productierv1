<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Settings } from 'lucide-vue-next'
import { useRolesStore } from '@/stores/roles'

const router = useRouter()
const route = useRoute()
const rolesStore = useRolesStore()

// Which main section is active based on current route
const activeIndex = computed(() => {
  const path = route.path
  if (path === '/home') return 0
  if (path === '/users') return 2
  if (path === '/integrations') return 3
  // Everything else is "products" section
  return 1
})

function navigateTo(index: number) {
  switch (index) {
    case 0: router.push('/home'); break
    case 1: router.push('/metrics'); break
    case 2: router.push('/users'); break
    case 3: router.push('/integrations'); break
  }
}

// Whether to show product sidebars (only for products section)
const showProductSidebars = computed(() => activeIndex.value === 1)

defineExpose({ showProductSidebars })
</script>

<template>
  <aside
    class="flex w-[65px] flex-col items-center py-4"
    style="background-color: rgb(32 36 81)"
  >
    <!-- App logo -->
    <div class="flex flex-col items-center mb-2" title="Productier">
      <div class="flex items-center justify-center w-10 h-10">
        <img src="/logo.png" alt="Productier" class="w-9 h-9 rounded-full" />
      </div>
    </div>

    <!-- Separator -->
    <div class="w-6 border-t border-white/30 my-4 opacity-30"></div>

    <!-- Navigation icons -->
    <div class="flex flex-col items-center gap-7 flex-1">

      <!-- Home -->
      <button
        type="button"
        title="Home"
        class="flex items-center justify-center w-10 h-10 rounded-xl text-white transition-colors"
        :class="activeIndex === 0 ? 'bg-white/15' : 'hover:bg-white/10'"
        @click="navigateTo(0)"
      >
        <!-- Home line -->
        <svg v-if="activeIndex !== 0" width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9.16602 16.5L12.8327 16.5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M2.15609 12.1123C1.83249 10.0065 1.67069 8.95365 2.0688 8.02024C2.46691 7.08684 3.35017 6.44821 5.11669 5.17095L6.43656 4.21665C8.63408 2.62776 9.73285 1.83331 11.0007 1.83331C12.2685 1.83331 13.3672 2.62776 15.5647 4.21665L16.8846 5.17095C18.6511 6.44821 19.5344 7.08684 19.9325 8.02024C20.3306 8.95365 20.1688 10.0065 19.8452 12.1123L19.5693 13.908C19.1105 16.8932 18.8812 18.3857 17.8106 19.2762C16.74 20.1666 15.1748 20.1666 12.0446 20.1666H9.95674C6.82646 20.1666 5.26132 20.1666 4.19073 19.2762C3.12015 18.3857 2.89078 16.8932 2.43204 13.908L2.15609 12.1123Z" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
        <!-- Home solid -->
        <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M10.8124 2.36125L3.93015 6.97062C2.96365 7.61794 2.4204 8.73912 2.50949 9.90265L3.20767 19.021C3.33638 20.702 4.73163 22 6.4098 22H17.5902C19.2684 22 20.6636 20.702 20.7923 19.021L21.4905 9.90265C21.5796 8.73912 21.0364 7.61794 20.0699 6.97062L13.1876 2.36125C12.4685 1.87958 11.5315 1.87958 10.8124 2.36125ZM9.32367 16.9481C8.90946 16.9481 8.57367 17.2838 8.57367 17.6981C8.57367 18.1123 8.90946 18.4481 9.32367 18.4481H14.6763C15.0905 18.4481 15.4263 18.1123 15.4263 17.6981C15.4263 17.2838 15.0905 16.9481 14.6763 16.9481H9.32367Z" fill="white"/>
        </svg>
      </button>

      <!-- Products -->
      <button
        type="button"
        title="Products"
        class="flex items-center justify-center w-10 h-10 rounded-xl text-white transition-colors"
        :class="activeIndex === 1 ? 'bg-white/15' : 'hover:bg-white/10'"
        @click="navigateTo(1)"
      >
        <!-- Product line -->
        <svg v-if="activeIndex !== 1" width="20" height="22" viewBox="0 0 20 22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9.75 10.75L18.6063 5.75M9.75 10.75L0.89367 5.75M9.75 10.75V20.75M18.6063 5.75C18.6987 5.90546 18.75 6.08594 18.75 6.27397V15.226C18.75 15.5945 18.5531 15.934 18.2356 16.113L10.2356 20.6223C10.0846 20.7074 9.9173 20.75 9.75 20.75M18.6063 5.75C18.5177 5.60081 18.3911 5.47467 18.2356 5.38704L10.2356 0.87768C9.9336 0.70744 9.5664 0.70744 9.2644 0.87768L1.26436 5.38704C1.10889 5.47467 0.98234 5.60081 0.89367 5.75M0.89367 5.75C0.80127 5.90546 0.75 6.08594 0.75 6.27397V15.226C0.75 15.5945 0.94689 15.934 1.26436 16.113L9.2644 20.6223C9.4154 20.7074 9.5827 20.75 9.75 20.75" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <!-- Product solid -->
        <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3.61786 6.62311L12 11.4013L20.3821 6.62311L12.4856 2.12892C12.1836 1.95703 11.8164 1.95703 11.5144 2.12892L3.61786 6.62311Z" fill="white"/>
          <path d="M21 7.6623L12.6 12.4507V22L20.4856 17.512C20.8031 17.3313 21 16.9885 21 16.6164V7.6623Z" fill="white"/>
          <path d="M11.4 22V12.4507L3 7.6623V16.6164C3 16.9885 3.19689 17.3313 3.51436 17.512L11.4 22Z" fill="white"/>
        </svg>
      </button>

      <!-- Team / Users -->
      <button
        v-if="rolesStore.canAccess('users')"
        type="button"
        title="Users"
        class="flex items-center justify-center w-10 h-10 rounded-xl text-white transition-colors"
        :class="activeIndex === 2 ? 'bg-white/15' : 'hover:bg-white/10'"
        @click="navigateTo(2)"
      >
        <!-- Team line -->
        <svg v-if="activeIndex !== 2" width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19.0429 16.5C19.7297 16.5 20.2761 16.0678 20.7666 15.4634C21.7708 14.2262 20.1221 13.2374 19.4932 12.7532C18.854 12.261 18.1403 11.9821 17.4167 11.9167M16.5 10.0833C17.7657 10.0833 18.7917 9.05732 18.7917 7.79167C18.7917 6.52601 17.7657 5.5 16.5 5.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M2.95648 16.5C2.26962 16.5 1.72329 16.0678 1.23277 15.4634C0.228597 14.2262 1.8773 13.2374 2.50611 12.7532C3.14533 12.261 3.85905 11.9821 4.58268 11.9167M5.04102 10.0833C3.77536 10.0833 2.74935 9.05732 2.74935 7.79167C2.74935 6.52601 3.77536 5.5 5.04102 5.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M7.4095 13.8519C6.47287 14.4311 4.01709 15.6136 5.51282 17.0935C6.24348 17.8163 7.05724 18.3333 8.08034 18.3333H13.9184C14.9415 18.3333 15.7552 17.8163 16.4859 17.0935C17.9816 15.6136 15.5258 14.4311 14.5892 13.8519C12.3928 12.4938 9.60588 12.4938 7.4095 13.8519Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M14.2077 6.87502C14.2077 8.64693 12.7713 10.0834 10.9993 10.0834C9.22744 10.0834 7.79102 8.64693 7.79102 6.87502C7.79102 5.10311 9.22744 3.66669 10.9993 3.66669C12.7713 3.66669 14.2077 5.10311 14.2077 6.87502Z" stroke="white" stroke-width="1.5"/>
        </svg>
        <!-- Team solid -->
        <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15.5428 7.45679C15.5428 9.36592 13.9564 10.9136 11.9996 10.9136C10.0428 10.9136 8.45646 9.36592 8.45646 7.45679C8.45646 5.54766 10.0428 4 11.9996 4C13.9564 4 15.5428 5.54766 15.5428 7.45679Z" fill="white"/>
          <path d="M5.34268 16.5331C5.68971 14.1874 7.5511 12.2705 9.97393 12.0983C11.3582 11.9999 12.6458 11.9998 14.0275 12.0978C16.4493 12.2696 18.3094 14.1864 18.6562 16.5311L18.7237 16.9872C18.9236 18.3386 17.9614 19.6 16.5698 19.7455C13.3039 20.0872 10.706 20.0833 7.43524 19.7429C6.0415 19.5979 5.07605 18.3354 5.27628 16.9819L5.34268 16.5331Z" fill="white"/>
          <path d="M6.73582 12.0537C6.55839 12.0626 6.37964 12.0734 6.19905 12.086C4.04543 12.2367 2.39085 13.914 2.08238 15.9665L2.02336 16.3592C1.84538 17.5435 2.70355 18.6481 3.94243 18.775C4.08561 18.7897 4.22733 18.8037 4.36775 18.8169C4.09311 18.2078 3.98421 17.5159 4.08919 16.8063L4.15559 16.3575C4.41178 14.6258 5.35346 13.0618 6.73582 12.0537Z" fill="white"/>
          <path d="M19.6332 18.8197C19.7748 18.8063 19.9177 18.7922 20.0621 18.7774C21.299 18.65 22.1544 17.5463 21.9766 16.3638L21.9167 15.9647C21.6083 13.9131 19.9549 12.2359 17.8022 12.0855C17.6215 12.0729 17.4427 12.0622 17.2651 12.0533C18.6465 13.0613 19.5873 14.6249 19.8433 16.3555L19.9108 16.8115C20.0156 17.52 19.9072 18.2111 19.6332 18.8197Z" fill="white"/>
          <path d="M15.1498 10.938C15.4202 11.0106 15.7052 11.0494 15.9997 11.0494C17.7391 11.0494 19.1491 9.69518 19.1491 8.02469C19.1491 6.36422 17.7559 5.01626 16.0309 5.00015C16.4813 5.71034 16.7428 6.5506 16.7428 7.45678C16.7428 8.85116 16.1237 10.0895 15.1498 10.938Z" fill="white"/>
          <path d="M7.25645 7.45678C7.25645 8.85117 7.8755 10.0895 8.84943 10.938C8.5791 11.0106 8.2941 11.0494 7.99966 11.0494C6.26025 11.0494 4.85019 9.69518 4.85019 8.02469C4.85019 6.36426 6.24333 5.01632 7.96828 5.00015C7.5179 5.71034 7.25645 6.5506 7.25645 7.45678Z" fill="white"/>
        </svg>
      </button>

      <!-- Link / Integrations -->
      <button
        v-if="rolesStore.canAccess('integrations')"
        type="button"
        title="Integrations"
        class="flex items-center justify-center w-10 h-10 rounded-xl text-white transition-colors"
        :class="activeIndex === 3 ? 'bg-white/15' : 'hover:bg-white/10'"
        @click="navigateTo(3)"
      >
        <svg width="19" height="19" viewBox="0 0 19 19" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14.8245 9.60492C14.4734 10.0179 13.8245 10.0209 13.4151 9.6115L9.30513 5.50151C8.8957 5.09208 8.89872 4.44321 9.3117 4.09209L10.4401 3.13273C11.2512 2.44308 12.2403 1.98585 13.3124 1.80495L13.9769 1.69282C14.6045 1.58693 15.2644 1.80615 15.7352 2.27691L16.6397 3.18146C17.1105 3.65223 17.3297 4.31213 17.2238 4.93971L17.1117 5.60425C16.9308 6.6763 16.4735 7.66541 15.7839 8.47655L14.8245 9.60492Z" stroke="white" stroke-width="1.5"/>
          <path d="M16.334 2.58333L18.1673 0.75" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M0.75 18.1666L2.58333 16.3333" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4.09343 9.3117C4.44456 8.89872 5.09342 8.8957 5.50285 9.30513L9.61284 13.4151C10.0223 13.8245 10.0192 14.4734 9.60627 14.8245L8.47789 15.7839C7.66675 16.4735 6.67764 16.9308 5.6056 17.1117L4.94105 17.2238C4.31348 17.3297 3.65357 17.1105 3.18281 16.6397L2.27826 15.7352C1.80749 15.2644 1.58827 14.6045 1.69416 13.9769L1.8063 13.3124C1.98719 12.2403 2.44443 11.2512 3.13407 10.4401L4.09343 9.3117Z" stroke="white" stroke-width="1.5"/>
          <path d="M6.25 9.91665L8.08333 8.08331M9 12.6666L10.8333 10.8333" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <!-- Bottom settings icon -->
    <div v-if="rolesStore.canAccess('settings')" class="flex flex-col items-center">
      <button
        type="button"
        title="Settings"
        class="flex items-center justify-center w-10 h-10 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        @click="$router.push('/settings')"
      >
        <Settings :size="20" />
      </button>
    </div>
  </aside>
</template>
