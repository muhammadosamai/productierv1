#!/usr/bin/env sh
# Same sequence as docker-entrypoint.sh when RUN_DB_MIGRATIONS=true (for local / CI).
set -eu
echo "db:migrate (pass 1)..."
first_failed=0
bun run db:migrate || first_failed=1
echo "db:backfill-project-keys..."
bun run db:backfill-project-keys
echo "db:migrate (pass 2)..."
bun run db:migrate
if [ "$first_failed" = "1" ]; then
  echo "First migrate pass failed; completed after backfill + second pass."
fi
