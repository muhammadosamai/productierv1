-- Extend issue_type enum for non-defect work items.
ALTER TYPE "public"."issue_type" ADD VALUE IF NOT EXISTS 'feature';
ALTER TYPE "public"."issue_type" ADD VALUE IF NOT EXISTS 'enhancement';
