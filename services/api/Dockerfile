# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY services/api/package.json ./services/api/
COPY packages/shared/package.json ./packages/shared/

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY services/api ./services/api
COPY packages/shared ./packages/shared

# Build
WORKDIR /app/services/api
RUN pnpm build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install ffmpeg (required for audio processing)
RUN apk add --no-cache ffmpeg

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY services/api/package.json ./services/api/
COPY packages/shared/package.json ./packages/shared/

# Install pnpm and production dependencies
RUN npm install -g pnpm && \
    pnpm install --prod --frozen-lockfile

# Copy built files
COPY --from=builder /app/services/api/dist ./services/api/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Copy migrations
COPY services/api/drizzle ./services/api/drizzle

WORKDIR /app/services/api

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
