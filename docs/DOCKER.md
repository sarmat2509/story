# Docker — единая точка входа

API и все связанные сервисы запускаются **только через Docker Compose**. Переменные окружения задаются через `env_file` в docker-compose, dotenv в коде не используется.

## Запуск

```bash
# Development (Postgres, Redis, API, Nginx, Adminer)
pnpm docker:dev
# или
docker compose -f docker-compose.dev.yml up

# Production
pnpm docker:prod
# или
docker compose -f docker-compose.prod.yml up
```

## Переменные окружения

- **Dev:** `env_file: .env.local` (в корне проекта)
- **Prod:** `env_file: .env.production`

Приложение не использует dotenv — переменные берутся только из docker-compose `env_file`.

## Запуск скриптов API

Все скрипты API запускаются **через Docker** — так они получают переменные из `env_file`:

```bash
# Миграции (скрипт runMigration.sh)
pnpm run migrate 0055_story_ratings.sql

# Другие скрипты
pnpm api:script -- npx tsx src/scripts/checkAiUsage.ts
pnpm api:script -- npx tsx src/scripts/diagnoseEnvImages.ts <storyId>
```

### Примеры скриптов

| Скрипт | Назначение |
|--------|------------|
| `runMigration.ts <file.sql>` | Применить миграцию |
| `runAllMigrations.ts` | Применить все неприменённые миграции |
| `checkAiUsage.ts [storyId]` | Просмотр AI usage events |
| `diagnoseEnvImages.ts <storyId>` | Диагностика env images |
| `dumpSceneVisuals.ts <storyId>` | Дамп sceneVisual по сценам |
| `showSceneImagePrompt.ts <storyId> <sceneId>` | Показать image prompt для сцены |

## Production

На droplet скрипты запускаются внутри уже работающего контейнера:

```bash
docker exec wondertales-api-prod sh -c 'cd /app/services/api && pnpm exec tsx src/scripts/runMigration.ts 0055_story_ratings.sql'
```
