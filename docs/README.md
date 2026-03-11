# 📚 Documentation

## Operations & Deployment

### Docker (единая точка входа)

- **[DOCKER.md](./DOCKER.md)** — запуск через docker-compose, переменные окружения, скрипты API

### Production Logs

- **[DROPLET_LOGS_GUIDE.md](./DROPLET_LOGS_GUIDE.md)** - Complete guide for viewing API logs on production
  - How to view logs from local machine
  - How to view logs on droplet
  - Search and filter logs
  - Save logs to files
  - Real-time monitoring
  - Troubleshooting

- **[LOGS_CHEATSHEET.md](./LOGS_CHEATSHEET.md)** - Quick reference for most common log commands
  - Most needed commands
  - Shell aliases
  - Quick troubleshooting

### Troubleshooting

- **[RATE_LIMITING_TROUBLESHOOTING.md](./RATE_LIMITING_TROUBLESHOOTING.md)** - Fix 429 Too Many Requests errors
  - Understanding rate limiting behind Nginx proxy
  - Solution A: Fix rate limiter IP detection (production)
  - Solution B: Direct container access (development)
  - Debugging rate limit issues
  - Security considerations

### Scripts

Use the convenience script for viewing logs:

```bash
# View last 100 lines
./scripts/view-logs.sh

# Follow logs in real-time
./scripts/view-logs.sh -f

# Last 200 lines
./scripts/view-logs.sh -n 200

# Show only errors
./scripts/view-logs.sh -e

# Help
./scripts/view-logs.sh --help
```

## iOS Development

- **[BUILD_IOS.md](../apps/universal-app/BUILD_IOS.md)** - Complete guide for building iOS app
- **[ENV_QUICK_REFERENCE.md](../apps/universal-app/ENV_QUICK_REFERENCE.md)** - Environment setup (Production vs Local)
- **[IOS_BUILD_CHEATSHEET.md](../apps/universal-app/IOS_BUILD_CHEATSHEET.md)** - Commands cheat sheet
- **[QUICKFIX_PUSH_NOTIFICATIONS.md](../apps/universal-app/QUICKFIX_PUSH_NOTIFICATIONS.md)** - Fix for Push Notifications error (free Apple account)
- **[TROUBLESHOOTING_PUSH_NOTIFICATIONS.md](../apps/universal-app/TROUBLESHOOTING_PUSH_NOTIFICATIONS.md)** - Detailed troubleshooting

### iOS Debugging

- **[IOS_DEBUG_QUICK.md](./IOS_DEBUG_QUICK.md)** ⭐ **Начни здесь** - Кнопка не работает? Быстрая диагностика
- **[IOS_CLIENT_DEBUG_QUICK.md](./IOS_CLIENT_DEBUG_QUICK.md)** 🔍 **Клиентская отладка** - API работает, но кнопка не реагирует
- **[IOS_DEBUG_GUIDE.md](./IOS_DEBUG_GUIDE.md)** - Полное руководство по отладке iOS приложения
- **[IOS_CLIENT_DEBUG.md](./IOS_CLIENT_DEBUG.md)** - Детальная отладка клиентского кода с React Native Debugger

## Production Environment

**API Server:**
- URL: https://magic-sleep-time.duckdns.org
- Droplet IP: 167.172.102.75
- Location: /var/www/kazka
- Container: kazka-api-prod

**Services:**
- API: Port 3000 (Express + Node.js)
- Database: PostgreSQL 15
- Web Server: Nginx
- Web App: Port 8080

## Quick Links

### Monitoring

```bash
# Health check
curl https://magic-sleep-time.duckdns.org/health/health

# View logs
./scripts/view-logs.sh -f

# SSH to droplet
ssh root@167.172.102.75
```

### Deployment

```bash
# Deploy API
./scripts/deploy-api.sh

# Deploy web app
./scripts/deploy-webapp.sh
```

### Development

```bash
# Start all services (API, Postgres, Redis, Nginx) — единая точка входа
pnpm docker:dev

# Run API scripts (migrations, diagnostics)
pnpm api:script npx tsx src/scripts/runMigration.ts <migration.sql>
pnpm api:script npx tsx src/scripts/runAllMigrations.ts
```

## Architecture

See main [README.md](../README.md) for:
- Project structure
- Tech stack
- Architecture decisions
- Development workflows
