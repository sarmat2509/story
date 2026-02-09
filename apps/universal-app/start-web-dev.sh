#!/bin/bash

# Кольори для виводу
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Запуск Web Development з Proxy${NC}\n"

# Встановлення залежностей
echo -e "${BLUE}📦 Перевірка залежностей...${NC}"
if [ ! -d "node_modules" ] || [ ! -d "node_modules/expo" ] || [ ! -d "node_modules/express" ]; then
  echo -e "${YELLOW}⏳ Встановлення залежностей (це може зайняти хвилину)...${NC}"
  pnpm install
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Залежності встановлено${NC}"
  else
    echo -e "${RED}❌ Помилка встановлення залежностей${NC}"
    echo -e "${YELLOW}💡 Спробуйте вручну: pnpm install${NC}"
    exit 1
  fi
else
  echo -e "${GREEN}✅ Залежності актуальні${NC}"
fi

# Очистка кешу Metro
echo -e "${BLUE}🧹 Очистка кешу Metro bundler...${NC}"
rm -rf .expo 2>/dev/null
rm -rf ~/.expo/native-modules-cache 2>/dev/null
echo -e "${GREEN}✅ Кеш очищено${NC}\n"

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

# Зупинка процесів на портах 8081 та 8082
echo -e "${BLUE}🔍 Перевірка портів 8081 та 8082...${NC}"

PORT_8081=$(lsof -ti:8081)
if [ ! -z "$PORT_8081" ]; then
  echo -e "${YELLOW}⚠️  Порт 8081 зайнятий (PID: $PORT_8081), зупиняю...${NC}"
  kill -9 $PORT_8081 2>/dev/null
  sleep 1
  echo -e "${GREEN}✅ Порт 8081 звільнено${NC}"
else
  echo -e "${GREEN}✅ Порт 8081 вільний${NC}"
fi

PORT_8082=$(lsof -ti:8082)
if [ ! -z "$PORT_8082" ]; then
  echo -e "${YELLOW}⚠️  Порт 8082 зайнятий (PID: $PORT_8082), зупиняю...${NC}"
  kill -9 $PORT_8082 2>/dev/null
  sleep 1
  echo -e "${GREEN}✅ Порт 8082 звільнено${NC}"
else
  echo -e "${GREEN}✅ Порт 8082 вільний${NC}"
fi

echo -e "\n${BLUE}📦 Запуск Metro bundler на порту 8082...${NC}"
echo -e "${YELLOW}📋 Логи Metro будуть виводитись нижче:${NC}\n"

# Запуск Metro з виводом у консоль
EXPO_DEVTOOLS_LISTEN_ADDRESS=localhost npx expo start --web --port 8082 2>&1 | while IFS= read -r line; do
  echo -e "${YELLOW}[METRO]${NC} $line"
done &
METRO_PID=$!
echo -e "Metro PID: $METRO_PID"

# Очікування запуску Metro
echo -e "Очікування Metro bundler (10 секунд)..."
sleep 10

echo -e "\n${BLUE}🔄 Запуск Proxy server на порту 8081...${NC}"
echo -e "${YELLOW}📋 Логи Proxy будуть виводитись нижче:${NC}\n"

# Запуск Proxy з виводом у консоль
node proxy.js 2>&1 | while IFS= read -r line; do
  echo -e "${BLUE}[PROXY]${NC} $line"
done &
PROXY_PID=$!
echo -e "Proxy PID: $PROXY_PID"

echo -e "\n${GREEN}✅ Все запущено!${NC}"
echo -e "${GREEN}🌐 Відкрийте http://localhost:8081 в браузері${NC}\n"

# Функція для зупинки всіх процесів
cleanup() {
  echo -e "\n${BLUE}🛑 Зупинка серверів...${NC}"
  kill $PROXY_PID 2>/dev/null
  kill $METRO_PID 2>/dev/null
  # Додатково вбиваємо всі дочірні процеси
  pkill -P $METRO_PID 2>/dev/null
  pkill -P $PROXY_PID 2>/dev/null
  echo -e "${GREEN}✅ Зупинено${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM

# Чекаємо поки користувач не натисне Ctrl+C
echo -e "Натисніть ${RED}Ctrl+C${NC} для зупинки\n"
echo -e "${YELLOW}==================== ЛОГИ ====================${NC}\n"
wait

