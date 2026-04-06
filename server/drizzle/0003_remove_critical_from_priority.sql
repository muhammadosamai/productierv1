-- Migrate critical priority to high, then recreate enums without 'critical'

-- item_priority (backlog_items, initiatives)
UPDATE "backlog_items" SET "priority" = 'high'::item_priority WHERE "priority"::text = 'critical';
UPDATE "initiatives" SET "priority" = 'high'::item_priority WHERE "priority"::text = 'critical';
ALTER TYPE "item_priority" RENAME TO "item_priority_old";
CREATE TYPE "public"."item_priority" AS ENUM('low', 'medium', 'high');
ALTER TABLE "backlog_items" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "backlog_items" ALTER COLUMN "priority" SET DATA TYPE "public"."item_priority" USING "priority"::text::"public"."item_priority";
ALTER TABLE "backlog_items" ALTER COLUMN "priority" SET DEFAULT 'medium'::"public"."item_priority";
ALTER TABLE "initiatives" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "initiatives" ALTER COLUMN "priority" SET DATA TYPE "public"."item_priority" USING "priority"::text::"public"."item_priority";
ALTER TABLE "initiatives" ALTER COLUMN "priority" SET DEFAULT 'medium'::"public"."item_priority";
DROP TYPE "item_priority_old";

-- task_priority
UPDATE "tasks" SET "priority" = 'high'::task_priority WHERE "priority"::text = 'critical';
ALTER TYPE "task_priority" RENAME TO "task_priority_old";
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high');
ALTER TABLE "tasks" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "tasks" ALTER COLUMN "priority" SET DATA TYPE "public"."task_priority" USING "priority"::text::"public"."task_priority";
ALTER TABLE "tasks" ALTER COLUMN "priority" SET DEFAULT 'medium'::"public"."task_priority";
DROP TYPE "task_priority_old";

-- issue_priority
UPDATE "issues" SET "priority" = 'high'::issue_priority WHERE "priority"::text = 'critical';
ALTER TYPE "issue_priority" RENAME TO "issue_priority_old";
CREATE TYPE "public"."issue_priority" AS ENUM('high', 'medium', 'low');
ALTER TABLE "issues" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "issues" ALTER COLUMN "priority" SET DATA TYPE "public"."issue_priority" USING "priority"::text::"public"."issue_priority";
ALTER TABLE "issues" ALTER COLUMN "priority" SET DEFAULT 'medium'::"public"."issue_priority";
DROP TYPE "issue_priority_old";

-- consumer_feedback_priority
UPDATE "consumer_feedbacks" SET "priority" = 'high'::consumer_feedback_priority WHERE "priority"::text = 'critical';
ALTER TYPE "consumer_feedback_priority" RENAME TO "consumer_feedback_priority_old";
CREATE TYPE "public"."consumer_feedback_priority" AS ENUM('low', 'medium', 'high');
ALTER TABLE "consumer_feedbacks" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "consumer_feedbacks" ALTER COLUMN "priority" SET DATA TYPE "public"."consumer_feedback_priority" USING "priority"::text::"public"."consumer_feedback_priority";
ALTER TABLE "consumer_feedbacks" ALTER COLUMN "priority" SET DEFAULT 'medium'::"public"."consumer_feedback_priority";
DROP TYPE "consumer_feedback_priority_old";
