import { ref, watch } from 'vue'
import { storageGet, storageSet } from '@/lib/browserStorage'

export type TableViewMode = 'table' | 'card'

export function usePersistedViewMode(
  storageKey: string,
  saveSetting?: (key: string, value: unknown) => void,
  defaultMode: TableViewMode = 'table',
) {
  const stored = storageGet(storageKey)
  const initial = stored === 'table' || stored === 'card' ? stored : defaultMode
  const viewMode = ref<TableViewMode>(initial)

  watch(viewMode, (value) => {
    storageSet(storageKey, value)
    saveSetting?.(storageKey, value)
  })

  return viewMode
}
