-- Favorites table for user-scoped item pinning
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  product_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_entity_unique
  ON favorites (user_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS favorites_user_product_idx
  ON favorites (user_id, product_id);
