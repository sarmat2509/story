# 🚨 Быстрая отладка: Кнопка не работает в iOS

## 🎯 Три главных шага

### 1️⃣ Открой консоль Xcode

```
Cmd + Shift + Y
```

Нажми кнопку в приложении → смотри ошибки в консоли

---

### 2️⃣ Запусти логи сервера

```bash
./scripts/view-logs.sh -f
```

Нажми кнопку в приложении → смотри приходит ли запрос

---

### 3️⃣ Проверь API URL

В консоли Xcode при запуске приложения ищи:

```
🔗 API_BASE_URL: https://magic-sleep-time.duckdns.org  ✅ Правильно
🔗 API_BASE_URL: http://localhost:3000                 ❌ Неправильно!
```

**Если неправильно:**

```bash
cd apps/universal-app

# Исправь .env
cat > .env << 'EOF'
EXPO_PUBLIC_API_BASE_URL=https://magic-sleep-time.duckdns.org
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=151914486575-4ekba7gcqcbc6joqahhaigs7v97qjdoo.apps.googleusercontent.com
EOF

# ОБЯЗАТЕЛЬНО перебилди!
npx expo run:ios --device
```

---

## 🔍 Что смотреть

### В Xcode Console

```
✅ 🔗 API_BASE_URL: https://magic-sleep-time.duckdns.org
✅ 🔵 Button pressed
✅ 📤 Sending request...

❌ Error: Network request failed
❌ AxiosError: Request failed with status code 401
❌ TypeError: Cannot read property 'data' of undefined
```

### В логах сервера

```
✅ POST /api/v1/stories 200 150ms
✅ GET /api/v1/dictionaries 200 50ms

❌ POST /api/v1/stories 401 Unauthorized
❌ POST /api/v1/stories 500 Internal Server Error
```

---

## ⚡ Частые проблемы

### Проблема: Приложение не подключается к серверу

**Причина:** Собрано с `localhost` в `.env`

**Решение:**
```bash
cd apps/universal-app
cat .env | grep EXPO_PUBLIC_API_BASE_URL
# Если не https://magic-sleep-time.duckdns.org - исправь и пересобери!
```

---

### Проблема: 401 Unauthorized

**Причина:** Токен истёк

**Решение:** Выйди и войди заново

---

### Проблема: Кнопка вообще не реагирует

**Причина:** `onPress` не вызывается

**Проверка:** Добавь в код
```typescript
<Button onPress={() => {
  console.log('🔵 Button pressed!');  // Должно появиться в консоли
  handleSubmit();
}}>
```

---

## 📖 Полная инструкция

См. [IOS_DEBUG_GUIDE.md](./IOS_DEBUG_GUIDE.md)

---

## 💡 Самая частая причина

**95% проблем:** Приложение собрано с неправильным API URL (`localhost` вместо `https://magic-sleep-time.duckdns.org`)

**Решение:**
1. Проверь `.env` файл
2. Если там localhost - исправь на production URL
3. **ОБЯЗАТЕЛЬНО перебилди:** `npx expo run:ios --device`
