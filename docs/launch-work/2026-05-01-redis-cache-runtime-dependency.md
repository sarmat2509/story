# Redis cache runtime dependency

## What changed

- Added `ioredis` to `wondertales-api` dependencies.
- Rebuilt and recreated the dev API container so its image-owned `node_modules` includes the Redis client.
- Verified the API container can resolve `ioredis` at runtime.

## Why

The public story SSR cache already uses `getRedisClient()` with a dynamic `import('ioredis')`, but the API package did not declare `ioredis` as a dependency. Docker logs showed `Redis init failed, cache disabled` on the first SSR story request.

## Checks

- `pnpm --filter wondertales-api build`
- `docker compose -f docker-compose.dev.yml up -d --build api`
- `docker exec wondertales-api-dev sh -lc "node -e \"console.log(require.resolve('ioredis'))\""`
- `curl -sSI http://localhost:8081/stories/el-pergamino-danzante-y-el-banquete-de-las-sorpresas`
- Docker logs after the SSR request showed `Redis client initialized` and no `Cannot find module 'ioredis'` warning.
