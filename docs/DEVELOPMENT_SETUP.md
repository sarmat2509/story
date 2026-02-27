# Development Environment Setup

## Quick Start (with Docker + Nginx)

Запуск полного стека разработки с Nginx (по аналогии с production):

```bash
# 1. Убедитесь что .env.local настроен
cat .env.local

# 2. Запустите все сервисы
docker compose -f docker-compose.dev.yml up -d

# 3. Проверьте статус
docker compose -f docker-compose.dev.yml ps

# 4. Смотрите логи
docker compose -f docker-compose.dev.yml logs -f api
```

## Доступные сервисы

После запуска `docker compose -f docker-compose.dev.yml up -d`:

- **API (через Nginx)**: http://localhost:8001/api/v1
- **API (прямой доступ)**: http://localhost:3000/api/v1
- **PostgreSQL**: localhost:5432
- **Adminer (DB UI)**: http://localhost:8083

## Структура

```
┌─────────────────────────────────────────┐
│  Nginx (localhost:8001)                 │
│  - Проксирует /api/* → API:3000         │
│  - CORS headers для development         │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  API Service (api:3000)                 │
│  - Node.js/Express                      │
│  - Hot reload (volumes mounted)         │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  PostgreSQL (postgres:5432)             │
│  - kazka_dev database                   │
└─────────────────────────────────────────┘
```

## Конфигурация Web App

Обновите `apps/universal-app/.env`:

```env
# Для web версии через прокси
EXPO_PUBLIC_API_BASE_URL=http://localhost:8001
```

Или измените `proxy.js`:

```javascript
const API_URL = process.env.API_BASE_URL || 'http://localhost:8001';
```

## Запуск Web App

```bash
cd apps/universal-app

# Способ 1: С прокси сервером (рекомендуется)
pnpm web

# Способ 2: Только Metro bundler
pnpm web:metro
```

## Управление сервисами

```bash
# Запуск
docker compose -f docker-compose.dev.yml up -d

# Остановка
docker compose -f docker-compose.dev.yml down

# Перезапуск API (после изменений в коде)
docker compose -f docker-compose.dev.yml restart api

# Пересборка образа API
docker compose -f docker-compose.dev.yml build api
docker compose -f docker-compose.dev.yml up -d api

# Логи в реальном времени
docker compose -f docker-compose.dev.yml logs -f

# Логи конкретного сервиса
docker compose -f docker-compose.dev.yml logs -f api
docker compose -f docker-compose.dev.yml logs -f nginx

# Выполнить команду в контейнере
docker compose -f docker-compose.dev.yml exec api sh
docker compose -f docker-compose.dev.yml exec postgres psql -U kazka -d kazka_dev
```

## Миграции базы данных

```bash
# Применить миграции
docker compose -f docker-compose.dev.yml exec api sh -c 'cd services/api && npx drizzle-kit push:pg'

# Или запустить конкретную миграцию
docker compose -f docker-compose.dev.yml exec api sh -c 'cd services/api && npx tsx src/scripts/runMigration.ts 0039_add_asset_thumbnails.sql'
```

## Troubleshooting

### Порты заняты

Если порты 8001, 3000, 5432, или 8083 заняты:

```bash
# Найти процесс
lsof -i :8001
lsof -i :3000

# Убить процесс
kill -9 <PID>
```

Или измените порты в `docker-compose.dev.yml`:

```yaml
nginx:
  ports:
    - "8001:80"  # Измените 8001 на другой порт
```

### Контейнер не запускается

```bash
# Проверьте логи
docker compose -f docker-compose.dev.yml logs api

# Пересоздайте контейнеры
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
```

### API не отвечает

```bash
# Проверьте health check
curl http://localhost:8001/health
curl http://localhost:3000/health

# Проверьте логи
docker compose -f docker-compose.dev.yml logs -f api nginx
```

### Изображения не загружаются (404)

Проблема: Web app пытается загрузить изображения, но получает 404.

**Решение:**

1. Убедитесь что `EXPO_PUBLIC_API_BASE_URL` пустой для web:

```typescript
// apps/universal-app/src/api/client.ts
const baseURL = Platform.OS === 'web' ? '' : API_BASE_URL;
```

2. Настройте прокси в `proxy.js`:

```javascript
const API_URL = process.env.API_BASE_URL || 'http://localhost:8001';
```

3. Перезапустите web app:

```bash
cd apps/universal-app
pnpm web
```

## Различия Development vs Production

| Feature | Development | Production |
|---------|-------------|------------|
| Nginx порт | 8001 | 80, 443 |
| SSL | Нет | Да (Let's Encrypt) |
| API hot reload | Да (volumes) | Нет |
| Логи | debug | warn/error |
| CORS | Разрешены все | Ограничено |
| Database | kazka_dev | kazka_prod |
| Container names | *-dev | *-prod |

## Альтернативный способ (без Docker)

Если хотите запускать сервисы локально без Docker:

```bash
# Терминал 1: PostgreSQL (Docker)
docker compose up -d postgres

# Терминал 2: API
cd services/api
pnpm dev

# Терминал 3: Web App
cd apps/universal-app
pnpm web
```

В этом случае в `apps/universal-app/.env`:

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
```
