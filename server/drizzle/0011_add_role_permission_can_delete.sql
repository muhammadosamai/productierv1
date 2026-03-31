ALTER TABLE "role_permissions"
ADD COLUMN IF NOT EXISTS "can_delete" boolean NOT NULL DEFAULT true;
