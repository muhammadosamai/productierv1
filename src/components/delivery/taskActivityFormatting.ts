export interface TaskActivityChange {
  field: string
  from: string | null
  to: string | null
}

export interface TaskActivityChangeValueResolver {
  (value: string | null): string | null
}

export function activityActionColor(action: string) {
  switch (action) {
    case 'created': return 'bg-[#00c875]'
    case 'deleted': return 'bg-red-500'
    default: return 'bg-[#579bfc]'
  }
}

export function activityUserInitials(name: string) {
  return name.split(' ').map((word) => word[0]).join('').toUpperCase().slice(0, 2)
}

export function activityFormatField(field: string) {
  return field.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function isUserField(field: string): boolean {
  return [
    'ownerUserId',
    'ownerTeamId',
    'reviewerUserIds',
    'reviewerTeamIds',
    'assigneeUserIds',
    'assigneeTeamIds',
    'createdBy',
  ].includes(field)
}

export function changeFieldLabel(field: string): string {
  switch (field) {
    case 'ownerUserId': return 'Owner'
    case 'ownerTeamId': return 'Owner Team'
    case 'reviewerUserIds': return 'Reviewers'
    case 'reviewerTeamIds': return 'Reviewer Teams'
    case 'assigneeUserIds': return 'Assignees'
    case 'assigneeTeamIds': return 'Assignee Teams'
    case 'createdBy': return 'Created by'
    case 'blockedReason': return 'Blocked reason'
    case 'estimateValue': return 'Estimate'
    case 'dueAt': return 'Due date'
    case 'dependent': return 'Dependency'
    case 'comment': return 'Comment'
    case 'attachment': return 'Attachment'
    default: return activityFormatField(field)
  }
}

export function changeActionType(change: { from: string | null; to: string | null }): 'added' | 'removed' | 'updated' {
  if (!change.from && change.to) return 'added'
  if (change.from && !change.to) return 'removed'
  return 'updated'
}

export function changeIconColor(change: { from: string | null; to: string | null }): string {
  const type = changeActionType(change)
  switch (type) {
    case 'added': return 'text-[#00c875]'
    case 'removed': return 'text-red-500'
    case 'updated': return 'text-[#fdab3d]'
  }
}

export function changeDescription(change: TaskActivityChange): string {
  const fieldLabel = changeFieldLabel(change.field)
  const action = changeActionType(change)

  if (change.field === 'comment') {
    if (action === 'added') return 'Added a comment'
    if (action === 'removed') return 'Removed a comment'
    return 'Updated a comment'
  }

  if (change.field === 'attachment') {
    if (action === 'added') return 'Added an attachment'
    if (action === 'removed') return 'Removed an attachment'
    return 'Updated an attachment'
  }

  if (isUserField(change.field)) {
    if (action === 'added') return `Added ${fieldLabel.toLowerCase()}`
    if (action === 'removed') return `Removed ${fieldLabel.toLowerCase()}`
    return `Updated ${fieldLabel.toLowerCase()}`
  }

  if (action === 'added') return `Set ${fieldLabel.toLowerCase()}`
  if (action === 'removed') return `Cleared ${fieldLabel.toLowerCase()}`
  return `Updated ${fieldLabel.toLowerCase()}`
}

export function formatChangeValue(
  field: string,
  value: string | null,
  resolveUserValue: TaskActivityChangeValueResolver,
): string {
  if (!value) return '—'
  if (field === 'dueAt') {
    const dateValue = new Date(value)
    if (!isNaN(dateValue.getTime())) {
      return dateValue.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
  }
  if (field === 'estimateValue') {
    const numeric = parseFloat(value)
    if (!isNaN(numeric)) return `${numeric}h`
  }
  if (isUserField(field)) return resolveUserValue(value) || value
  return activityFormatField(value)
}
