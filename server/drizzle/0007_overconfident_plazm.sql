ALTER TABLE "task_subtasks" ALTER COLUMN "sort_order" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;
