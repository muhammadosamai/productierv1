import type {
  MetadataEnumsResponse,
  MetadataNavigationResponse,
  MetadataPagesResponse,
  MetadataRoutesResponse,
  MetadataSettingsKeysResponse,
} from '@/types/metadata'
import { apiJson } from '@/lib/api/core'

export const metadataApi = {
  getPages(token?: string | null) {
    return apiJson<MetadataPagesResponse>('/metadata/pages', { token })
  },
  getRoutes(token?: string | null) {
    return apiJson<MetadataRoutesResponse>('/metadata/routes', { token })
  },
  getNavigation(token?: string | null) {
    return apiJson<MetadataNavigationResponse>('/metadata/navigation', { token })
  },
  getEnums(token?: string | null) {
    return apiJson<MetadataEnumsResponse>('/metadata/enums', { token })
  },
  getSettingsKeys(token?: string | null) {
    return apiJson<MetadataSettingsKeysResponse>('/metadata/settings-keys', { token })
  },
}
