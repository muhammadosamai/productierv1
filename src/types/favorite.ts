export type FavoriteEntityType =
  | 'initiative'
  | 'story'
  | 'task'
  | 'delivery'
  | 'release'
  | 'feature_request'
  | 'consumer_feedback'
  | 'test_cycle'
  | 'team_member'

export interface Favorite {
  id: string
  userId: string
  entityType: FavoriteEntityType
  entityId: string
  productId: string
  createdAt: string
}
