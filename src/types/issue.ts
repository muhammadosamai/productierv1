export type IssueType = 'bug' | 'ui_issue' | 'performance' | 'crash' | 'security' | 'data_loss' | 'other'
export type IssueSeverity = 'blocker' | 'critical' | 'major' | 'minor' | 'trivial'
export type IssuePriority = 'high' | 'medium' | 'low'
/** Stored issue status; allowed set is defined per product in the issue form config. */
export type IssueStatus = string
export type IssueReproducibility = 'always' | 'sometimes' | 'rarely' | 'once' | 'unable_to_reproduce'
export type IssueEnvironment = 'production' | 'staging' | 'development' | 'testing'
export type IssueBrowser = 'chrome' | 'firefox' | 'safari' | 'edge' | 'other'
export type IssueOs = 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'other'

export interface Issue {
  id: string
  title: string
  description: string | null
  type: IssueType
  module: string | null
  stepsToReproduce: string | null
  expectedBehavior: string | null
  actualBehavior: string | null
  reproducibility: IssueReproducibility | null
  severity: IssueSeverity
  priority: IssuePriority
  status: IssueStatus
  assignedToUserId: string | null
  reportedByUserId: string
  appVersion: string | null
  environment: IssueEnvironment | null
  browser: IssueBrowser | null
  operatingSystem: IssueOs | null
  product: string
  storyId: string | null
  taskId: string | null
  testCycleId: string | null
  estimateValue: number | null
  startDate: string | null
  endDate: string | null
  /** Hidden from lists/search when true; only product admins can archive or view. */
  archived?: boolean
  createdAt: string
  updatedAt: string
  reportedBy?: { id: string; name: string; email: string; avatar: string | null }
  assignedTo?: { id: string; name: string; email: string; avatar: string | null } | null
  testCycle?: { id: string; name: string } | null
  story?: { id: string; title: string; status: string } | null
  comments?: IssueComment[]
  attachments?: IssueAttachment[]
}

export interface IssueComment {
  id: string
  issueId: string
  userId: string
  content: string
  createdAt: string
  updatedAt: string
  user?: { id: string; name: string; email: string; avatar: string | null }
}

export interface IssueAttachment {
  id: string
  issueId: string
  userId: string
  fileName: string
  fileSize: number
  mimeType: string
  filePath: string
  createdAt: string
  user?: { id: string; name: string; email: string; avatar: string | null }
}

export interface CreateIssuePayload {
  title: string
  description?: string | null
  type?: IssueType
  module?: string | null
  stepsToReproduce?: string | null
  expectedBehavior?: string | null
  actualBehavior?: string | null
  reproducibility?: IssueReproducibility | null
  severity?: IssueSeverity
  priority?: IssuePriority
  status?: IssueStatus
  assignedToUserId?: string | null
  reportedByUserId?: string
  appVersion?: string | null
  environment?: IssueEnvironment | null
  browser?: IssueBrowser | null
  operatingSystem?: IssueOs | null
  product?: string
  storyId?: string | null
  taskId?: string | null
  testCycleId?: string | null
  estimateValue?: number | null
  startDate?: string | null
  endDate?: string | null
  archived?: boolean
}
