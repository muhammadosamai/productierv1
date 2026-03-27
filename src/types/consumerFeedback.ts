export type ConsumerFeedbackType = 'bug' | 'feature' | 'enhancement'
export type ConsumerFeedbackStatus = 'new' | 'acknowledged' | 'investigating' | 'resolved' | 'wont_fix' | 'duplicate'
export type ConsumerFeedbackPriority = 'low' | 'medium' | 'high' | 'critical'

export interface ConsumerFeedback {
  id: string
  productId: string
  title: string
  description: string | null
  type: ConsumerFeedbackType
  status: ConsumerFeedbackStatus
  priority: ConsumerFeedbackPriority
  reporterName: string | null
  reporterEmail: string | null
  reporterDevice: string | null
  reporterBrowser: string | null
  reporterOs: string | null
  appVersion: string | null
  pageUrl: string | null
  stepsToReproduce: string | null
  expectedBehavior: string | null
  actualBehavior: string | null
  storyId: string | null
  assignedToUserId: string | null
  tags: string[] | null
  upvoteCount: number
  createdAt: string
  updatedAt: string
  assignedToUser?: { id: string; name: string; email: string; avatar: string | null }
  attachments?: ConsumerFeedbackAttachment[]
  comments?: ConsumerFeedbackComment[]
  commentCount?: number
  attachmentCount?: number
}

export interface ConsumerFeedbackAttachment {
  id: string
  feedbackId: string
  fileName: string
  fileSize: number
  mimeType: string
  filePath: string
  fileType: string
  createdAt: string
}

export interface ConsumerFeedbackComment {
  id: string
  feedbackId: string
  userId: string
  content: string
  isInternal: number
  createdAt: string
  user?: { id: string; name: string; email: string; avatar: string | null }
}
