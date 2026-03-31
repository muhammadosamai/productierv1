-- Asset-based Wiki system

-- Enums
DO $$ BEGIN
  CREATE TYPE asset_status AS ENUM ('draft', 'active', 'deprecated', 'archived');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE asset_visibility AS ENUM ('public', 'internal', 'private');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Asset Types (extensible registry)
CREATE TABLE IF NOT EXISTS asset_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'business',
  icon VARCHAR(50),
  color VARCHAR(20),
  product_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT asset_type_slug_product_unique UNIQUE(slug, product_id)
);

-- Assets (primary wiki objects)
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id VARCHAR(255) NOT NULL,
  asset_type_id UUID NOT NULL REFERENCES asset_types(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255),
  description TEXT,
  content TEXT,
  status asset_status NOT NULL DEFAULT 'draft',
  visibility asset_visibility NOT NULL DEFAULT 'internal',
  owner_user_id UUID REFERENCES users(id),
  tags TEXT[],
  parent_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Asset Relations (links between assets)
CREATE TABLE IF NOT EXISTS asset_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  target_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  relation_type VARCHAR(50) NOT NULL DEFAULT 'related_to',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT asset_relation_unique UNIQUE(source_asset_id, target_asset_id, relation_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_assets_product ON assets(product_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type_id);
CREATE INDEX IF NOT EXISTS idx_assets_parent ON assets(parent_id);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_asset_types_product ON asset_types(product_id);
