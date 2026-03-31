ALTER TABLE "role_permissions" ALTER COLUMN "visible" SET DEFAULT false;
ALTER TABLE "role_permissions" ALTER COLUMN "can_create" SET DEFAULT false;
ALTER TABLE "role_permissions" ALTER COLUMN "can_edit" SET DEFAULT false;
ALTER TABLE "role_permissions" ALTER COLUMN "can_delete" SET DEFAULT false;

WITH role_set(role) AS (
  VALUES
    ('admin'::user_role),
    ('product_admin'::user_role),
    ('product_manager'::user_role),
    ('business_analyst'::user_role),
    ('developer'::user_role),
    ('viewer'::user_role)
),
page_set(page, self_view_configurable) AS (
  VALUES
    ('home', false),
    ('overview', false),
    ('wiki', false),
    ('team', false),
    ('initiatives', true),
    ('stories', true),
    ('tasks', true),
    ('deliveries', true),
    ('releases', true),
    ('test-cycles', false),
    ('issues', false),
    ('feedbacks', false),
    ('feature-requests', false),
    ('users', false),
    ('integrations', false),
    ('settings', false)
),
matrix AS (
  SELECT
    role_set.role,
    page_set.page,
    CASE
      WHEN role_set.role = 'viewer'::user_role
       AND page_set.page IN ('users', 'integrations', 'settings')
      THEN false
      ELSE true
    END AS visible,
    CASE WHEN role_set.role = 'viewer'::user_role THEN false ELSE true END AS can_create,
    CASE WHEN role_set.role = 'viewer'::user_role THEN false ELSE true END AS can_edit,
    CASE WHEN role_set.role = 'viewer'::user_role THEN false ELSE true END AS can_delete,
    CASE
      WHEN role_set.role = 'viewer'::user_role
       AND page_set.self_view_configurable
      THEN true
      ELSE false
    END AS self_view_only
  FROM role_set
  CROSS JOIN page_set
)
INSERT INTO "role_permissions" (
  "role",
  "page",
  "visible",
  "can_create",
  "can_edit",
  "can_delete",
  "self_view_only"
)
SELECT
  matrix.role,
  matrix.page,
  matrix.visible,
  matrix.can_create,
  matrix.can_edit,
  matrix.can_delete,
  matrix.self_view_only
FROM matrix
ON CONFLICT ("role", "page") DO NOTHING;

