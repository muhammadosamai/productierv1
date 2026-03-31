DO $$ BEGIN CREATE TYPE consumer_feedback_type AS ENUM ('bug', 'feature', 'enhancement'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE consumer_feedback_status AS ENUM ('new', 'acknowledged', 'investigating', 'resolved', 'wont_fix', 'duplicate'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE consumer_feedback_priority AS ENUM ('low', 'medium', 'high', 'critical'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS consumer_feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type consumer_feedback_type NOT NULL DEFAULT 'bug',
  status consumer_feedback_status NOT NULL DEFAULT 'new',
  priority consumer_feedback_priority NOT NULL DEFAULT 'medium',
  reporter_name VARCHAR(255),
  reporter_email VARCHAR(255),
  reporter_device VARCHAR(255),
  reporter_browser VARCHAR(255),
  reporter_os VARCHAR(255),
  app_version VARCHAR(50),
  page_url VARCHAR(500),
  steps_to_reproduce TEXT,
  expected_behavior TEXT,
  actual_behavior TEXT,
  story_id UUID REFERENCES backlog_items(id),
  assigned_to_user_id UUID REFERENCES users(id),
  tags TEXT[],
  upvote_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consumer_feedback_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES consumer_feedbacks(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_type VARCHAR(50) NOT NULL DEFAULT 'image',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consumer_feedback_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES consumer_feedbacks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  is_internal INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
