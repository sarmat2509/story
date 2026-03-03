#!/bin/bash
# Run all pending SQL migrations (tracks applied ones in schema_migrations table)
# Usage:
#   ./scripts/run-all-migrations.sh          # local (needs DATABASE_URL with localhost)
#   ./scripts/run-all-migrations.sh --docker # droplet: runs inside api container (requires rebuild)
#   ./scripts/run-all-migrations.sh --host  # droplet: runs on host, connects to postgres via localhost:5432

set -e

cd "$(dirname "$0")/.."

if [[ "$1" == "--docker" ]]; then
  echo "🔄 Running migrations inside API container..."
  docker compose -f docker-compose.prod.yml exec api sh -c 'cd /app/services/api && npx tsx src/scripts/runAllMigrations.ts'
elif [[ "$1" == "--host" ]]; then
  shift
  echo "🔄 Running migrations from host (postgres via localhost:5432)..."
  if [[ -f .env.production ]]; then
    export DATABASE_URL=$(grep '^DATABASE_URL=' .env.production | cut -d= -f2- | sed 's/postgres:5432/localhost:5432/')
  fi
  cd services/api
  npx tsx src/scripts/runAllMigrations.ts "$@"
else
  echo "🔄 Running pending SQL migrations..."
  cd services/api
  npx tsx src/scripts/runAllMigrations.ts
fi
echo "✅ Done"
