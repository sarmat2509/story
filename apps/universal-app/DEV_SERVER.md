# Development Server Setup

## Як запустити для веб-розробки

Для веба використовується proxy server щоб уникнути CORS проблем.

### Запуск

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
Запуститься на `http://localhost:8082`

3. **Proxy Server** (термінал 3):
```bash
cd apps/universal-app
pnpm run web
```
Запуститься на `http://localhost:8081`

4. **Відкрийте браузер**: `http://localhost:8081`

### Що відбувається

```
Browser (localhost:8081)
  ├─ /api/* ────→ Proxy ────→ localhost:3000/api/*
  ├─ /uploads/* → Proxy ────→ localhost:3000/api/v1/assets/*
  └─ /* ────────→ Metro ────→ localhost:8082/*
```

### Для мобільної розробки

Просто:
```bash
pnpm start
# потім 'a' для Android або 'i' для iOS
```

Proxy не потрібен - мобільні додатки використовують повний API URL.

## Альтернативний запуск (швидкий старт)

Якщо потрібно запустити все одразу з root:
```bash
pnpm dev:web
```

Це запустить API + Metro + Proxy в одній команді.
