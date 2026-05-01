# Dev Nginx Metro IPv4 Resolver

## What Changed

- Removed the dev `metro_backend` upstream that resolved `host.docker.internal` through `/etc/hosts`.
- Added a dev nginx Docker DNS resolver with `ipv6=off`.
- Routed SPA/Metro proxy locations through `$metro_backend_url` so nginx resolves the host-side Metro server over IPv4.

## Why

Docker Desktop exposes `host.docker.internal` as both IPv4 and IPv6 inside the nginx container. The IPv6 address is not reachable from this container, so every Metro asset request logged a noisy `connect() ... Network unreachable` warning before retrying successfully over IPv4.

## Verification

- `docker compose -f docker-compose.dev.yml exec -T nginx nginx -t`
- `docker compose -f docker-compose.dev.yml exec -T nginx nginx -s reload`
- `curl -I http://localhost:8081/billing/plans`
- `curl 'http://localhost:8081/apps/universal-app/index.bundle?...'`
- `docker compose -f docker-compose.dev.yml logs --since=1m nginx`

After reload, the Metro bundle request returned `200` without new IPv6 upstream errors.
