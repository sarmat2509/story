# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/universal-app/package.json ./apps/universal-app/

# Install dependencies
RUN pnpm install --frozen-lockfile --filter universal-app --filter @kazka/shared

# Copy source files
COPY packages/shared ./packages/shared
COPY apps/universal-app ./apps/universal-app

# Build shared package
WORKDIR /app/packages/shared
RUN pnpm build

# Build web app
WORKDIR /app/apps/universal-app
RUN pnpm build:web

# Production stage - serve with nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/apps/universal-app/web-build /usr/share/nginx/html

# Copy custom nginx config
COPY apps/universal-app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
