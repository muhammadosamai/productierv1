import { db } from '../db'
import { sql } from 'drizzle-orm'

/**
 * Some deployments only ran partial SQL (e.g. issues bootstrap) and never applied
 * the full Drizzle baseline where `form_configs` / `custom_field_values` are created.
 */
let formConfigsSchemaBootstrapped = false

export async function ensureFormConfigsSchema() {
  if (formConfigsSchemaBootstrapped) return

  await db.execute(sql`
CREATE TABLE IF NOT EXISTS form_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  product varchar(255) NOT NULL,
  entity_type varchar(50) NOT NULL,
  config json NOT NULL,
  updated_by_user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT form_config_product_entity_unique UNIQUE (product, entity_type)
);

CREATE TABLE IF NOT EXISTS custom_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  entity_type varchar(50) NOT NULL,
  entity_id uuid NOT NULL,
  field_key varchar(100) NOT NULL,
  value json,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT cfv_entity_field_unique UNIQUE (entity_type, entity_id, field_key)
);
`)

  await db.execute(sql`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_configs_updated_by_user_id_users_id_fk') THEN
    ALTER TABLE form_configs
      ADD CONSTRAINT form_configs_updated_by_user_id_users_id_fk
      FOREIGN KEY (updated_by_user_id) REFERENCES users(id);
  END IF;
END $$;
`)

  formConfigsSchemaBootstrapped = true
}
