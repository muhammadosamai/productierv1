CREATE TYPE "public"."delivery_status" AS ENUM('initialized', 'in_progress', 'overdue', 'blocked', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."deployment_status" AS ENUM('pending', 'deploying', 'deployed', 'failed', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."environment" AS ENUM('dev', 'stage', 'prod');--> statement-breakpoint
CREATE TYPE "public"."initiative_status" AS ENUM('planning', 'active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."release_status" AS ENUM('draft', 'planned', 'in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."release_type" AS ENUM('feature', 'hotfix', 'patch');--> statement-breakpoint
CREATE TYPE "public"."item_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('backlog', 'ready', 'in_progress', 'done', 'archived');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('feature', 'bug', 'improvement', 'technical_debt', 'research', 'infrastructure', 'testing', 'documentation');--> statement-breakpoint
CREATE TYPE "public"."target_status" AS ENUM('pending', 'deploying', 'deployed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('created', 'assigned', 'in_progress', 'in_review', 'done', 'overdue', 'blocked', 'archived');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('design', 'development', 'testing', 'review', 'research', 'fix', 'documentation', 'deployment');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'admin', 'product_admin', 'product_manager', 'business_analyst', 'developer', 'viewer');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product" varchar(255) NOT NULL,
	"user_id" uuid,
	"user_name" varchar(255) NOT NULL,
	"user_avatar" varchar(500),
	"action" varchar(50) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid,
	"entity_title" varchar(255) NOT NULL,
	"changes" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"start_date" date,
	"end_date" date,
	"status" "delivery_status" DEFAULT 'initialized' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_initiatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"initiative_id" uuid NOT NULL,
	CONSTRAINT "delivery_initiative_unique" UNIQUE("delivery_id","initiative_id")
);
--> statement-breakpoint
CREATE TABLE "deployment_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_deployment_id" uuid NOT NULL,
	"server_id" uuid NOT NULL,
	"status" "target_status" DEFAULT 'pending' NOT NULL,
	"deployed_at" timestamp,
	"failed_at" timestamp,
	"logs_url" varchar(1000),
	CONSTRAINT "deployment_target_unique" UNIQUE("release_deployment_id","server_id")
);
--> statement-breakpoint
CREATE TABLE "initiatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" "initiative_status" DEFAULT 'planning' NOT NULL,
	"period" varchar(100),
	"period_start" date,
	"period_end" date,
	"leader" varchar(255),
	"leader_avatar" varchar(500),
	"priority" "item_priority" DEFAULT 'medium' NOT NULL,
	"product" varchar(255) DEFAULT 'Product' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product" varchar(255) NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(50) DEFAULT 'member' NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_user_unique" UNIQUE("product","user_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"logo" varchar(500),
	"description" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "release_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"delivery_id" uuid NOT NULL,
	"deployment_order" integer,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by_user_id" uuid,
	CONSTRAINT "release_delivery_unique" UNIQUE("release_id","delivery_id")
);
--> statement-breakpoint
CREATE TABLE "release_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"environment" "environment" NOT NULL,
	"sequence" integer NOT NULL,
	"status" "deployment_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"failed_at" timestamp,
	"deployed_by_user_id" uuid,
	"notes" text,
	CONSTRAINT "release_deployment_env_unique" UNIQUE("release_id","environment")
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50),
	"version" varchar(50),
	"title" varchar(255) NOT NULL,
	"status" "release_status" DEFAULT 'draft' NOT NULL,
	"release_type" "release_type" DEFAULT 'feature' NOT NULL,
	"planned_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_by_user_id" uuid NOT NULL,
	"release_manager_id" uuid,
	"notes" text,
	"release_notes" text,
	"product_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"environment" "environment" NOT NULL,
	"host" varchar(500),
	"port" integer,
	"protocol" varchar(20),
	"region" varchar(100),
	"provider" varchar(100),
	"instance_id" varchar(255),
	"is_active" integer DEFAULT 1 NOT NULL,
	"product_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backlog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"type" "item_type" DEFAULT 'feature' NOT NULL,
	"priority" "item_priority" DEFAULT 'medium' NOT NULL,
	"status" "item_status" DEFAULT 'backlog' NOT NULL,
	"product" varchar(255) DEFAULT 'Product' NOT NULL,
	"initiative" varchar(255),
	"delivery" varchar(255),
	"owner" varchar(255),
	"owner_avatar" varchar(500),
	"estimate" varchar(50),
	"acceptance_criteria" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"file_name" varchar(500) NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(255) NOT NULL,
	"file_path" varchar(1000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"product_id" varchar(255) NOT NULL,
	"from_status" "task_status",
	"to_status" "task_status" NOT NULL,
	"changed_by_user_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar(255) NOT NULL,
	"initiative_id" uuid,
	"item_id" uuid NOT NULL,
	"delivery_id" uuid,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'created' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"type" "task_type",
	"owner_user_id" uuid,
	"assignee_user_ids" uuid[],
	"reviewer_user_ids" uuid[],
	"created_by_user_id" uuid NOT NULL,
	"estimate_value" integer,
	"dependent" uuid[],
	"blocked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"due_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" json NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_unique" UNIQUE("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"avatar" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_initiatives" ADD CONSTRAINT "delivery_initiatives_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_initiatives" ADD CONSTRAINT "delivery_initiatives_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_targets" ADD CONSTRAINT "deployment_targets_release_deployment_id_release_deployments_id_fk" FOREIGN KEY ("release_deployment_id") REFERENCES "public"."release_deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_targets" ADD CONSTRAINT "deployment_targets_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_members" ADD CONSTRAINT "product_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_deliveries" ADD CONSTRAINT "release_deliveries_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_deliveries" ADD CONSTRAINT "release_deliveries_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_deployments" ADD CONSTRAINT "release_deployments_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_status_history" ADD CONSTRAINT "task_status_history_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_status_history" ADD CONSTRAINT "task_status_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_item_id_backlog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."backlog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;