# 🚀 Запуск Web Development з Proxy

## ⚠️ ВАЖЛИВО: Зупиніть поточний dev server!

Поточний Metro bundler запущений на порту **8081**.
Тепер нам потрібно:
- Metro на порту **8082**
- Proxy на порту **8081**

## Кроки для запуску

### 1️⃣ Зупинити поточний Metro server

У терміналі 2, де запущено `pnpm dev:app -- --clear`:
- Натисніть **`Ctrl+C`** щоб зупинити

### 2️⃣ Запустити Metro на порту 8082

У тому ж терміналі 2:
```bash
cd apps/universal-app
pnpm run web:metro
```

**Очікуваний вивід:**
```
› Metro waiting on exp://...
› Web is waiting on http://localhost:8082
```

⚠️ **НЕ відкривайте localhost:8082** - це тільки bundler!

### 3️⃣ Запустити Proxy Server на порту 8081

У **новому терміналі** (термінал 10 або інший вільний):
```bash
cd apps/universal-app
pnpm run web
```

**Очікуваний вивід:**
```
🔧 Starting development proxy server...
✅ Proxy server running on http://localhost:8081
📡 API requests: /api/* → http://localhost:3000/api/*
📷 Images: /uploads/* → http://localhost:3000/api/v1/assets/*
📦 Metro bundler: /* → localhost:8082/*

🌐 Open http://localhost:8081 in your browser
```

### 4️⃣ Відкрити браузер

Відкрийте: **http://localhost:8081**

## Альтернатива: Автоматичний скрипт

Якщо хочете запустити все одразу:
```bash
cd apps/universal-app
./start-web-dev.sh
```

Скрипт автоматично запустить Metro на 8082 та Proxy на 8081.

## ✅ Що працює

| Запит | Шлях | Проксування |
|-------|------|-------------|
| **API запити** | `localhost:8081/api/v1/auth/me` | → `localhost:3000/api/v1/auth/me` |
| **Завантаження фото** | POST `localhost:8081/api/v1/upload/photo` | → `localhost:3000/api/v1/upload/photo` |
| **Показ зображень** | `localhost:8081/uploads/...` | → `localhost:3000/api/v1/assets/...` |
| **Bundle JS** | `localhost:8081/index.bundle` | → `localhost:8082/index.bundle` |

**Переваги:**
- ✅ **Немає CORS проблем** - всі запити на один origin (localhost:8081)
- ✅ **Authorization header працює** - `<img src="/uploads/..." />` завантажується з auth
- ✅ **Приватні фото захищені** - auth перевіряється на API

## 🔧 Якщо щось не працює

### Перевірте процеси:
```bash
# API server (має бути на порту 3000)
lsof -i:3000

# Metro bundler (має бути на порту 8082)
lsof -i:8082

# Proxy server (має бути на порту 8081)
lsof -i:8081
```

### Зупинка процесів:
```bash
# Зупинити процес на порту (якщо потрібно)
kill -9 $(lsof -ti:8081)
kill -9 $(lsof -ti:8082)
```

### Очищення кешу Metro:
```bash
cd apps/universal-app
rm -rf .expo
pnpm run web:metro -- --clear
```

### Перевірка логів:
- **Metro**: дивіться термінал 2
- **Proxy**: дивіться термінал 10
- **API**: дивіться термінал 4

## 📱 Для мобільної розробки (iOS/Android)

Proxy **НЕ потрібен** для мобільних платформ!

```bash
# Просто запустіть звичайний Expo
pnpm start

# Потім:
# - Натисніть 'a' для Android
# - Натисніть 'i' для iOS simulator
```

Мобільні додатки використовують повний API URL (`http://localhost:3000`) напряму.
