# 🔧 Debug vs Release Build для iOS

## Разница между Debug и Release

### Debug Build (для разработки)
- ✅ Developer Menu работает (тряска)
- ✅ Hot Reload работает
- ✅ console.log() более подробные
- ✅ Source maps для отладки
- ✅ React Native Debugger работает
- ⚠️ Приложение работает медленнее
- ⚠️ Размер больше

### Release Build (для продакшна)
- ❌ Developer Menu отключено
- ❌ Hot Reload не работает
- ⚠️ console.log() всё ещё работают, но могут быть урезаны
- ✅ Приложение быстрее
- ✅ Размер меньше
- ✅ Оптимизировано

---

## Проверь текущий режим

В Xcode Console при запуске приложения ищи:

```
✅ __DEV__ = true     → Debug режим (хорошо для разработки)
❌ __DEV__ = false    → Release режим (для отладки неудобно)
```

---

## Как собрать в Debug режиме

### Вариант 1: Через Xcode (рекомендуется)

1. **Открой Xcode:**
   ```bash
   cd apps/universal-app
   open ios/WonderTales.xcworkspace
   ```

2. **Выбери Debug схему:**
   - В Xcode сверху слева: **WonderTales > [Your iPad]**
   - Нажми на "WonderTales" (рядом с кнопкой Play)
   - Выбери **Edit Scheme...**
   - Слева: **Run**
   - **Build Configuration:** выбери **Debug** (не Release!)
   - Нажми **Close**

3. **Собери и запусти:**
   - Нажми Play (▶️) или `Cmd + R`

### Вариант 2: Через командную строку

```bash
cd apps/universal-app

# Пересобери в Debug режиме
npx expo run:ios --device --configuration Debug

# Или (то же самое)
npx expo run:ios --device --variant debug
```

### Вариант 3: Указать явно в команде

```bash
cd apps/universal-app

# Удали старый билд
rm -rf ios/build

# Собери в Debug
npx expo run:ios --device --configuration Debug
```

---

## После пересборки в Debug

Теперь должно работать:

### ✅ Developer Menu (тряска)
Потряси iPad → появится меню с кнопками Debug, Reload и т.д.

### ✅ Hot Reload
Изменения в коде применяются автоматически (или нажми `r` в Metro)

### ✅ React Native Debugger
Потряси → Debug → откроется Safari с консолью

### ✅ console.log() подробнее
Более детальные логи и стек-трейсы ошибок

---

## Проверка после пересборки

1. **Запусти приложение на iPad**

2. **Посмотри в Xcode Console:**
   ```
   Ищи строку:
   __DEV__ = true  ✅ (Debug режим включен)
   ```

3. **Потряси iPad:**
   - Должно появиться Developer Menu
   - Если появилось → всё хорошо! 🎉

4. **Нажми Debug в меню:**
   - Откроется Safari
   - Теперь можешь дебажить в браузере

---

## Если всё ещё не работает Developer Menu

Даже в Debug режиме иногда меню не открывается на физических устройствах.

**Альтернативы:**

### 1. Открой Dev Menu программно

В Metro Bundler терминале:
```bash
# Нажми:
d   # Открыть Developer Menu на устройстве
```

### 2. Добавь кнопку Dev Menu в приложение

Временно добавь в любой экран:

```typescript
import { Button } from 'react-native';
import { DevSettings } from 'react-native';

// В твоём компоненте:
{__DEV__ && (
  <Button 
    title="🔧 Dev Menu" 
    onPress={() => {
      DevSettings.reload();
    }} 
  />
)}
```

Теперь можно открыть Dev Menu кнопкой в приложении!

---

## Зачем нужен Debug режим?

### Для разработки:
- 🐛 Удобная отладка
- 🔄 Быстрая итерация (Hot Reload)
- 🔍 React Native Debugger
- 📊 Детальные логи ошибок

### Когда использовать Release:
- 📦 Перед загрузкой в App Store
- 🚀 Тестирование производительности
- 📏 Проверка размера приложения

---

## Быстрая команда для пересборки

```bash
cd apps/universal-app

# 1. Удали старый билд (опционально)
rm -rf ios/build

# 2. Собери в Debug
npx expo run:ios --device --configuration Debug

# 3. Проверь в консоли
# Должно быть: __DEV__ = true
```

---

## Схемы сборки в Xcode

В Xcode есть предустановленные схемы:

- **Debug** - для разработки (используй это!)
- **Release** - для продакшна
- **Profile** - для профилирования производительности

**По умолчанию `npx expo run:ios` использует Debug**, но иногда может переключиться на Release.

---

## Проверь Build Configuration в Xcode

1. Открой **WonderTales.xcworkspace** в Xcode
2. Нажми на **WonderTales** (слева, синяя иконка проекта)
3. Выбери target **WonderTales**
4. Вкладка **Build Settings**
5. Поиск: "Configuration"
6. Проверь что **Debug** выбран для "Run"

---

## После пересборки в Debug - твой workflow:

```bash
# 1. Запусти Metro bundler
cd apps/universal-app
npx expo start

# 2. В другом терминале - собери в Debug
npx expo run:ios --device --configuration Debug

# 3. На iPad - потряси
# Должно появиться Developer Menu

# 4. В меню выбери "Debug"
# Откроется Safari

# 5. Теперь дебажь в Safari Console
```

---

## Резюме

**Проблема:** Приложение собрано в Release режиме → Developer Menu не работает

**Решение:** Пересобери в Debug режиме:

```bash
cd apps/universal-app
npx expo run:ios --device --configuration Debug
```

После этого:
- ✅ Тряска откроет Developer Menu
- ✅ Hot Reload будет работать
- ✅ Отладка станет удобнее

**Но помни:** `console.log()` в Xcode Console работает в ЛЮБОМ режиме! 🎯
