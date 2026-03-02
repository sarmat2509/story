# 🐛 Отладка iOS приложения: Почему не работает кнопка

## Быстрая диагностика

### Шаг 1: Открой консоль Xcode

Если приложение запущено из Xcode:

1. В Xcode нажми `Cmd + Shift + Y` (или **View → Debug Area → Activate Console**)
2. Нажми кнопку в приложении на iPad
3. Смотри в консоль - там должны быть ошибки

**Что искать:**
```
❌ Network request failed
❌ Error: Request failed with status code 404
❌ TypeError: Cannot read property
❌ [Error] ...
```

---

### Шаг 2: Проверь к какому API подключается приложение

В консоли Xcode ищи эти строки при запуске приложения:

```
🔗 API_BASE_URL: https://magic-sleep-time.duckdns.org
🔗 EXPO_PUBLIC_API_BASE_URL: https://magic-sleep-time.duckdns.org
```

**Проблема:** Если там `http://localhost:3000` или `http://192.168...` - приложение пытается подключиться к локальному серверу!

**Решение:**

```bash
cd apps/universal-app

# Проверь .env файл
cat .env | grep EXPO_PUBLIC_API_BASE_URL

# Должно быть:
# EXPO_PUBLIC_API_BASE_URL=https://magic-sleep-time.duckdns.org

# Если нет - исправь:
echo "EXPO_PUBLIC_API_BASE_URL=https://magic-sleep-time.duckdns.org" >> .env

# ОБЯЗАТЕЛЬНО перебилди приложение (env переменные запекаются в билд!)
npx expo run:ios --device
```

---

### Шаг 3: Включи React Native Debugger

1. **На iPad:** Потряси устройство (или нажми `Cmd + D` в симуляторе)
2. В меню выбери **"Debug"** или **"Show Inspector"**
3. Откроется Safari DevTools
4. Перейди во вкладку **Console**
5. Нажми кнопку в приложении
6. Смотри ошибки в консоли

**Что искать:**
```javascript
Error: Network request failed
TypeError: Cannot read property 'data' of undefined
[AxiosError]: Request failed with status code 401
```

---

### Шаг 4: Проверь Network запросы (продвинутый способ)

#### Вариант A: Safari Web Inspector (если включен Debug)

1. Открой **Safari** на Mac
2. Меню **Develop** → **[Your iPad Name]** → **[Your App]**
3. Перейди во вкладку **Network**
4. Нажми кнопку в приложении
5. Смотри какие запросы идут и их статусы

#### Вариант B: Через прокси (Flipper - продвинутый)

```bash
# Установи Flipper (один раз)
brew install --cask flipper

# Запусти Flipper
open /Applications/Flipper.app

# В приложении включи Debug mode (потряси iPad)
# Flipper автоматически подключится
# Смотри вкладку Network
```

---

### Шаг 5: Посмотри логи на сервере

В отдельном терминале запусти:

```bash
./scripts/view-logs.sh -f
```

Теперь нажми кнопку в приложении - если запрос доходит до сервера, увидишь его в логах.

**Если логов нет** → запрос не доходит до сервера (проблема с URL или сетью)

**Если есть ошибка в логах** → запрос доходит, но сервер возвращает ошибку

---

## Частые проблемы и решения

### 🔴 Проблема 1: Приложение подключается к localhost

**Симптомы:**
```
🔗 API_BASE_URL: http://localhost:3000
или
🔗 API_BASE_URL: http://192.168.1.100:3000
```

**Причина:** Приложение собрано с локальным API URL

**Решение:**

```bash
cd apps/universal-app

# Создай правильный .env
cat > .env << 'EOF'
EXPO_PUBLIC_API_BASE_URL=https://magic-sleep-time.duckdns.org
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=151914486575-4ekba7gcqcbc6joqahhaigs7v97qjdoo.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB=151914486575-1kpc8ot6kdhjho9hbm7tbqmtgqv7tk60.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=151914486575-9tqc0a0ksjl6hhokoevcek809bkgve9r.apps.googleusercontent.com
APPLE_CLIENT_ID=com.anonymous.wondertales
EOF

# Перебилди (это важно!)
npx expo start -c
npx expo run:ios --device
```

---

### 🔴 Проблема 2: Network request failed

**Консоль показывает:**
```
Error: Network request failed
или
TypeError: Network request failed
```

**Причины:**
1. Нет интернета на iPad
2. API URL неправильный
3. Сервер не отвечает

**Проверки:**

```bash
# 1. Проверь что сервер работает
curl https://magic-sleep-time.duckdns.org/health/health
# Должно вернуть: {"status":"healthy"}

# 2. Проверь что iPad подключен к интернету
# На iPad открой Safari → попробуй открыть google.com

# 3. Посмотри логи сервера
./scripts/view-logs.sh -f
# Нажми кнопку в приложении - приходит ли запрос?
```

---

### 🔴 Проблема 3: 401 Unauthorized

**Консоль показывает:**
```
Error: Request failed with status code 401
или
AxiosError: Unauthorized
```

**Причина:** Пользователь не авторизован или токен истёк

**Решение:**
1. Выйди из приложения (logout)
2. Войди заново через Google/Apple
3. Попробуй снова

---

### 🔴 Проблема 4: 404 Not Found

**Консоль показывает:**
```
Error: Request failed with status code 404
```

**Причина:** Неправильный URL запроса

**Проверь в коде:**
```typescript
// Правильно:
apiClient.post('/api/v1/stories', data)

// Неправильно:
apiClient.post('/stories', data)  // Забыли /api/v1
```

---

### 🔴 Проблема 5: Кнопка не реагирует вообще

**Проверь:**

1. **TouchableOpacity / Button работает?**
   ```typescript
   // Добавь console.log
   <TouchableOpacity onPress={() => {
     console.log('🔵 Button pressed!');  // Это должно появиться в консоли
     handleSubmit();
   }}>
   ```

2. **Есть ли loading state?**
   ```typescript
   // Кнопка может быть задизейблена
   <Button disabled={isLoading || isSubmitting}>
   ```

3. **Не перекрывает ли другой элемент кнопку?**
   ```typescript
   // Добавь zIndex
   <View style={{ zIndex: 10 }}>
     <Button onPress={handlePress}>Click me</Button>
   </View>
   ```

---

## Пошаговая отладка (Complete Flow)

### 1. Открой два терминала

**Терминал 1 - Логи сервера:**
```bash
./scripts/view-logs.sh -f
```

**Терминал 2 - Запуск приложения:**
```bash
cd apps/universal-app
npx expo run:ios --device
```

### 2. Открой Xcode Console

В Xcode нажми `Cmd + Shift + Y`

### 3. Нажми кнопку в приложении

Смотри одновременно:
- **Xcode Console** - ошибки JavaScript
- **Терминал 1** - запросы на сервер

### 4. Анализируй результаты

**Сценарий A: В Xcode Console есть ошибка**
```
❌ Error: Network request failed
```
→ Проблема на клиенте (неправильный URL, нет интернета)

**Сценарий B: В логах сервера есть ошибка**
```
❌ Error: Invalid input
```
→ Проблема на сервере (валидация, баг в API)

**Сценарий C: Нигде нет ошибок, но кнопка не реагирует**
```
// Ничего не печатается
```
→ Проблема с обработчиком события (onPress не вызывается)

**Сценарий D: Запрос не доходит до сервера**
```
// В Xcode Console есть попытка запроса
// В логах сервера ничего нет
```
→ Неправильный API URL или нет интернета

---

## Чеклист перед отладкой

- [ ] Приложение собрано с правильным `.env` файлом
- [ ] В консоли показывает правильный API URL: `https://magic-sleep-time.duckdns.org`
- [ ] Xcode Console открыт (`Cmd + Shift + Y`)
- [ ] Логи сервера запущены (`./scripts/view-logs.sh -f`)
- [ ] iPad подключен к интернету
- [ ] Сервер работает (проверить: `curl https://magic-sleep-time.duckdns.org/health/health`)

---

## Продвинутая отладка

### Добавь логирование в код

```typescript
// В компоненте с кнопкой
const handlePress = async () => {
  console.log('🔵 Button pressed');
  
  try {
    console.log('📤 Sending request to:', API_BASE_URL);
    const response = await apiClient.post('/api/v1/stories', data);
    console.log('✅ Response:', response.data);
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error response:', error.response?.data);
  }
};
```

### Используй React Native Debugger

```bash
# Установи (один раз)
brew install --cask react-native-debugger

# Запусти
open "rndebugger://set-debugger-loc?host=localhost&port=8081"

# В приложении: потряси iPad → Debug
```

### Проверь запросы через Charles Proxy

```bash
# Установи Charles (платный, но есть trial)
brew install --cask charles

# Настрой Charles как прокси на iPad
# Settings → Wi-Fi → Твоя сеть → Configure Proxy
# Manual → IP твоего Mac, Port: 8888

# Теперь все запросы с iPad будут видны в Charles
```

---

## Быстрая проверка: Работает ли API?

```bash
# Проверь health endpoint
curl https://magic-sleep-time.duckdns.org/health/health

# Проверь конкретный endpoint (с токеном)
# Сначала получи токен из приложения (AsyncStorage)
# Или войди через web и возьми из DevTools

curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://magic-sleep-time.duckdns.org/api/v1/stories
```

---

## Резюме: Самый быстрый способ отладки

1. **Открой Xcode Console:** `Cmd + Shift + Y`
2. **Запусти логи сервера:** `./scripts/view-logs.sh -f`
3. **Нажми кнопку в приложении**
4. **Читай ошибки:**
   - В Xcode Console - ошибки клиента
   - В логах сервера - ошибки сервера

**95% проблем будут видны в этих двух местах!**

---

## Нужна помощь?

Если не можешь разобраться:

1. Сделай скриншот ошибки из Xcode Console
2. Скопируй логи из сервера
3. Опиши что именно делаешь (какую кнопку жмёшь)
4. Покажи какой API URL используется (`console.log` в начале файла)

Это поможет быстро найти проблему!
