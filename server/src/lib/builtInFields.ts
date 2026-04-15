import { ISSUE_TYPES } from '../../../shared/issueTypes'

interface FormFieldConfig {
  key: string
  label: string
  type: string
  required: boolean
  visible: boolean
  isBuiltIn: boolean
  locked?: boolean
  options?: string[]
  order: number
}

const storyFields: FormFieldConfig[] = [
  { key: 'title', label: 'Title', type: 'text', required: true, visible: true, isBuiltIn: true, locked: true, order: 0 },
  { key: 'description', label: 'Description', type: 'textarea', required: false, visible: true, isBuiltIn: true, order: 1 },
  { key: 'type', label: 'Type', type: 'select', required: true, visible: true, isBuiltIn: true, order: 2, options: ['feature', 'bug', 'improvement', 'technical_debt', 'research', 'infrastructure', 'testing', 'documentation'] },
  { key: 'priority', label: 'Priority', type: 'select', required: true, visible: true, isBuiltIn: true, order: 3, options: ['high', 'medium', 'low'] },
  { key: 'status', label: 'Status', type: 'select', required: true, visible: true, isBuiltIn: true, order: 4, options: ['backlog', 'drafted', 'initialized', 'in_progress', 'completed', 'archived'] },
  { key: 'initiative', label: 'Initiative', type: 'text', required: false, visible: true, isBuiltIn: true, order: 5 },
  { key: 'delivery', label: 'Delivery', type: 'text', required: false, visible: true, isBuiltIn: true, order: 6 },
  { key: 'owner', label: 'Owner', type: 'single_user_picker', required: false, visible: true, isBuiltIn: true, order: 7 },
  { key: 'estimate', label: 'Estimate', type: 'text', required: false, visible: true, isBuiltIn: true, order: 8 },
  { key: 'acceptanceCriteria', label: 'Acceptance Criteria', type: 'textarea', required: false, visible: true, isBuiltIn: true, order: 9 },
]

const taskFields: FormFieldConfig[] = [
  { key: 'title', label: 'Title', type: 'text', required: true, visible: true, isBuiltIn: true, locked: true, order: 0 },
  { key: 'description', label: 'Description', type: 'textarea', required: false, visible: true, isBuiltIn: true, order: 1 },
  { key: 'status', label: 'Status', type: 'select', required: true, visible: true, isBuiltIn: true, order: 2, options: ['created', 'assigned', 'in_progress', 'in_review', 'done', 'overdue', 'blocked', 'archived'] },
  { key: 'priority', label: 'Priority', type: 'select', required: true, visible: true, isBuiltIn: true, order: 3, options: ['high', 'medium', 'low'] },
  { key: 'type', label: 'Type', type: 'select', required: false, visible: true, isBuiltIn: true, order: 4, options: ['design', 'development', 'testing', 'review', 'research', 'fix', 'documentation', 'deployment'] },
  { key: 'ownerUserId', label: 'Owner', type: 'single_user_picker', required: false, visible: true, isBuiltIn: true, order: 5 },
  { key: 'assigneeUserIds', label: 'Assignees', type: 'user_picker', required: false, visible: true, isBuiltIn: true, order: 6 },
  { key: 'reviewerUserIds', label: 'Reviewers', type: 'user_picker', required: false, visible: true, isBuiltIn: true, order: 7 },
  { key: 'estimateValue', label: 'Estimate (hours)', type: 'number', required: false, visible: true, isBuiltIn: true, order: 8 },
  { key: 'dueAt', label: 'Due Date', type: 'date', required: false, visible: true, isBuiltIn: true, order: 9 },
  { key: 'dependent', label: 'Dependencies', type: 'multi_select', required: false, visible: false, isBuiltIn: true, order: 10 },
  { key: 'blockedReason', label: 'Blocked Reason', type: 'textarea', required: false, visible: false, isBuiltIn: true, order: 11 },
]

const issueFields: FormFieldConfig[] = [
  { key: 'title', label: 'Title', type: 'text', required: true, visible: true, isBuiltIn: true, locked: true, order: 0 },
  { key: 'description', label: 'Description', type: 'textarea', required: false, visible: true, isBuiltIn: true, order: 1 },
  { key: 'type', label: 'Type', type: 'select', required: true, visible: true, isBuiltIn: true, order: 2, options: [...ISSUE_TYPES] },
  { key: 'module', label: 'Module / Feature', type: 'text', required: false, visible: true, isBuiltIn: true, order: 3 },
  { key: 'stepsToReproduce', label: 'Steps to Reproduce', type: 'textarea', required: false, visible: true, isBuiltIn: true, order: 4 },
  { key: 'expectedBehavior', label: 'Expected Behavior', type: 'textarea', required: false, visible: true, isBuiltIn: true, order: 5 },
  { key: 'actualBehavior', label: 'Actual Behavior', type: 'textarea', required: false, visible: true, isBuiltIn: true, order: 6 },
  { key: 'reproducibility', label: 'Reproducibility', type: 'select', required: false, visible: true, isBuiltIn: true, order: 7, options: ['always', 'sometimes', 'rarely', 'once', 'unable_to_reproduce'] },
  { key: 'severity', label: 'Severity', type: 'select', required: true, visible: true, isBuiltIn: true, order: 8, options: ['blocker', 'critical', 'major', 'minor', 'trivial'] },
  { key: 'priority', label: 'Priority', type: 'select', required: true, visible: true, isBuiltIn: true, order: 9, options: ['high', 'medium', 'low'] },
  { key: 'status', label: 'Status', type: 'select', required: true, visible: true, isBuiltIn: true, order: 10, options: ['open', 'in_progress', 'resolved', 'closed', 'deferred'] },
  { key: 'assignedToUserId', label: 'Assigned To', type: 'single_user_picker', required: false, visible: true, isBuiltIn: true, order: 11 },
  { key: 'appVersion', label: 'App Version', type: 'text', required: false, visible: true, isBuiltIn: true, order: 12 },
  { key: 'environment', label: 'Environment', type: 'select', required: false, visible: true, isBuiltIn: true, order: 13, options: ['production', 'staging', 'development', 'testing'] },
  { key: 'browser', label: 'Browser', type: 'select', required: false, visible: false, isBuiltIn: true, order: 14, options: ['chrome', 'firefox', 'safari', 'edge', 'other'] },
  { key: 'operatingSystem', label: 'Operating System', type: 'select', required: false, visible: false, isBuiltIn: true, order: 15, options: ['windows', 'macos', 'linux', 'ios', 'android', 'other'] },
  { key: 'testCycleId', label: 'Testing Cycle', type: 'select', required: false, visible: true, isBuiltIn: true, order: 16 },
  { key: 'estimateValue', label: 'Estimate (hours)', type: 'number', required: false, visible: true, isBuiltIn: true, order: 17 },
  { key: 'startDate', label: 'Start date', type: 'date', required: false, visible: true, isBuiltIn: true, order: 18 },
  { key: 'endDate', label: 'End date', type: 'date', required: false, visible: true, isBuiltIn: true, order: 19 },
]

export const builtInFieldsByEntity: Record<string, FormFieldConfig[]> = {
  story: storyFields,
  task: taskFields,
  issue: issueFields,
}

export function getDefaultConfig(entityType: string): { fields: FormFieldConfig[] } {
  const fields = builtInFieldsByEntity[entityType]
  if (!fields) return { fields: [] }
  return { fields: fields.map(f => ({ ...f })) }
}
