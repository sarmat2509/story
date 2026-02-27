#!/bin/bash

# Development environment management script
# Usage: ./scripts/dev.sh [start|stop|restart|logs|build|clean]

set -e

COMPOSE_FILE="docker-compose.dev.yml"
PROJECT_NAME="kazka-dev"

case "$1" in
  start)
    echo "🚀 Starting development environment..."
    docker compose -f $COMPOSE_FILE up -d
    echo "✅ Services started!"
    echo ""
    echo "Available services:"
    echo "  - API (Nginx):     http://localhost:8001/api/v1"
    echo "  - API (Direct):    http://localhost:3000/api/v1"
    echo "  - Adminer (DB UI): http://localhost:8083"
    echo "  - PostgreSQL:      localhost:5432"
    echo ""
    echo "Run './scripts/dev.sh logs' to see logs"
    ;;

  stop)
    echo "🛑 Stopping development environment..."
    docker compose -f $COMPOSE_FILE down
    echo "✅ Services stopped!"
    ;;

  restart)
    echo "🔄 Restarting development environment..."
    docker compose -f $COMPOSE_FILE restart
    echo "✅ Services restarted!"
    ;;

  logs)
    SERVICE=${2:-""}
    if [ -z "$SERVICE" ]; then
      docker compose -f $COMPOSE_FILE logs -f
    else
      docker compose -f $COMPOSE_FILE logs -f $SERVICE
    fi
    ;;

  build)
    echo "🔨 Building images..."
    docker compose -f $COMPOSE_FILE build
    echo "✅ Images built!"
    ;;

  clean)
    echo "🧹 Cleaning up development environment..."
    docker compose -f $COMPOSE_FILE down -v
    echo "✅ Volumes removed!"
    ;;

  status)
    docker compose -f $COMPOSE_FILE ps
    ;;

  shell)
    SERVICE=${2:-api}
    echo "🐚 Opening shell in $SERVICE container..."
    docker compose -f $COMPOSE_FILE exec $SERVICE sh
    ;;

  db)
    echo "🗄️  Opening PostgreSQL shell..."
    docker compose -f $COMPOSE_FILE exec postgres psql -U kazka -d kazka_dev
    ;;

  migrate)
    echo "📊 Running database migrations..."
    docker compose -f $COMPOSE_FILE exec api sh -c 'cd services/api && npx drizzle-kit push:pg'
    echo "✅ Migrations applied!"
    ;;

  *)
    echo "Usage: $0 {start|stop|restart|logs|build|clean|status|shell|db|migrate}"
    echo ""
    echo "Commands:"
    echo "  start    - Start all services"
    echo "  stop     - Stop all services"
    echo "  restart  - Restart all services"
    echo "  logs     - Show logs (optional: specify service name)"
    echo "  build    - Rebuild Docker images"
    echo "  clean    - Stop and remove all volumes"
    echo "  status   - Show service status"
    echo "  shell    - Open shell in container (default: api)"
    echo "  db       - Open PostgreSQL shell"
    echo "  migrate  - Run database migrations"
    echo ""
    echo "Examples:"
    echo "  $0 start"
    echo "  $0 logs api"
    echo "  $0 shell nginx"
    exit 1
    ;;
esac
