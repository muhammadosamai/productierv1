#!/usr/bin/env sh
set -eu

# When RUN_DB_MIGRATIONS=true: migrate → backfill-project-keys → migrate
# (see scripts/run-migrations-with-backfill.sh).
if [ "${RUN_DB_MIGRATIONS:-false}" = "true" ]; then
  sh scripts/run-migrations-with-backfill.sh
fi

exec bun src/index.ts
