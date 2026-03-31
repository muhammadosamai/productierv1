-- Add new story status enum values
ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'drafted';
ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'initialized';
ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'completed';

-- Migrate existing statuses to new ones
UPDATE backlog_items SET status = 'completed' WHERE status::text = 'done';
UPDATE backlog_items SET status = 'initialized' WHERE status::text = 'ready';
