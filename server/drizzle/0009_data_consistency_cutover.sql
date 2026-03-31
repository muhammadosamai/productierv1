DO $$ BEGIN
  ALTER TYPE initiative_status ADD VALUE IF NOT EXISTS 'archived';
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
DECLARE
  unresolved_count bigint;
  ambiguous_count bigint;
BEGIN
  -- Story owner name references must map to exactly one user.
  SELECT COUNT(*) INTO unresolved_count
  FROM backlog_items b
  WHERE b.owner IS NOT NULL
    AND btrim(b.owner) <> ''
    AND NOT EXISTS (SELECT 1 FROM users u WHERE u.name = b.owner);

  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Cutover blocked: % backlog_items.owner values do not map to users.name', unresolved_count;
  END IF;

  SELECT COUNT(*) INTO ambiguous_count
  FROM backlog_items b
  WHERE b.owner IS NOT NULL
    AND btrim(b.owner) <> ''
    AND (SELECT COUNT(*) FROM users u WHERE u.name = b.owner) > 1;

  IF ambiguous_count > 0 THEN
    RAISE EXCEPTION 'Cutover blocked: % backlog_items.owner values map to multiple users.name rows', ambiguous_count;
  END IF;

  -- Initiative leader name references must map to exactly one user.
  SELECT COUNT(*) INTO unresolved_count
  FROM initiatives i
  WHERE i.leader IS NOT NULL
    AND btrim(i.leader) <> ''
    AND NOT EXISTS (SELECT 1 FROM users u WHERE u.name = i.leader);

  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Cutover blocked: % initiatives.leader values do not map to users.name', unresolved_count;
  END IF;

  SELECT COUNT(*) INTO ambiguous_count
  FROM initiatives i
  WHERE i.leader IS NOT NULL
    AND btrim(i.leader) <> ''
    AND (SELECT COUNT(*) FROM users u WHERE u.name = i.leader) > 1;

  IF ambiguous_count > 0 THEN
    RAISE EXCEPTION 'Cutover blocked: % initiatives.leader values map to multiple users.name rows', ambiguous_count;
  END IF;
END $$;

ALTER TABLE backlog_items
  ADD COLUMN IF NOT EXISTS owner_user_id uuid;

UPDATE backlog_items b
SET owner_user_id = u.id
FROM users u
WHERE b.owner_user_id IS NULL
  AND b.owner IS NOT NULL
  AND btrim(b.owner) <> ''
  AND u.name = b.owner;

ALTER TABLE backlog_items
  DROP CONSTRAINT IF EXISTS backlog_items_owner_user_id_users_id_fk;
ALTER TABLE backlog_items
  ADD CONSTRAINT backlog_items_owner_user_id_users_id_fk
  FOREIGN KEY (owner_user_id) REFERENCES users(id);

ALTER TABLE backlog_items
  DROP COLUMN IF EXISTS owner,
  DROP COLUMN IF EXISTS owner_avatar;

ALTER TABLE initiatives
  ADD COLUMN IF NOT EXISTS leader_user_id uuid;

UPDATE initiatives i
SET leader_user_id = u.id
FROM users u
WHERE i.leader_user_id IS NULL
  AND i.leader IS NOT NULL
  AND btrim(i.leader) <> ''
  AND u.name = i.leader;

ALTER TABLE initiatives
  DROP CONSTRAINT IF EXISTS initiatives_leader_user_id_users_id_fk;
ALTER TABLE initiatives
  ADD CONSTRAINT initiatives_leader_user_id_users_id_fk
  FOREIGN KEY (leader_user_id) REFERENCES users(id);

ALTER TABLE initiatives
  DROP COLUMN IF EXISTS leader,
  DROP COLUMN IF EXISTS leader_avatar;

DO $$
DECLARE
  unresolved_count bigint;
BEGIN
  SELECT COUNT(*) INTO unresolved_count FROM backlog_items b
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = b.product);
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Cutover blocked: % backlog_items.product values are not in products.name', unresolved_count;
  END IF;

  SELECT COUNT(*) INTO unresolved_count FROM initiatives i
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = i.product);
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Cutover blocked: % initiatives.product values are not in products.name', unresolved_count;
  END IF;

  SELECT COUNT(*) INTO unresolved_count FROM activities a
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = a.product);
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Cutover blocked: % activities.product values are not in products.name', unresolved_count;
  END IF;

  SELECT COUNT(*) INTO unresolved_count FROM product_members pm
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = pm.product);
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Cutover blocked: % product_members.product values are not in products.name', unresolved_count;
  END IF;

  SELECT COUNT(*) INTO unresolved_count FROM tasks t
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = t.product_id);
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Cutover blocked: % tasks.product_id values are not in products.name', unresolved_count;
  END IF;

  SELECT COUNT(*) INTO unresolved_count FROM deliveries d
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = d.product_id);
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Cutover blocked: % deliveries.product_id values are not in products.name', unresolved_count;
  END IF;

  SELECT COUNT(*) INTO unresolved_count FROM releases r
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = r.product_id);
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Cutover blocked: % releases.product_id values are not in products.name', unresolved_count;
  END IF;

  SELECT COUNT(*) INTO unresolved_count FROM servers s
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = s.product_id);
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Cutover blocked: % servers.product_id values are not in products.name', unresolved_count;
  END IF;

  SELECT COUNT(*) INTO unresolved_count FROM task_status_history h
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = h.product_id);
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Cutover blocked: % task_status_history.product_id values are not in products.name', unresolved_count;
  END IF;

  SELECT COUNT(*) INTO unresolved_count FROM favorites f
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = f.product_id);
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Cutover blocked: % favorites.product_id values are not in products.name', unresolved_count;
  END IF;

  SELECT COUNT(*) INTO unresolved_count FROM test_cycles tc
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = tc.product_id);
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Cutover blocked: % test_cycles.product_id values are not in products.name', unresolved_count;
  END IF;

  SELECT COUNT(*) INTO unresolved_count FROM asset_types at
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = at.product_id);
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Cutover blocked: % asset_types.product_id values are not in products.name', unresolved_count;
  END IF;

  SELECT COUNT(*) INTO unresolved_count FROM assets a
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = a.product_id);
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Cutover blocked: % assets.product_id values are not in products.name', unresolved_count;
  END IF;

  SELECT COUNT(*) INTO unresolved_count FROM feature_requests fr
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = fr.product_id);
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Cutover blocked: % feature_requests.product_id values are not in products.name', unresolved_count;
  END IF;

  SELECT COUNT(*) INTO unresolved_count FROM consumer_feedbacks cf
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = cf.product_id);
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Cutover blocked: % consumer_feedbacks.product_id values are not in products.name', unresolved_count;
  END IF;
END $$;

ALTER TABLE backlog_items ALTER COLUMN product DROP DEFAULT;
ALTER TABLE initiatives ALTER COLUMN product DROP DEFAULT;

ALTER TABLE backlog_items
  ALTER COLUMN product TYPE uuid
  USING (
    CASE
      WHEN backlog_items.product::text ~* '^[0-9a-fA-F-]{36}$' THEN backlog_items.product::uuid
      ELSE (SELECT p.id FROM products p WHERE p.name = backlog_items.product)
    END
  );
ALTER TABLE initiatives
  ALTER COLUMN product TYPE uuid
  USING (
    CASE
      WHEN initiatives.product::text ~* '^[0-9a-fA-F-]{36}$' THEN initiatives.product::uuid
      ELSE (SELECT p.id FROM products p WHERE p.name = initiatives.product)
    END
  );
ALTER TABLE activities
  ALTER COLUMN product TYPE uuid
  USING (
    CASE
      WHEN activities.product::text ~* '^[0-9a-fA-F-]{36}$' THEN activities.product::uuid
      ELSE (SELECT p.id FROM products p WHERE p.name = activities.product)
    END
  );
ALTER TABLE activities
  ALTER COLUMN product DROP NOT NULL;
ALTER TABLE product_members
  ALTER COLUMN product TYPE uuid
  USING (
    CASE
      WHEN product_members.product::text ~* '^[0-9a-fA-F-]{36}$' THEN product_members.product::uuid
      ELSE (SELECT p.id FROM products p WHERE p.name = product_members.product)
    END
  );
ALTER TABLE tasks
  ALTER COLUMN product_id TYPE uuid
  USING (
    CASE
      WHEN tasks.product_id::text ~* '^[0-9a-fA-F-]{36}$' THEN tasks.product_id::uuid
      ELSE (SELECT p.id FROM products p WHERE p.name = tasks.product_id)
    END
  );
ALTER TABLE deliveries
  ALTER COLUMN product_id TYPE uuid
  USING (
    CASE
      WHEN deliveries.product_id::text ~* '^[0-9a-fA-F-]{36}$' THEN deliveries.product_id::uuid
      ELSE (SELECT p.id FROM products p WHERE p.name = deliveries.product_id)
    END
  );
ALTER TABLE releases
  ALTER COLUMN product_id TYPE uuid
  USING (
    CASE
      WHEN releases.product_id::text ~* '^[0-9a-fA-F-]{36}$' THEN releases.product_id::uuid
      ELSE (SELECT p.id FROM products p WHERE p.name = releases.product_id)
    END
  );
ALTER TABLE servers
  ALTER COLUMN product_id TYPE uuid
  USING (
    CASE
      WHEN servers.product_id::text ~* '^[0-9a-fA-F-]{36}$' THEN servers.product_id::uuid
      ELSE (SELECT p.id FROM products p WHERE p.name = servers.product_id)
    END
  );
ALTER TABLE task_status_history
  ALTER COLUMN product_id TYPE uuid
  USING (
    CASE
      WHEN task_status_history.product_id::text ~* '^[0-9a-fA-F-]{36}$' THEN task_status_history.product_id::uuid
      ELSE (SELECT p.id FROM products p WHERE p.name = task_status_history.product_id)
    END
  );
ALTER TABLE favorites
  ALTER COLUMN product_id TYPE uuid
  USING (
    CASE
      WHEN favorites.product_id::text ~* '^[0-9a-fA-F-]{36}$' THEN favorites.product_id::uuid
      ELSE (SELECT p.id FROM products p WHERE p.name = favorites.product_id)
    END
  );
ALTER TABLE test_cycles
  ALTER COLUMN product_id TYPE uuid
  USING (
    CASE
      WHEN test_cycles.product_id::text ~* '^[0-9a-fA-F-]{36}$' THEN test_cycles.product_id::uuid
      ELSE (SELECT p.id FROM products p WHERE p.name = test_cycles.product_id)
    END
  );
ALTER TABLE asset_types
  ALTER COLUMN product_id TYPE uuid
  USING (
    CASE
      WHEN asset_types.product_id::text ~* '^[0-9a-fA-F-]{36}$' THEN asset_types.product_id::uuid
      ELSE (SELECT p.id FROM products p WHERE p.name = asset_types.product_id)
    END
  );
ALTER TABLE assets
  ALTER COLUMN product_id TYPE uuid
  USING (
    CASE
      WHEN assets.product_id::text ~* '^[0-9a-fA-F-]{36}$' THEN assets.product_id::uuid
      ELSE (SELECT p.id FROM products p WHERE p.name = assets.product_id)
    END
  );
ALTER TABLE feature_requests
  ALTER COLUMN product_id TYPE uuid
  USING (
    CASE
      WHEN feature_requests.product_id::text ~* '^[0-9a-fA-F-]{36}$' THEN feature_requests.product_id::uuid
      ELSE (SELECT p.id FROM products p WHERE p.name = feature_requests.product_id)
    END
  );
ALTER TABLE consumer_feedbacks
  ALTER COLUMN product_id TYPE uuid
  USING (
    CASE
      WHEN consumer_feedbacks.product_id::text ~* '^[0-9a-fA-F-]{36}$' THEN consumer_feedbacks.product_id::uuid
      ELSE (SELECT p.id FROM products p WHERE p.name = consumer_feedbacks.product_id)
    END
  );

ALTER TABLE backlog_items
  DROP CONSTRAINT IF EXISTS backlog_items_product_products_id_fk;
ALTER TABLE initiatives
  DROP CONSTRAINT IF EXISTS initiatives_product_products_id_fk;
ALTER TABLE activities
  DROP CONSTRAINT IF EXISTS activities_product_products_id_fk;
ALTER TABLE product_members
  DROP CONSTRAINT IF EXISTS product_members_product_products_id_fk;
ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_product_id_products_id_fk;
ALTER TABLE deliveries
  DROP CONSTRAINT IF EXISTS deliveries_product_id_products_id_fk;
ALTER TABLE releases
  DROP CONSTRAINT IF EXISTS releases_product_id_products_id_fk;
ALTER TABLE servers
  DROP CONSTRAINT IF EXISTS servers_product_id_products_id_fk;
ALTER TABLE task_status_history
  DROP CONSTRAINT IF EXISTS task_status_history_product_id_products_id_fk;
ALTER TABLE favorites
  DROP CONSTRAINT IF EXISTS favorites_product_id_products_id_fk;
ALTER TABLE test_cycles
  DROP CONSTRAINT IF EXISTS test_cycles_product_id_products_id_fk;
ALTER TABLE asset_types
  DROP CONSTRAINT IF EXISTS asset_types_product_id_products_id_fk;
ALTER TABLE assets
  DROP CONSTRAINT IF EXISTS assets_product_id_products_id_fk;
ALTER TABLE feature_requests
  DROP CONSTRAINT IF EXISTS feature_requests_product_id_products_id_fk;
ALTER TABLE consumer_feedbacks
  DROP CONSTRAINT IF EXISTS consumer_feedbacks_product_id_products_id_fk;

ALTER TABLE backlog_items
  ADD CONSTRAINT backlog_items_product_products_id_fk
  FOREIGN KEY (product) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE initiatives
  ADD CONSTRAINT initiatives_product_products_id_fk
  FOREIGN KEY (product) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE activities
  ADD CONSTRAINT activities_product_products_id_fk
  FOREIGN KEY (product) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE product_members
  ADD CONSTRAINT product_members_product_products_id_fk
  FOREIGN KEY (product) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_product_id_products_id_fk
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE deliveries
  ADD CONSTRAINT deliveries_product_id_products_id_fk
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE releases
  ADD CONSTRAINT releases_product_id_products_id_fk
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE servers
  ADD CONSTRAINT servers_product_id_products_id_fk
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE task_status_history
  ADD CONSTRAINT task_status_history_product_id_products_id_fk
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE favorites
  ADD CONSTRAINT favorites_product_id_products_id_fk
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE test_cycles
  ADD CONSTRAINT test_cycles_product_id_products_id_fk
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE asset_types
  ADD CONSTRAINT asset_types_product_id_products_id_fk
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE assets
  ADD CONSTRAINT assets_product_id_products_id_fk
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE feature_requests
  ADD CONSTRAINT feature_requests_product_id_products_id_fk
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE consumer_feedbacks
  ADD CONSTRAINT consumer_feedbacks_product_id_products_id_fk
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
