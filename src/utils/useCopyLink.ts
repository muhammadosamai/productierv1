import { ref } from 'vue'

export function useCopyLink() {
  const copied = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  function copyLink(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      copied.value = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        copied.value = false
      }, 2000)
    })
  }

  return { copied, copyLink }
}
