-- Release management enums
DO $$ BEGIN
  CREATE TYPE release_status AS ENUM ('draft', 'planned', 'in_progress', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE release_type AS ENUM ('feature', 'hotfix', 'patch');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE environment AS ENUM ('dev', 'stage', 'prod');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE deployment_status AS ENUM ('pending', 'deploying', 'deployed', 'failed', 'rolled_back');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE target_status AS ENUM ('pending', 'deploying', 'deployed', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Releases table
CREATE TABLE IF NOT EXISTS releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50),
  version VARCHAR(50),
  title VARCHAR(255) NOT NULL,
  status release_status NOT NULL DEFAULT 'draft',
  release_type release_type NOT NULL DEFAULT 'feature',
  planned_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_by_user_id UUID NOT NULL,
  release_manager_id UUID,
  notes TEXT,
  release_notes TEXT,
  product_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Release deliveries (join table)
CREATE TABLE IF NOT EXISTS release_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  deployment_order INTEGER,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  added_by_user_id UUID,
  CONSTRAINT release_delivery_unique UNIQUE(release_id, delivery_id)
);

-- Release deployments (per environment)
CREATE TABLE IF NOT EXISTS release_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  environment environment NOT NULL,
  sequence INTEGER NOT NULL,
  status deployment_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  failed_at TIMESTAMP,
  deployed_by_user_id UUID,
  notes TEXT,
  CONSTRAINT release_deployment_env_unique UNIQUE(release_id, environment)
);

-- Servers table
CREATE TABLE IF NOT EXISTS servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  environment environment NOT NULL,
  host VARCHAR(500),
  port INTEGER,
  protocol VARCHAR(20),
  region VARCHAR(100),
  provider VARCHAR(100),
  instance_id VARCHAR(255),
  is_active INTEGER NOT NULL DEFAULT 1,
  product_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Deployment targets (per server)
CREATE TABLE IF NOT EXISTS deployment_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_deployment_id UUID NOT NULL REFERENCES release_deployments(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES servers(id),
  status target_status NOT NULL DEFAULT 'pending',
  deployed_at TIMESTAMP,
  failed_at TIMESTAMP,
  logs_url VARCHAR(1000),
  CONSTRAINT deployment_target_unique UNIQUE(release_deployment_id, server_id)
);
