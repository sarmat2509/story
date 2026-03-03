#!/bin/bash
# Run all pending SQL migrations (tracks applied ones in schema_migrations table)
# Usage: ./scripts/run-all-migrations.sh
# On droplet: docker exec wondertales-api-prod sh -c 'cd /app/services/api && pnpm db:migrate:all'

set -e

cd "$(dirname "$0")/.."

echo "🔄 Running pending SQL migrations..."
cd services/api
pnpm db:migrate:all
echo "✅ Done"
