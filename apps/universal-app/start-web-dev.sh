#!/bin/bash

# Кольори для виводу
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Запуск Web Development з Proxy${NC}\n"

# Перевірка чи запущений API server
API_RUNNING=$(lsof -ti:3000)
if [ -z "$API_RUNNING" ]; then
  echo -e "${RED}❌ API server не запущений на порту 3000${NC}"
  echo -e "Запустіть в окремому терміналі:"
  echo -e "${GREEN}  cd services/api && pnpm dev${NC}\n"
  exit 1
else
  echo -e "${GREEN}✅ API server запущений на порту 3000${NC}"
fi

# Перевірка чи вільний порт 8081
PORT_8081=$(lsof -ti:8081)
if [ ! -z "$PORT_8081" ]; then
  echo -e "${RED}❌ Порт 8081 зайнятий (PID: $PORT_8081)${NC}"
  echo -e "Зупиніть процес або використайте інший порт\n"
  exit 1
fi

# Перевірка чи вільний порт 8082
PORT_8082=$(lsof -ti:8082)
if [ ! -z "$PORT_8082" ]; then
  echo -e "${RED}❌ Порт 8082 зайнятий (PID: $PORT_8082)${NC}"
  echo -e "Зупиніть процес або використайте інший порт\n"
  exit 1
fi

echo -e "\n${BLUE}📦 Запуск Metro bundler на порту 8082...${NC}"
EXPO_DEVTOOLS_LISTEN_ADDRESS=localhost npx expo start --web --port 8082 > /tmp/metro-8082.log 2>&1 &
METRO_PID=$!
echo -e "Metro PID: $METRO_PID"

# Очікування запуску Metro
echo -e "Очікування Metro bundler (10 секунд)..."
sleep 10

echo -e "\n${BLUE}🔄 Запуск Proxy server на порту 8081...${NC}"
node proxy.js &
PROXY_PID=$!
echo -e "Proxy PID: $PROXY_PID"

echo -e "\n${GREEN}✅ Все запущено!${NC}"
echo -e "${GREEN}🌐 Відкрийте http://localhost:8081 в браузері${NC}\n"

# Функція для зупинки всіх процесів
cleanup() {
  echo -e "\n${BLUE}🛑 Зупинка серверів...${NC}"
  kill $PROXY_PID 2>/dev/null
  kill $METRO_PID 2>/dev/null
  echo -e "${GREEN}✅ Зупинено${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM

# Чекаємо поки користувач не натисне Ctrl+C
echo -e "Натисніть ${RED}Ctrl+C${NC} для зупинки\n"
wait
