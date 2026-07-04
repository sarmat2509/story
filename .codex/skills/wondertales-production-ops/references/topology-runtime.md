# Production Topology and Runtime

## Contents

- Location
- Compose Services
- Public Routing
- Environment and Secrets
- Production Files To Inspect

## Location

Production is hosted on a DigitalOcean droplet:

- SSH target: `root@167.172.102.75`
- Project directory on the droplet: `/var/www/kazka`
- Public origin: `https://wondertales.art`
- Compose file on local and remote: `docker-compose.prod.yml`

Most production scripts default to these values through `DROPLET_IP`, `DROPLET_USER`, and `DROPLET_PATH`. Some scripts allow env overrides; `scripts/deploy.sh` hard-codes the current production target.

## Compose Services

Source of truth: `docker-compose.prod.yml`.

- `postgres`
  - container: `wondertales-postgres-prod`
  - image: `postgres:15-alpine`
  - host bind: `127.0.0.1:5432:5432`
  - volumes: `postgres_data:/var/lib/postgresql/data`, `./backups:/backups`
  - healthcheck: `pg_isready`
- `redis`
  - container: `wondertales-redis-prod`
  - image: `redis:7-alpine`
  - no public port
- `api`
  - container: `wondertales-api-prod`
  - image: `kazka-api:latest`
  - build target: `services/api/Dockerfile` `production`
  - host bind: `127.0.0.1:3000:3000`
  - `RUN_JOB_WORKERS=false`
  - volumes: `api_uploads`, `api_logs`, `./image-prompt-debug`, `./secrets:/app/secrets:ro`
  - healthcheck: `http://127.0.0.1:3000/health`
- `worker`
  - container: `wondertales-worker-prod`
  - same image as API
  - command: `pnpm start:worker`
  - `RUN_HTTP_SERVER=false`, `RUN_JOB_WORKERS=true`
  - `stop_grace_period: 15m`
- `webapp`
  - container: `wondertales-webapp-prod`
  - image: `nginx:alpine`
  - host bind: `8080:80`
  - serves `./apps/universal-app/dist`
  - nginx config: `apps/universal-app/nginx.conf`
- `nginx`
  - container: `wondertales-nginx`
  - legacy story nginx container; current scripts treat `shared-nginx-proxy` as public ingress
  - `expose` only, no host `80`/`443` publish in current compose
  - config source: `nginx/nginx.conf`, `nginx/conf.d`, `nginx/includes`, certbot mounts

## Public Routing

Main routing config: `nginx/conf.d/kazka.conf`.

The config defines:

- `api_backend`: `api:3000`
- `webapp_backend`: `webapp:80`
- `wondertales.art` and `www.wondertales.art`
- HTTP to HTTPS redirect
- `www` to apex redirect
- ACME challenge path under `/.well-known/acme-challenge/`
- API routes: `/api/`, `/api/v1/assets/`, `/health`
- API SSR routes: `/`, `/pricing`, `/blog`, `/stories`, `/authors/`, `/u/`, localized SEO routes
- SPA/noindex routes: auth, dashboard, admin, profile, children, child-mode, billing, story app surfaces
- Static app routes/assets proxy to `webapp_backend`
- Unknown public routes return `404` instead of becoming soft-404 SPA pages

The deploy scripts validate story nginx config but stop the legacy `wondertales-nginx` container because `shared-nginx-proxy` owns public ingress. If a task asks about the live public proxy itself, inspect the proxy deployment on the droplet, usually under `/var/www/proxy`; that repo is outside this story workspace.

## Environment and Secrets

Production environment file: `.env.production`.

Rules:

- Do not print secret values from `.env.production`.
- Use `awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{print $1}' .env.production | sort` if only key names are needed.
- Use `scripts/check-production-ops.sh`; it checks env presence and redacts secrets.
- `docker-compose.prod.yml` injects `DATABASE_URL` from `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`; it also loads `.env.production`.

Google service account handling:

- `GOOGLE_APPLICATION_CREDENTIALS` in `.env.production` must point inside `/app/secrets/...`.
- `scripts/deploy.sh` looks for a local file in `services/api/<basename>` and uploads it to `/var/www/kazka/secrets/<basename>`.

`EXPO_PUBLIC_*` values are build-time public app env. `scripts/deploy.sh` exports them from `.env.production` before building the web bundle.

## Production Files To Inspect

Start here:

- `docker-compose.prod.yml`
- `scripts/deploy.sh`
- `scripts/check-production-ops.sh`
- `scripts/check-production-smoke.sh`
- `scripts/run-production-backup-retention.sh`
- `docs/runbooks/production-operations.md`

Useful supporting files:

- `services/api/Dockerfile`
- `apps/universal-app/nginx.conf`
- `nginx/nginx.conf`
- `nginx/conf.d/kazka.conf`
- `nginx/includes/spa-proxy-prod.conf`
- `scripts/sync-shared-proxy-handoff.sh`
- `scripts/certbot-issue-remote.sh`
