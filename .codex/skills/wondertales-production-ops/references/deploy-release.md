# Production Deploy and Release Flow

## Contents

- Primary Deploy Path
- Full Deploy Sequence
- API Deploy Details
- Web Deploy Details
- Nginx and Shared Proxy
- Partial and Legacy Helpers
- Rollback

## Primary Deploy Path

Use `scripts/deploy.sh` as the default production deploy path.

Common commands:

```bash
pnpm launch:gate
./scripts/deploy.sh --api --web
```

Flags:

- no args: deploy API, webapp, migrations, and outfit assets
- `--api`: API plus migrations and outfit assets
- `--web`: webapp only
- `--outfits`: pregenerated outfit plate assets only
- `--nginx`: legacy nginx handoff/config validation only
- `--migrate`: migrations only, no rebuild/redeploy

The script uses SSH multiplexing and opens the first connection with `BatchMode=no` so the operator can enter an SSH key passphrase or server password.

## Full Deploy Sequence

At a high level, `scripts/deploy.sh --api --web`:

1. Opens SSH to `root@167.172.102.75`.
2. For API deploys, sets runtime ops mode to `draining`, expires stale requests, and waits for active generation jobs to drain.
3. Builds `kazka-api:latest` locally for `linux/amd64`.
4. Saves the image to `/tmp/kazka-api.tar.gz` and uploads it to `/var/www/kazka`.
5. Uploads `.env.production`, preserving remote `WEB_BUILD_ID` if the local file lacks it.
6. Uploads Google service account JSON when `GOOGLE_APPLICATION_CREDENTIALS` is configured.
7. Uploads `docker-compose.prod.yml`.
8. Loads the API image on the droplet and runs `docker compose -f docker-compose.prod.yml up -d api`.
9. Syncs localized voice samples and pregenerated outfit plates into the API uploads volume.
10. Syncs and validates nginx config, then stops legacy `wondertales-nginx`.
11. Waits for the API container to become healthy.
12. Runs SQL migrations inside `wondertales-api-prod` with `npx tsx src/scripts/runAllMigrations.ts`.
13. Starts the `worker` container.
14. Restores ops mode to `normal`.
15. Builds the webapp locally, uploads `dist`, updates `WEB_BUILD_ID`, recreates `api` and `webapp`, then restarts `shared-nginx-proxy` if present.
16. Prints `docker compose ps` and public URLs.

## API Deploy Details

API build source:

- Dockerfile: `services/api/Dockerfile`
- target: `production`
- image: `kazka-api:latest`
- platform: `linux/amd64`

Important behavior:

- Local Docker build avoids OOM on small droplets.
- `services/api/Dockerfile` production stage bundles `dist`, migrations, selected `src/scripts`, config/utils/legal assets, and API assets needed at runtime.
- `scripts/check-api-production-assets.sh` guards production bundling assumptions.
- Disk cleanup can stop/remove old API images when droplet free space is low.
- Migrations run after the new API image is healthy. If API is not running during `--migrate`, the script skips predeploy migrations and relies on postdeploy migration when API is deployed.

Drain behavior:

- `wait_for_generation_drain` sets ops mode to `draining` with a short maintenance message.
- It calls `expireStaleStoryRequests.js` if present.
- It waits via `waitForGenerationDrain.js`.
- Use `SKIP_DEPLOY_DRAIN=true` only when intentionally accepting recovery/retry behavior.

Google credentials:

- `.env.production` `GOOGLE_APPLICATION_CREDENTIALS` must be `/app/secrets/<file>.json`.
- The local source file is expected at `services/api/<file>.json`.
- The deploy uploads it to `/var/www/kazka/secrets/<file>.json` with restrictive permissions.

## Web Deploy Details

Web build source:

- app: `apps/universal-app`
- build command inside deploy: `pnpm build:web:clean`
- serving config: `apps/universal-app/nginx.conf`

Important behavior:

- `EXPO_PUBLIC_API_BASE_URL` is set to `https://wondertales.art`.
- `EXPO_PUBLIC_*` values are exported from `.env.production`.
- The deploy clears `.expo` and `node_modules/.cache`.
- The built output must not contain `kazka://`.
- The built output must contain `wondertales://`.
- The Expo bundle is content-fingerprinted and copied to `/static/js/bundle.js` for SSR compatibility.
- `WEB_BUILD_ID` is written into remote `.env.production` so API SSR can reference the deployed bundle.
- Remote extraction replaces `/var/www/kazka/apps/universal-app/dist` and refreshes the `dist` symlink if present.
- The deploy recreates `api` and `webapp` after web upload so SSR and SPA assets agree.

## Nginx and Shared Proxy

`sync_nginx_config` uploads:

- `docker-compose.prod.yml`
- `nginx/nginx.conf`
- `nginx/conf.d`
- `nginx/includes`
- `apps/universal-app/nginx.conf`

It validates config in a temporary `nginx:alpine` container using mounted certbot files. It requires:

- `/var/www/kazka/certbot/conf/live/wondertales.art/fullchain.pem`
- `/var/www/kazka/certbot/conf/live/wondertales.art/privkey.pem`

The script then stops legacy `wondertales-nginx` and prints that live public nginx should be deployed from `/var/www/proxy` with the proxy repo. `restart_shared_proxy_if_present` restarts `shared-nginx-proxy` when that container exists.

For certificate issuance:

```bash
CERTBOT_EMAIL=you@example.com ./scripts/certbot-issue-remote.sh
CERTBOT_EMAIL=you@example.com ./scripts/certbot-issue-remote.sh --staging
```

## Partial and Legacy Helpers

Default to `scripts/deploy.sh`.

Use these only when the task explicitly calls for their narrower behavior:

- `scripts/deploy-webapp.sh`: older web-only deploy path; builds local webapp, syncs nginx, updates `WEB_BUILD_ID`, recreates `api` and `webapp`.
- `scripts/deploy-api-local.sh`: older local API image build/upload path; does not include the full current drain/migration/web consistency sequence.
- `scripts/deploy-api.sh`: older droplet-side `git pull` and build path; can miss current local-build and drain safeguards.
- `scripts/hotfix-api.sh`: copies one built `dist/index.js` into the running API container; emergency-only and bypasses normal image/migration discipline.
- `scripts/sync-shared-proxy-handoff.sh`: syncs compose/nginx handoff config and validates that the story compose file does not publish host `80`/`443`.

## Rollback

For code-only regressions:

1. Identify the last good commit.
2. Check out that commit locally.
3. Run `pnpm launch:gate`.
4. Redeploy with `./scripts/deploy.sh --api --web`.
5. Re-run production smoke and ops checks.

After migrations:

- Prefer a forward fix migration.
- Do not run destructive SQL manually.
- Restore from backup only with explicit operator approval and an incident timeline.
