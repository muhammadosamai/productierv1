-- Phase 2: rewrite denormalized product scope columns from products.name -> products.project_key
-- Prerequisites: 0014, 0015 applied; every product has non-null project_key.

UPDATE "product_members" pm
SET "product" = p."project_key"
FROM "products" p
WHERE pm."product" = p."name";

UPDATE "product_invites" pi
SET "product" = p."project_key"
FROM "products" p
WHERE pi."product" = p."name";

UPDATE "backlog_items" bi
SET "product" = p."project_key"
FROM "products" p
WHERE bi."product" = p."name";

UPDATE "issues" iss
SET "product" = p."project_key"
FROM "products" p
WHERE iss."product" = p."name";

UPDATE "initiatives" ini
SET "product" = p."project_key"
FROM "products" p
WHERE ini."product" = p."name";

UPDATE "activities" act
SET "product" = p."project_key"
FROM "products" p
WHERE act."product" = p."name";

UPDATE "deliveries" d
SET "product_id" = p."project_key"
FROM "products" p
WHERE d."product_id" = p."name";

UPDATE "releases" r
SET "product_id" = p."project_key"
FROM "products" p
WHERE r."product_id" = p."name";

UPDATE "favorites" f
SET "product_id" = p."project_key"
FROM "products" p
WHERE f."product_id" = p."name";

UPDATE "test_cycles" tc
SET "product_id" = p."project_key"
FROM "products" p
WHERE tc."product_id" = p."name";

UPDATE "asset_types" at
SET "product_id" = p."project_key"
FROM "products" p
WHERE at."product_id" = p."name";

UPDATE "assets" a
SET "product_id" = p."project_key"
FROM "products" p
WHERE a."product_id" = p."name";

UPDATE "form_configs" fc
SET "product" = p."project_key"
FROM "products" p
WHERE fc."product" = p."name";

UPDATE "feature_requests" fr
SET "product_id" = p."project_key"
FROM "products" p
WHERE fr."product_id" = p."name";

UPDATE "consumer_feedbacks" cf
SET "product_id" = p."project_key"
FROM "products" p
WHERE cf."product_id" = p."name";

UPDATE "servers" s
SET "product_id" = p."project_key"
FROM "products" p
WHERE s."product_id" = p."name";

-- tasks.product_id may be products.id (uuid text) or legacy product name
UPDATE "tasks" t
SET "product_id" = p."project_key"
FROM "products" p
WHERE t."product_id" = p."id"::text;

UPDATE "tasks" t
SET "product_id" = p."project_key"
FROM "products" p
WHERE t."product_id" = p."name";

UPDATE "task_status_history" h
SET "product_id" = p."project_key"
FROM "products" p
WHERE h."product_id" = p."id"::text;

UPDATE "task_status_history" h
SET "product_id" = p."project_key"
FROM "products" p
WHERE h."product_id" = p."name";
