#!/bin/bash

# View API logs on production droplet
# Usage: ./scripts/view-logs.sh [OPTIONS]

DROPLET_IP="167.172.102.75"
DROPLET_USER="root"
DROPLET_PATH="/var/www/kazka"
COMPOSE_FILE="docker-compose.prod.yml"

# Default options
TAIL=100
FOLLOW=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -f|--follow)
      FOLLOW=true
      shift
      ;;
    -n|--tail)
      TAIL="$2"
      shift 2
      ;;
    -e|--errors)
      FILTER="| grep -i error"
      shift
      ;;
    -h|--help)
      echo "Usage: ./scripts/view-logs.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  -f, --follow           Follow logs in real-time (Ctrl+C to exit)"
      echo "  -n, --tail N           Show last N lines (default: 100)"
      echo "  -e, --errors           Show only errors"
      echo "  -h, --help             Show this help"
      echo ""
      echo "Examples:"
      echo "  ./scripts/view-logs.sh                    # Last 100 lines"
      echo "  ./scripts/view-logs.sh -f                 # Follow logs"
      echo "  ./scripts/view-logs.sh -n 200             # Last 200 lines"
      echo "  ./scripts/view-logs.sh -f -n 50           # Follow last 50 lines"
      echo "  ./scripts/view-logs.sh -e                 # Show only errors"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Build command
if [ "$FOLLOW" = true ]; then
  CMD="docker compose -f ${COMPOSE_FILE} logs api -f --tail ${TAIL}"
else
  CMD="docker compose -f ${COMPOSE_FILE} logs api --tail ${TAIL}"
fi

if [ -n "$FILTER" ]; then
  CMD="${CMD} ${FILTER}"
fi

# Execute
echo "🔍 Viewing API logs on production droplet..."
if [ "$FOLLOW" = true ]; then
  echo "📡 Following logs (Ctrl+C to exit)..."
else
  echo "📋 Last ${TAIL} lines..."
fi
echo ""

ssh ${DROPLET_USER}@${DROPLET_IP} "cd ${DROPLET_PATH} && ${CMD}"
