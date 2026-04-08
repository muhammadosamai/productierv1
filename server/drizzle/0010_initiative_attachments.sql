CREATE TABLE IF NOT EXISTS "initiative_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"initiative_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"file_name" varchar(500) NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(255) NOT NULL,
	"file_path" varchar(1000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "initiative_attachments" ADD CONSTRAINT "initiative_attachments_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "initiative_attachments" ADD CONSTRAINT "initiative_attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
