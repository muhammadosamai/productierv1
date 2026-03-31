CREATE TYPE "public"."asset_status" AS ENUM('draft', 'active', 'deprecated', 'archived');--> statement-breakpoint
CREATE TYPE "public"."asset_visibility" AS ENUM('public', 'internal', 'private');--> statement-breakpoint
CREATE TYPE "public"."consumer_feedback_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."consumer_feedback_status" AS ENUM('new', 'acknowledged', 'investigating', 'resolved', 'wont_fix', 'duplicate');--> statement-breakpoint
CREATE TYPE "public"."consumer_feedback_type" AS ENUM('bug', 'feature', 'enhancement');--> statement-breakpoint
CREATE TYPE "public"."feature_request_category" AS ENUM('enhancement', 'new_feature', 'integration', 'ux_improvement', 'performance', 'other');--> statement-breakpoint
CREATE TYPE "public"."feature_request_status" AS ENUM('open', 'under_review', 'planned', 'in_progress', 'completed', 'declined');--> statement-breakpoint
CREATE TYPE "public"."issue_severity" AS ENUM('critical', 'major', 'minor', 'trivial');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('open', 'in_progress', 'resolved', 'closed', 'deferred');--> statement-breakpoint
CREATE TYPE "public"."test_cycle_status" AS ENUM('planned', 'in_progress', 'completed', 'archived');--> statement-breakpoint
CREATE TABLE "asset_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_asset_id" uuid NOT NULL,
	"target_asset_id" uuid NOT NULL,
	"relation_type" varchar(50) DEFAULT 'related_to' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_relation_unique" UNIQUE("source_asset_id","target_asset_id","relation_type")
);
--> statement-breakpoint
CREATE TABLE "asset_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"category" varchar(100) DEFAULT 'business' NOT NULL,
	"icon" varchar(50),
	"color" varchar(20),
	"product_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_type_slug_product_unique" UNIQUE("slug","product_id")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar(255) NOT NULL,
	"asset_type_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255),
	"description" text,
	"content" text,
	"status" "asset_status" DEFAULT 'draft' NOT NULL,
	"visibility" "asset_visibility" DEFAULT 'internal' NOT NULL,
	"owner_user_id" uuid,
	"tags" text[],
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_feedback_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feedback_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_path" varchar(500) NOT NULL,
	"file_type" varchar(50) DEFAULT 'image' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_feedback_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feedback_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"is_internal" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_feedbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"type" "consumer_feedback_type" DEFAULT 'bug' NOT NULL,
	"status" "consumer_feedback_status" DEFAULT 'new' NOT NULL,
	"priority" "consumer_feedback_priority" DEFAULT 'medium' NOT NULL,
	"reporter_name" varchar(255),
	"reporter_email" varchar(255),
	"reporter_device" varchar(255),
	"reporter_browser" varchar(255),
	"reporter_os" varchar(255),
	"app_version" varchar(50),
	"page_url" varchar(500),
	"steps_to_reproduce" text,
	"expected_behavior" text,
	"actual_behavior" text,
	"story_id" uuid,
	"assigned_to_user_id" uuid,
	"tags" text[],
	"upvote_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"product_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_entity_unique" UNIQUE("user_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "feature_request_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_path" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_request_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_request_upvotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_request_upvote_unique" UNIQUE("feature_request_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "feature_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" "feature_request_status" DEFAULT 'open' NOT NULL,
	"category" "feature_request_category" DEFAULT 'enhancement' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"story_id" uuid,
	"tags" text[],
	"upvote_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "user_role" NOT NULL,
	"page" varchar(100) NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"can_create" boolean DEFAULT true NOT NULL,
	"can_edit" boolean DEFAULT true NOT NULL,
	"self_view_only" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_unique" UNIQUE("role","page")
);
--> statement-breakpoint
CREATE TABLE "story_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_cycle_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_cycle_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"severity" "issue_severity" DEFAULT 'minor' NOT NULL,
	"status" "issue_status" DEFAULT 'open' NOT NULL,
	"story_id" uuid,
	"reported_by_user_id" uuid NOT NULL,
	"assigned_to_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" "test_cycle_status" DEFAULT 'planned' NOT NULL,
	"delivery_id" uuid,
	"release_id" uuid,
	"product_id" varchar(255) NOT NULL,
	"start_date" date,
	"end_date" date,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_relations" ADD CONSTRAINT "asset_relations_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_relations" ADD CONSTRAINT "asset_relations_target_asset_id_assets_id_fk" FOREIGN KEY ("target_asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_asset_type_id_asset_types_id_fk" FOREIGN KEY ("asset_type_id") REFERENCES "public"."asset_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_feedback_attachments" ADD CONSTRAINT "consumer_feedback_attachments_feedback_id_consumer_feedbacks_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."consumer_feedbacks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_feedback_comments" ADD CONSTRAINT "consumer_feedback_comments_feedback_id_consumer_feedbacks_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."consumer_feedbacks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_feedback_comments" ADD CONSTRAINT "consumer_feedback_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_feedbacks" ADD CONSTRAINT "consumer_feedbacks_story_id_backlog_items_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."backlog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumer_feedbacks" ADD CONSTRAINT "consumer_feedbacks_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_request_attachments" ADD CONSTRAINT "feature_request_attachments_feature_request_id_feature_requests_id_fk" FOREIGN KEY ("feature_request_id") REFERENCES "public"."feature_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_request_attachments" ADD CONSTRAINT "feature_request_attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_request_comments" ADD CONSTRAINT "feature_request_comments_feature_request_id_feature_requests_id_fk" FOREIGN KEY ("feature_request_id") REFERENCES "public"."feature_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_request_comments" ADD CONSTRAINT "feature_request_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_request_upvotes" ADD CONSTRAINT "feature_request_upvotes_feature_request_id_feature_requests_id_fk" FOREIGN KEY ("feature_request_id") REFERENCES "public"."feature_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_request_upvotes" ADD CONSTRAINT "feature_request_upvotes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_story_id_backlog_items_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."backlog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_comments" ADD CONSTRAINT "story_comments_story_id_backlog_items_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."backlog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_comments" ADD CONSTRAINT "story_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cycle_issues" ADD CONSTRAINT "test_cycle_issues_test_cycle_id_test_cycles_id_fk" FOREIGN KEY ("test_cycle_id") REFERENCES "public"."test_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cycle_issues" ADD CONSTRAINT "test_cycle_issues_story_id_backlog_items_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."backlog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cycle_issues" ADD CONSTRAINT "test_cycle_issues_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cycle_issues" ADD CONSTRAINT "test_cycle_issues_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cycles" ADD CONSTRAINT "test_cycles_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cycles" ADD CONSTRAINT "test_cycles_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cycles" ADD CONSTRAINT "test_cycles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."backlog_items" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."backlog_items" ALTER COLUMN "status" SET DATA TYPE text USING "status"::text;--> statement-breakpoint
UPDATE "public"."backlog_items" SET "status" = 'initialized' WHERE "status" = 'ready';--> statement-breakpoint
UPDATE "public"."backlog_items" SET "status" = 'completed' WHERE "status" = 'done';--> statement-breakpoint
DROP TYPE "public"."item_status";--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('backlog', 'drafted', 'initialized', 'in_progress', 'completed', 'archived');--> statement-breakpoint
ALTER TABLE "public"."backlog_items" ALTER COLUMN "status" SET DATA TYPE "public"."item_status" USING "status"::"public"."item_status";
ALTER TABLE "public"."backlog_items" ALTER COLUMN "status" SET DEFAULT 'backlog';