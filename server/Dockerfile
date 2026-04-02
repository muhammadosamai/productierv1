FROM oven/bun:latest
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production
COPY . .

EXPOSE 3001
CMD ["sh", "-c", "if [ \"${RUN_DB_MIGRATIONS:-false}\" = \"true\" ]; then bun run ${MIGRATION_COMMAND:-db:migrate}; fi; exec bun src/index.ts"]
