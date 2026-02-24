#!/bin/bash
# Run all database migrations

set -a
source .env
set +a

echo "Running database migrations..."

cd services/api

# Push schema changes
pnpm db:push

# Run triggers
psql $DATABASE_URL -f drizzle/add_updated_at_triggers.sql

echo "Migrations completed!"
