export type TestCycleStatus = 'planned' | 'in_progress' | 'completed' | 'archived'
export type IssueSeverity = 'blocker' | 'critical' | 'major' | 'minor' | 'trivial'
export type IssueStatus = string

export interface TestCycleIssue {
  id: string
  testCycleId: string
  title: string
  description: string | null
  severity: IssueSeverity
  status: IssueStatus
  storyId: string | null
  reportedByUserId: string
  assignedToUserId: string | null
  createdAt: string
  updatedAt: string
  reportedByUser?: { id: string; name: string; email: string; avatar: string | null }
  assignedToUser?: { id: string; name: string; email: string; avatar: string | null }
  story?: { id: string; title: string } | null
}

/** Minimal row from main `issues` table when `testCycleId` is set (list counts / open counts). */
export interface TestCycleLinkedIssueRef {
  id: string
  status: string
}

export interface TestCycle {
  id: string
  title: string
  description: string | null
  status: TestCycleStatus
  deliveryId: string | null
  releaseId: string | null
  productId: string
  startDate: string | null
  endDate: string | null
  createdByUserId: string
  createdAt: string
  updatedAt: string
  createdByUser?: { id: string; name: string; email: string; avatar: string | null }
  delivery?: { id: string; title: string } | null
  release?: { id: string; title: string; version: string | null } | null
  /** Legacy `test_cycle_issues` rows */
  issues?: TestCycleIssue[]
  /** Main product issues linked to this cycle (`issues.test_cycle_id`) */
  linkedIssues?: TestCycleLinkedIssueRef[]
}

export interface CreateTestCyclePayload {
  title: string
  description?: string | null
  status?: TestCycleStatus
  deliveryId?: string | null
  releaseId?: string | null
  startDate?: string | null
  endDate?: string | null
}

export interface CreateIssuePayload {
  title: string
  description?: string | null
  severity?: IssueSeverity
  status?: IssueStatus
  storyId?: string | null
  assignedToUserId?: string | null
}
