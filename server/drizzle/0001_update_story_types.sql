-- Add new enum values to item_type (story types)
ALTER TYPE item_type ADD VALUE IF NOT EXISTS 'technical_debt';
ALTER TYPE item_type ADD VALUE IF NOT EXISTS 'infrastructure';
ALTER TYPE item_type ADD VALUE IF NOT EXISTS 'testing';
ALTER TYPE item_type ADD VALUE IF NOT EXISTS 'documentation';

-- Migrate existing 'request' stories to 'feature'
UPDATE backlog_items SET type = 'feature' WHERE type = 'request';

-- Create new task_type enum
DO $$ BEGIN
  CREATE TYPE task_type AS ENUM ('design', 'development', 'testing', 'review', 'research', 'fix', 'documentation', 'deployment');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Change the tasks.type column from item_type to task_type
-- First set all existing task types to NULL (they used story types before)
UPDATE tasks SET type = NULL;

-- Alter the column type (must go through text as intermediate)
ALTER TABLE tasks ALTER COLUMN type TYPE text USING type::text;
ALTER TABLE tasks ALTER COLUMN type TYPE task_type USING type::task_type;
