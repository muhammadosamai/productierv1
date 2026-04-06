ALTER TABLE "task_subtasks" ADD COLUMN "assignee_user_ids" uuid[];
UPDATE "task_subtasks" SET "assignee_user_ids" = ARRAY["assignee_user_id"] WHERE "assignee_user_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "task_subtasks" DROP CONSTRAINT "task_subtasks_assignee_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "task_subtasks" DROP COLUMN "assignee_user_id";
--> statement-breakpoint
ALTER TABLE "task_subtasks" ADD COLUMN "type" "task_type";
--> statement-breakpoint
ALTER TABLE "task_subtasks" ADD COLUMN "estimate_value" double precision;
--> statement-breakpoint
ALTER TABLE "task_subtasks" ADD COLUMN "dependent" uuid[];
--> statement-breakpoint
ALTER TABLE "task_subtasks" ADD COLUMN "blocked_reason" text;
--> statement-breakpoint
ALTER TABLE "task_subtasks" ADD COLUMN "due_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "task_subtasks" ADD COLUMN "delivery_id" uuid;
--> statement-breakpoint
ALTER TABLE "task_subtasks" ADD COLUMN "started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "task_subtasks" ADD COLUMN "completed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "task_subtasks" ADD CONSTRAINT "task_subtasks_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;
