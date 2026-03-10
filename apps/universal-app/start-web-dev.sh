#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo -e "${BLUE}🚀 WonderTales — Web Dev (Nginx + Docker + Metro)${NC}\n"

# ── 1. Docker ────────────────────────────────────────────────────────────────
echo -e "${BLUE}🐳 Перевірка Docker...${NC}"
if ! docker info >/dev/null 2>&1; then
  echo -e "${RED}❌ Docker не запущений. Запустіть Docker Desktop та спробуйте знову.${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Docker працює${NC}"

# ── 2. Build shared package ──────────────────────────────────────────────────
echo -e "\n${BLUE}📦 Збірка @wondertales/shared...${NC}"
cd "$REPO_ROOT"
pnpm --filter @wondertales/shared build 2>&1
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Помилка збірки shared пакету${NC}"
  exit 1
fi
echo -e "${GREEN}✅ @wondertales/shared зібрано${NC}"

# ── 3. Docker services (includes api restart to pick up new shared dist) ─────
echo -e "\n${BLUE}🐳 Запуск Docker-сервісів (postgres, redis, api, nginx)...${NC}"
docker compose -f "$REPO_ROOT/docker-compose.dev.yml" up -d --remove-orphans
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Помилка запуску Docker-сервісів${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Docker-сервіси запущено${NC}"

# ── 4. Wait for API ──────────────────────────────────────────────────────────
echo -e "\n${BLUE}⏳ Очікування API (порт 3000)...${NC}"
MAX_WAIT=60
WAITED=0
while ! curl -s http://localhost:3000/health >/dev/null 2>&1; do
  if [ $WAITED -ge $MAX_WAIT ]; then
    echo -e "${RED}❌ API не відповів за ${MAX_WAIT}с. Перевірте логи:${NC}"
    echo -e "  docker compose -f $REPO_ROOT/docker-compose.dev.yml logs api --tail=50"
    exit 1
  fi
  sleep 2
  WAITED=$((WAITED + 2))
  echo -e "  ...${WAITED}с"
done
echo -e "${GREEN}✅ API доступний${NC}"

# ── 5. Free port 8082 ────────────────────────────────────────────────────────
echo -e "\n${BLUE}🔍 Перевірка порту 8082 (Metro)...${NC}"
PORT_8082=$(lsof -ti:8082)
if [ -n "$PORT_8082" ]; then
  echo -e "${YELLOW}⚠️  Порт 8082 зайнятий (PID: $PORT_8082), зупиняю...${NC}"
  kill -9 $PORT_8082 2>/dev/null
  sleep 1
fi
echo -e "${GREEN}✅ Порт 8082 вільний${NC}"

# ── 6. Metro bundler ─────────────────────────────────────────────────────────
echo -e "\n${BLUE}📦 Запуск Metro bundler на порту 8082...${NC}"
cd "$SCRIPT_DIR"
BROWSER=none EXPO_DEVTOOLS_LISTEN_ADDRESS=localhost node "$REPO_ROOT/node_modules/expo/bin/cli" start --web --port 8082 2>&1 | while IFS= read -r line; do
  echo -e "${YELLOW}[METRO]${NC} $line"
done &
METRO_PID=$!

# ── 7. Wait for Metro + open browser ────────────────────────────────────────
echo -e "\n${BLUE}⏳ Очікування Metro bundler...${NC}"
MAX_WAIT=60
WAITED=0
while ! curl -s http://localhost:8082 >/dev/null 2>&1; do
  if [ $WAITED -ge $MAX_WAIT ]; then
    echo -e "${YELLOW}⚠️  Metro не відповів за ${MAX_WAIT}с, відкриваємо браузер без очікування${NC}"
    break
  fi
  sleep 2
  WAITED=$((WAITED + 2))
  echo -e "  ...${WAITED}с"
done
echo -e "${GREEN}✅ Metro готовий, відкриваємо браузер...${NC}"
open http://localhost:8081

# ── 8. Cleanup ───────────────────────────────────────────────────────────────
cleanup() {
  echo -e "\n${BLUE}🛑 Зупинка Metro...${NC}"
  kill $METRO_PID 2>/dev/null
  pkill -P $METRO_PID 2>/dev/null

  echo -e "${YELLOW}Зупинити Docker-сервіси теж? [y/N]${NC} "
  read -r answer
  if [[ "$answer" =~ ^[Yy]$ ]]; then
    docker compose -f "$REPO_ROOT/docker-compose.dev.yml" stop
    echo -e "${GREEN}✅ Docker-сервіси зупинено${NC}"
  fi
  echo -e "${GREEN}✅ Готово${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM

echo -e "\n${GREEN}✅ Все запущено!${NC}"
echo -e "  ${GREEN}🌐 Web app:${NC}  http://localhost:8081"
echo -e "  ${GREEN}🔌 API:${NC}      http://localhost:3000"
echo -e "  ${GREEN}📦 Metro:${NC}    http://localhost:8082"
echo -e "  ${GREEN}🛠  Adminer:${NC}  http://localhost:8083\n"
echo -e "Натисніть ${RED}Ctrl+C${NC} для зупинки\n"

wait
