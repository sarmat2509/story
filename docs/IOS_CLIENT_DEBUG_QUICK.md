# 🎯 Быстро: Отладка клиентского кода iOS

## Проблема: Кнопка не работает, API правильный, ошибок нет

---

## 🚀 Три шага

### 1. Включи React Native Debugger

**Потряси iPad** → Меню → **"Debug"**

Откроется Safari с консолью

---

### 2. Добавь логи в код

```typescript
const handlePress = async () => {
  console.log('🔵 Button pressed!');  // ← Добавь это
  
  try {
    console.log('📤 Calling API...');  // ← И это
    await createStory(data);
    console.log('✅ Success!');  // ← И это
  } catch (error) {
    console.error('❌ Error:', error);  // ← И это
  }
};
```

Сохрани → Reload (потряси iPad → Reload)

---

### 3. Открой Safari Console и жми кнопку

**Safari → Develop → [Your iPad] → JSContext → Console**

Смотри что выводится:

```
✅ 🔵 Button pressed!        → Обработчик вызывается
❌ (ничего не выводится)     → onPress не вызывается
```

---

## Если `🔵 Button pressed!` НЕ появляется

### Причина: Кнопка disabled или перекрыта

**Быстрая проверка:**

```typescript
// Добавь тестовую кнопку в самый верх экрана
<Button 
  title="TEST" 
  onPress={() => {
    console.log('🟢 TEST PRESSED');
    alert('Works!');
  }} 
/>
```

**Если тестовая работает** → проблема в твоей основной кнопке

**Проверь:**
```typescript
<Button disabled={isPending || !isValid} />
//               ↑ Какое из этих true?

// Добавь лог:
console.log('Button state:', { isPending, isValid });
```

---

## Если `🔵 Button pressed!` появляется

### Причина: Код останавливается внутри обработчика

**Добавь логи в КАЖДУЮ строчку:**

```typescript
const handlePress = async () => {
  console.log('🔵 1. Started');
  
  if (!isValid) {
    console.log('⚠️ 2. Not valid, returning');
    return;  // ← Нашли проблему!
  }
  
  console.log('✅ 3. Valid, continuing');
  
  try {
    console.log('📤 4. Calling API...');
    await createStory(data);
    console.log('✅ 5. API success');
  } catch (error) {
    console.error('❌ 6. Error:', error);
  }
  
  console.log('🏁 7. Finished');
};
```

Смотри где останавливается!

---

## Открыть Safari Console

1. **Safari → Settings → Advanced**
2. Включи **"Show Develop menu"**
3. **Safari → Develop → [Your iPad Name] → JSContext**
4. Вкладка **Console**

Или в Xcode Console: `Cmd + Shift + Y`

---

## Полный тестовый компонент

Замени свой экран на это:

```typescript
import { Button, Alert } from 'react-native';

export default function TestScreen() {
  console.log('🟢 Screen rendered');
  
  const handlePress = () => {
    console.log('🔵 Button pressed!');
    Alert.alert('Success', 'Button works!');
  };
  
  return (
    <Button title="TEST" onPress={handlePress} />
  );
}
```

**Если это работает** → проблема в логике твоей кнопки  
**Если не работает** → более глубокая проблема

---

## Flipper (продвинутый)

```bash
# Установи
brew install --cask flipper

# Запусти
open /Applications/Flipper.app

# В приложении: потряси → Debug
# Flipper подключится автоматически
# Смотри React DevTools вкладку
```

---

## Чеклист

- [ ] Потряс iPad → Debug → Safari открылся?
- [ ] Добавил `console.log('🔵 Button pressed')` в onPress
- [ ] Reload приложения (потряси → Reload)
- [ ] Открыл Safari Console (Develop → iPad → JSContext)
- [ ] Нажал кнопку - что в консоли?
- [ ] Если ничего - проверил `disabled={...}`?
- [ ] Если логи есть - где останавливается?

---

## 📖 Полная инструкция

[IOS_CLIENT_DEBUG.md](./IOS_CLIENT_DEBUG.md)

---

## Самый быстрый способ

```typescript
// 1. Добавь в НАЧАЛО обработчика
console.log('🔵🔵🔵 PRESSED!');

// 2. Потряси iPad → Debug

// 3. Safari → Develop → iPad → Console

// 4. Жми кнопку - видно лог?
//    Да → читай дальше логи
//    Нет → кнопка disabled или перекрыта
```

**90% проблем найдётся за 2 минуты!**
