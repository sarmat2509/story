#!/bin/bash
# Run a single SQL migration via runMigration.ts
# Usage:
#   pnpm run migrate 0055_story_ratings.sql     # via Docker (dev)
#   ./scripts/runMigration.sh 0055_story_ratings.sql
#   ./scripts/runMigration.sh 0055_story_ratings.sql --local  # local (needs DATABASE_URL)

set -e

cd "$(dirname "$0")/.."

MIGRATION_FILE="${1:?Usage: pnpm run migrate <migration.sql>}"

if [[ "$2" == "--local" ]]; then
  echo "🔄 Running migration locally..."
  cd services/api
  pnpm exec tsx src/scripts/runMigration.ts "$MIGRATION_FILE"
else
  echo "🔄 Running migration via Docker..."
  docker compose -f docker-compose.dev.yml run --rm --entrypoint="" api sh -c "cd /app/services/api && pnpm exec tsx src/scripts/runMigration.ts $MIGRATION_FILE"
fi
echo "✅ Done"
