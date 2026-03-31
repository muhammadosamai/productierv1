DO $$ BEGIN
  CREATE TYPE test_cycle_status AS ENUM ('planned', 'in_progress', 'completed', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE issue_severity AS ENUM ('critical', 'major', 'minor', 'trivial');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE issue_status AS ENUM ('open', 'in_progress', 'resolved', 'closed', 'deferred');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS test_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status test_cycle_status NOT NULL DEFAULT 'planned',
  delivery_id UUID REFERENCES deliveries(id),
  release_id UUID REFERENCES releases(id),
  product_id VARCHAR(255) NOT NULL,
  start_date DATE,
  end_date DATE,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS test_cycle_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_cycle_id UUID NOT NULL REFERENCES test_cycles(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  severity issue_severity NOT NULL DEFAULT 'minor',
  status issue_status NOT NULL DEFAULT 'open',
  story_id UUID REFERENCES backlog_items(id),
  reported_by_user_id UUID NOT NULL REFERENCES users(id),
  assigned_to_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
