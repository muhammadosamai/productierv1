import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import UploadAssetImg from './components/shared/UploadAssetImg.vue'

const app = createApp(App)
app.component('UploadAssetImg', UploadAssetImg)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Restore auth session from localStorage before mounting
const authStore = useAuthStore()
authStore.init().then(() => {
  app.mount('#app')
})
