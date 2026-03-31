export type FavoriteEntityType =
  | 'initiative'
  | 'story'
  | 'task'
  | 'delivery'
  | 'release'
  | 'test_cycle'
  | 'team_member'
  | 'feature_request'
  | 'consumer_feedback'

export interface Favorite {
  id: string
  userId: string
  entityType: FavoriteEntityType
  entityId: string
  productId: string
  createdAt: string
}
