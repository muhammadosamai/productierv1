-- Add 'blocker' as highest issue severity (before 'critical')
ALTER TYPE "issue_severity" ADD VALUE IF NOT EXISTS 'blocker' BEFORE 'critical';
