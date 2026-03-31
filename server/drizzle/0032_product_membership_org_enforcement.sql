CREATE OR REPLACE FUNCTION enforce_product_member_organization_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  product_organization_id uuid;
BEGIN
  SELECT p.organization_id
  INTO product_organization_id
  FROM products p
  WHERE p.id = NEW.product;

  IF product_organization_id IS NULL THEN
    RAISE EXCEPTION
      'Cannot assign product membership: product % is not bound to an organization',
      NEW.product
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM organization_members om
    WHERE om.organization_id = product_organization_id
      AND om.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION
      'Cannot assign product membership: user % is not a member of organization %',
      NEW.user_id,
      product_organization_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_members_require_org_membership
ON product_members;

CREATE TRIGGER product_members_require_org_membership
BEFORE INSERT OR UPDATE OF product, user_id
ON product_members
FOR EACH ROW
EXECUTE FUNCTION enforce_product_member_organization_membership();
