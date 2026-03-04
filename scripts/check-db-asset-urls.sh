#!/bin/bash

# Check how asset URLs are stored in production database
# Usage: ssh root@167.172.102.75 "cd /var/www/kazka && ./scripts/check-db-asset-urls.sh"

set -e
cd "$(dirname "$0")/.."

# Load env (on droplet)
[ -f .env.production ] && set -a && source .env.production && set +a

PG_USER="${POSTGRES_USER:-kazka}"
PG_DB="${POSTGRES_DB:-kazka_prod}"

echo "🔍 Asset URLs in DB (PG user: $PG_USER, db: $PG_DB)"
echo ""

echo "1. Sample URLs from characters.reference_photos:"
docker exec wondertales-postgres-prod psql -U "$PG_USER" -d "$PG_DB" -t -c "
  SELECT reference_photos->0->>'url' as url
  FROM characters 
  WHERE reference_photos IS NOT NULL AND jsonb_array_length(reference_photos) > 0 
  LIMIT 5;
"

echo ""
echo "2. Count with localhost in URL:"
docker exec wondertales-postgres-prod psql -U "$PG_USER" -d "$PG_DB" -t -c "
  SELECT COUNT(*) as localhost_count FROM characters 
  WHERE reference_photos IS NOT NULL AND reference_photos::text LIKE '%localhost%';
"

echo ""
echo "3. Count with relative path (/api/v1/assets/):"
docker exec wondertales-postgres-prod psql -U "$PG_USER" -d "$PG_DB" -t -c "
  SELECT COUNT(*) as relative_count FROM characters 
  WHERE reference_photos IS NOT NULL AND reference_photos::text LIKE '%/api/v1/assets/%';
"
