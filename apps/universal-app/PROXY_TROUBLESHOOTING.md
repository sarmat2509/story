# 🔧 Вирішення проблем з Proxy Server

## Помилка: `EPERM: operation not permitted` або `EADDRINUSE`

### Причина
Порт 8081 зайнятий іншим процесом або недоступний через обмеження прав.

### Рішення

#### 1. Знайти процес на порту 8081:
```bash
lsof -i:8081
```

#### 2. Зупинити процес:
```bash
# Якщо знайдено PID (наприклад 12345):
kill -9 12345

# Або вбити всі proxy процеси:
pkill -f "node proxy.js"
```

#### 3. Перевірити чи Metro запущений на 8082:
```bash
lsof -i:8082
```

Якщо Metro НЕ запущений, запустіть:
```bash
cd apps/universal-app
pnpm run web:metro
```

#### 4. Запустити proxy:
```bash
cd apps/universal-app
node proxy.js
```

## Помилка: `Route GET /dashboard not found`

### Причина
Proxy проксує запити на `/dashboard` до API замість Metro bundler.

### Рішення
Переконайтесь що:
1. Metro bundler запущений на порту **8082**
2. Proxy запущений на порту **8081**
3. Порядок middleware правильний (спочатку `/api`, потім `/uploads`, потім все інше)

## Помилка: `Route GET /v1/stories not found`

### Причина
Proxy видаляє `/api` з URL перед проксуванням до API.

### Рішення
Перевірте `pathRewrite` в `proxy.js`:
```javascript
pathRewrite: {
  '^/(.*)': '/api/$1' // Додає /api назад
}
```

## Правильний порядок запуску

1. **API Server** (термінал 1):
```bash
cd services/api
pnpm dev
```

2. **Metro Bundler** (термінал 2):
```bash
cd apps/universal-app
pnpm run web:metro
```
Очікуйте: `Web is waiting on http://localhost:8082`

3. **Proxy Server** (термінал 3):
```bash
cd apps/universal-app
node proxy.js
```
Очікуйте: `Proxy server running on http://localhost:8081`

4. **Відкрийте браузер**: `http://localhost:8081`

## Перевірка що все працює

```bash
# Перевірка API через proxy (має повернути 401 або JSON з помилкою auth)
curl http://localhost:8081/api/v1/stories

# Перевірка Metro через proxy (має повернути HTML)
curl http://localhost:8081/ | head -20
```

## Альтернатива: Використати скрипт

```bash
cd apps/universal-app
./start-web-dev.sh
```

Скрипт автоматично перевірить порти та запустить все потрібне.
