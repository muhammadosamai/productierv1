-- Safe if 0000 already created story_attachments; fixes DBs where the table was never applied.
-- Journal `when` must be greater than every earlier migration (see 0006). Drizzle only runs
-- migrations whose `when` exceeds max(created_at) in drizzle.__drizzle_migrations.
CREATE TABLE IF NOT EXISTS "story_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"file_name" varchar(500) NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(255) NOT NULL,
	"file_path" varchar(1000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_attachments" ADD CONSTRAINT "story_attachments_story_id_backlog_items_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."backlog_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_attachments" ADD CONSTRAINT "story_attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
