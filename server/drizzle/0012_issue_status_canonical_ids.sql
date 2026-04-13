-- Canonical issue status UUIDs (v5 over fixed namespace + legacy slug).
-- Custom slug values not listed here are left unchanged for backward compatibility.

UPDATE "issues" SET "status" = 'a64cad55-e8d5-5903-9096-31b2ee5f5b5c' WHERE "status" = 'open';
UPDATE "issues" SET "status" = '9a7050b5-e3ce-544c-aa70-bdc7f9f62b2e' WHERE "status" = 'in_progress';
UPDATE "issues" SET "status" = '10269c95-fdb3-5b1e-bc4c-53648851c504' WHERE "status" = 'resolved';
UPDATE "issues" SET "status" = '02623fd6-b209-5ce5-ad87-40ba672363e4' WHERE "status" = 'closed';
UPDATE "issues" SET "status" = 'caa34daf-316b-58f5-ad4d-93675039f0c3' WHERE "status" = 'deferred';

UPDATE "test_cycle_issues" SET "status" = 'a64cad55-e8d5-5903-9096-31b2ee5f5b5c' WHERE "status" = 'open';
UPDATE "test_cycle_issues" SET "status" = '9a7050b5-e3ce-544c-aa70-bdc7f9f62b2e' WHERE "status" = 'in_progress';
UPDATE "test_cycle_issues" SET "status" = '10269c95-fdb3-5b1e-bc4c-53648851c504' WHERE "status" = 'resolved';
UPDATE "test_cycle_issues" SET "status" = '02623fd6-b209-5ce5-ad87-40ba672363e4' WHERE "status" = 'closed';
UPDATE "test_cycle_issues" SET "status" = 'caa34daf-316b-58f5-ad4d-93675039f0c3' WHERE "status" = 'deferred';

ALTER TABLE "issues" ALTER COLUMN "status" SET DEFAULT 'a64cad55-e8d5-5903-9096-31b2ee5f5b5c';
ALTER TABLE "test_cycle_issues" ALTER COLUMN "status" SET DEFAULT 'a64cad55-e8d5-5903-9096-31b2ee5f5b5c';
