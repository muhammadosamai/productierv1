export function parseDeliveryPrefix(title: string) {
  const match = title.match(/^(#\d+)\s+(.*)$/)
  if (match) return { prefix: match[1], rest: match[2] }
  return { prefix: '', rest: title }
}

export function qualityStatusDot(status: string | undefined): string {
  switch (status) {
    case 'planned':
      return 'bg-[#fdab3d]'
    case 'in_progress':
      return 'bg-[#00c875]'
    case 'completed':
      return 'bg-gray-400'
    case 'archived':
      return 'bg-gray-300'
    default:
      return 'bg-gray-300'
  }
}

export function qualityStatusText(status: string | undefined): string {
  switch (status) {
    case 'planned':
      return 'text-[#fdab3d]'
    case 'in_progress':
      return 'text-[#00c875]'
    case 'completed':
    case 'archived':
      return 'text-gray-400'
    default:
      return 'text-gray-500'
  }
}
