# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy package.json files
COPY packages/shared/package.json ./packages/shared/package.json
COPY services/api/package.json ./services/api/package.json

# Install all dependencies (workspace style)
RUN pnpm install --frozen-lockfile --filter @kazka/shared --filter api

# Copy TypeScript configs
COPY tsconfig.base.json ./
COPY packages/shared/tsconfig.json ./packages/shared/
COPY services/api/tsconfig.json ./services/api/

# Copy source code
COPY packages/shared/src ./packages/shared/src
COPY services/api/src ./services/api/src
COPY services/api/drizzle ./services/api/drizzle
COPY services/api/drizzle.config.ts ./services/api/

# Build shared package
WORKDIR /app/packages/shared
RUN pnpm build

# Build API
WORKDIR /app/services/api
RUN pnpm build

# Production stage
FROM node:20-alpine

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

# Copy migrations
COPY services/api/drizzle ./services/api/drizzle
COPY services/api/drizzle.config.ts ./services/api/

WORKDIR /app/services/api

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
