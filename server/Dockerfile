FROM oven/bun:latest
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production
COPY . .
EXPOSE 3001
CMD ["bun", "src/index.ts"]
