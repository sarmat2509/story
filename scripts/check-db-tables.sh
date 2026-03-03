#!/bin/bash
# Check if required tables exist in production DB
# Usage:
#   On droplet: ./scripts/check-db-tables.sh
#   Or: docker compose -f docker-compose.prod.yml exec postgres psql -U kazka -d kazka_prod -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('story_goals','scenario_cards','translations','scenario_world_rules','scenario_plot_examples') ORDER BY 1;"

set -e

cd "$(dirname "$0")/.."

echo "Checking tables (story_goals, scenario_cards, translations, scenario_world_rules, scenario_plot_examples)..."
docker compose -f docker-compose.prod.yml exec postgres psql -U kazka -d kazka_prod -tAc "
SELECT 
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='story_goals') THEN '✅ story_goals' ELSE '❌ story_goals' END
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='scenario_cards') THEN '✅ scenario_cards' ELSE '❌ scenario_cards' END
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='translations') THEN '✅ translations' ELSE '❌ translations' END
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='scenario_world_rules') THEN '✅ scenario_world_rules' ELSE '❌ scenario_world_rules' END
UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='scenario_plot_examples') THEN '✅ scenario_plot_examples' ELSE '❌ scenario_plot_examples' END;
"
