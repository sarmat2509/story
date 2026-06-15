# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY patches ./patches

# Copy package.json files
COPY packages/shared/package.json ./packages/shared/package.json
COPY services/api/package.json ./services/api/package.json

# Install all dependencies (workspace style) with cache mount for speed
# Skip postinstall scripts as ffmpeg is already installed via apk
# NODE_OPTIONS limits heap to avoid OOM on 1GB droplets
ENV NODE_OPTIONS="--max-old-space-size=512"
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --no-frozen-lockfile --filter @wondertales/shared --filter wondertales-api --ignore-scripts

# Copy TypeScript configs
COPY tsconfig.base.json ./
COPY packages/shared/tsconfig.json ./packages/shared/
COPY services/api/tsconfig.json ./services/api/

# Copy source code (separate layers for better caching)
COPY packages/shared/src ./packages/shared/src

# Build shared package with esbuild (fast)
WORKDIR /app/packages/shared
RUN pnpm run build:fast

# Copy API source AFTER shared is built (better layer caching)
WORKDIR /app
COPY services/api/src ./services/api/src
COPY services/api/drizzle ./services/api/drizzle
COPY services/api/drizzle.config.ts ./services/api/

# Build API with esbuild (fast, no type checking, parallel mode)
WORKDIR /app/services/api
RUN pnpm run build:fast

# Development stage (hot reload with source mounted)
FROM node:20-alpine AS development

WORKDIR /app

# Install ffmpeg, postgresql-client, and pnpm
RUN apk add --no-cache ffmpeg postgresql-client && \
    npm install -g pnpm

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY patches ./patches

# Copy package.json files
COPY packages/shared/package.json ./packages/shared/package.json
COPY services/api/package.json ./services/api/package.json

# Install all dependencies
RUN pnpm install --no-frozen-lockfile --filter @wondertales/shared --filter wondertales-api --ignore-scripts

# Copy TypeScript configs
COPY tsconfig.base.json ./
COPY packages/shared/tsconfig.json ./packages/shared/
COPY services/api/tsconfig.json ./services/api/

# Copy drizzle config and migrations
COPY services/api/drizzle ./services/api/drizzle
COPY services/api/drizzle.config.ts ./services/api/

WORKDIR /app/services/api

ENV NODE_ENV=development
EXPOSE 3000

# Source code is mounted via volumes for hot reload
CMD ["pnpm", "dev"]

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install ffmpeg and postgresql-client
RUN apk add --no-cache ffmpeg postgresql-client

# Install pnpm
RUN npm install -g pnpm

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/services/api/node_modules ./services/api/node_modules

# Copy built files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/services/api/dist ./services/api/dist

# Copy package.json files (needed for module resolution)
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/services/api/package.json ./services/api/

# Copy migrations and schema (needed for drizzle-kit)
COPY services/api/drizzle ./services/api/drizzle
COPY services/api/drizzle.config.ts ./services/api/
COPY services/api/src/db ./services/api/src/db
COPY services/api/src/scripts ./services/api/src/scripts
COPY services/api/src/config ./services/api/src/config
COPY services/api/src/utils ./services/api/src/utils
COPY services/api/src/legal ./services/api/legal
COPY services/api/src/services/assetStorageService.ts ./services/api/src/services/assetStorageService.ts

WORKDIR /app/services/api

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
