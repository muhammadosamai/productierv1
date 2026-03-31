CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Tasks: analytics/list filters
CREATE INDEX IF NOT EXISTS "tasks_product_created_idx"
ON "tasks" ("product_id", "created_at");

CREATE INDEX IF NOT EXISTS "tasks_product_completed_partial_idx"
ON "tasks" ("product_id", "completed_at")
WHERE "completed_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "tasks_product_status_due_idx"
ON "tasks" ("product_id", "status", "due_at");

CREATE INDEX IF NOT EXISTS "tasks_delivery_status_created_idx"
ON "tasks" ("delivery_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "tasks_owner_product_idx"
ON "tasks" ("owner_user_id", "product_id");

CREATE INDEX IF NOT EXISTS "tasks_assignee_user_ids_gin_idx"
ON "tasks" USING gin ("assignee_user_ids");

CREATE INDEX IF NOT EXISTS "tasks_reviewer_user_ids_gin_idx"
ON "tasks" USING gin ("reviewer_user_ids");

-- Task status history: flow/cfd/quality queries
CREATE INDEX IF NOT EXISTS "task_status_history_task_changed_idx"
ON "task_status_history" ("task_id", "changed_at" DESC);

CREATE INDEX IF NOT EXISTS "task_status_history_product_changed_idx"
ON "task_status_history" ("product_id", "changed_at" DESC);

CREATE INDEX IF NOT EXISTS "task_status_history_product_to_status_changed_idx"
ON "task_status_history" ("product_id", "to_status", "changed_at" DESC);

CREATE INDEX IF NOT EXISTS "task_status_history_product_from_status_changed_idx"
ON "task_status_history" ("product_id", "from_status", "changed_at" DESC);

-- Activities list queries
CREATE INDEX IF NOT EXISTS "activities_product_created_idx"
ON "activities" ("product", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "activities_entity_created_idx"
ON "activities" ("entity_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "activities_user_created_idx"
ON "activities" ("user_id", "created_at" DESC);

-- Search indexes (trigram)
CREATE INDEX IF NOT EXISTS "users_name_trgm_idx"
ON "users" USING gin ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "users_email_trgm_idx"
ON "users" USING gin ("email" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "assets_title_trgm_idx"
ON "assets" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "assets_description_trgm_idx"
ON "assets" USING gin ("description" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "stories_title_trgm_idx"
ON "backlog_items" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "stories_description_trgm_idx"
ON "backlog_items" USING gin ("description" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "deliveries_product_created_idx"
ON "deliveries" ("product_id", "created_at");

CREATE INDEX IF NOT EXISTS "releases_product_created_idx"
ON "releases" ("product_id", "created_at");

CREATE INDEX IF NOT EXISTS "test_cycles_product_created_idx"
ON "test_cycles" ("product_id", "created_at");

CREATE INDEX IF NOT EXISTS "feature_requests_product_created_idx"
ON "feature_requests" ("product_id", "created_at");

CREATE INDEX IF NOT EXISTS "consumer_feedback_product_created_idx"
ON "consumer_feedbacks" ("product_id", "created_at");
