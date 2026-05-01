# Postgres healthcheck log noise

Date: 2026-05-01

## What changed

- Checked Docker logs after the orphan cleanup scheduler batch.
- Found repeated Postgres messages: `database "kazka" does not exist`.
- Updated Postgres healthchecks in `docker-compose.yml`, `docker-compose.dev.yml`, and `docker-compose.prod.yml` to pass the configured database with `pg_isready -d`.

## Why

- `pg_isready -U kazka` defaults the database name to the user name.
- The configured development database is `kazka_dev`, so the healthcheck succeeded at the service level but still produced repeated misleading FATAL logs.
- Production compose had the same pattern and could produce equivalent noise when `POSTGRES_USER` and `POSTGRES_DB` differ.

## Verification

- Static compose inspection confirms all Postgres healthchecks now include `-d`.
- The already-running dev Postgres container still had the old embedded healthcheck command, so it was recreated on the existing named volume with `docker compose -f docker-compose.dev.yml up -d --no-deps --force-recreate postgres`.
- Fresh Docker logs after the recreate no longer show the repeated `database "kazka" does not exist` healthcheck noise.
