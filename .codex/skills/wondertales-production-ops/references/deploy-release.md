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

- no args: deploy API, webapp, migrations, story artifact images, and outfit assets
- `--api`: API plus migrations, story artifact images, and outfit assets
- `--web`: webapp only
- `--artifacts`: story artifact catalog images only
- `--outfits`: pregenerated outfit plate assets only
- `--nginx`: legacy nginx handoff/config validation only
- `--migrate`: migrations only, no rebuild/redeploy

The script uses SSH multiplexing and opens the first connection with `BatchMode=no` so the operator can enter an SSH key passphrase or server password.

## Full Deploy Sequence

At a high level, `scripts/deploy.sh --api --web`:

1. Opens SSH to `root@167.172.102.75`.
2. Builds `kazka-api:latest` locally for `linux/amd64` and saves it to `/tmp/kazka-api.tar.gz`.
3. Checks remote capacity for the compressed tarball, loaded image, and 2 GB runtime reserve; if needed, removes dangling images without stopping the current API.
4. Sets runtime ops mode to `draining`, expires stale requests, and waits for active generation jobs to drain.
5. Uploads the image to `/var/www/kazka`.
6. Uploads `.env.production`, preserving remote `WEB_BUILD_ID` if the local file lacks it.
7. Uploads Google service account JSON when `GOOGLE_APPLICATION_CREDENTIALS` is configured.
8. Uploads `docker-compose.prod.yml`.
9. Loads the API image on the droplet and runs `docker compose -f docker-compose.prod.yml up -d api`.
10. Syncs localized voice samples, story artifact catalog images, and pregenerated outfit plates into the API uploads volume.
11. Syncs and validates nginx config, then stops legacy `wondertales-nginx`.
12. Waits for the API container to become healthy.
13. Runs SQL migrations inside `wondertales-api-prod` with `npx tsx src/scripts/runAllMigrations.ts`.
14. Starts the `worker` container.
15. Restores ops mode to `normal`.
16. Removes dangling images left by replacing `kazka-api:latest` and verifies at least 2 GB remains free.
17. Builds the webapp locally, uploads `dist`, updates `WEB_BUILD_ID`, recreates `api` and `webapp`, then restarts `shared-nginx-proxy` if present.
18. Prints `docker compose ps` and public URLs.

The deploy also sends best-effort Telegram notifications at start and completion. The start message includes the deployment id, selected components, Git revision/worktree state, and drain mode. The completion message reports success or failure, duration, and the failed step when applicable. Credentials are read on the droplet from `/etc/wondertales/ops-alert.env` or `/etc/wondertales/deploy-alert.env`, using `DEPLOY_ALERT_TELEGRAM_*`, `OPS_ALERT_TELEGRAM_*`, or the generic `TELEGRAM_*` fallback variables. Telegram delivery failures are logged but do not abort the deployment. Set `DEPLOY_TELEGRAM_ENABLED=false` to skip notifications or `DEPLOY_TELEGRAM_DRY_RUN=true` to print them without sending.

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
- Before uploading the image tarball, the deploy reserves enough space for the compressed tarball, the loaded image, and 2 GB of runtime headroom. If necessary it prunes only dangling images; if space is still insufficient, it aborts without stopping the running API.
- After a successful API deploy and migrations, it always runs `docker image prune -f`. This removes superseded untagged API images while preserving running containers, tagged images, and all volumes.
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
