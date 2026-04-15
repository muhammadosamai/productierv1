FROM oven/bun:1 AS base
WORKDIR /app
  
# Install curl for healthcheck (oven/bun:1 is Debian-based); done early for layer caching
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install all deps (including devDependencies so drizzle-kit is available for migrations)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# uploads/ tree is copied from the repo (.gitkeep); ensure non-root can write
RUN chmod +x docker-entrypoint.sh scripts/run-migrations-with-backfill.sh \
  && chown -R bun:bun /app/uploads

# Drop to non-root user provided by the base image
USER bun

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# RUN_DB_MIGRATIONS=true runs migrate → backfill-project-keys → migrate (see docker-entrypoint.sh).
ENTRYPOINT ["./docker-entrypoint.sh"]
