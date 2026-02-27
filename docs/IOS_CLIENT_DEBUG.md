# 🔍 Отладка клиентского кода в iOS

## Ситуация: API правильный, но кнопка не работает

Если:
- ✅ API URL правильный (production)
- ✅ Нет ошибок в Xcode Console
- ✅ Нет запросов в логах сервера
- ❌ Кнопка не реагирует

→ Проблема в клиентском коде (обработчик не вызывается)

---

## Шаг 1: Включи React Native Debugger

### На реальном iPad:

1. **Потряси iPad** (буквально физически тряси)
2. Появится меню **Developer Menu**
3. Нажми **"Debug"** или **"Open Debugger"**
4. Откроется Safari с консолью

### В Xcode:

Или нажми `Cmd + D` когда приложение в фокусе

---

## Шаг 2: Открой Safari DevTools

1. Открой **Safari** на Mac
2. Меню **Safari → Settings → Advanced**
3. Включи **"Show Develop menu in menu bar"**
4. Меню **Develop → [Your iPad Name] → Automatically Show Web Inspector for JSContexts**
5. Во вкладке **Console** смотри все `console.log()`

---

## Шаг 3: Добавь отладочные логи в код

Найди файл с проблемной кнопкой и добавь логи:

```typescript
// Пример: в компоненте с кнопкой создания истории

const MyComponent = () => {
  console.log('🟢 Component rendered');
  
  const { mutate: createStory, isPending } = useCreateStory();
  
  console.log('🟡 isPending:', isPending);
  
  const handlePress = async () => {
    console.log('🔵 Button pressed! Starting handlePress...');
    
    // Проверь все условия
    console.log('📊 Current state:', {
      isPending,
      isFormValid: form.isValid,
      hasRequiredFields: !!theme && !!language
    });
    
    try {
      console.log('📤 About to call createStory...');
      await createStory(formData);
      console.log('✅ createStory completed');
    } catch (error) {
      console.error('❌ Error in handlePress:', error);
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack
      });
    }
  };
  
  console.log('🎯 Rendering button with isPending:', isPending);
  
  return (
    <TouchableOpacity 
      onPress={handlePress}
      disabled={isPending}
      style={{ opacity: isPending ? 0.5 : 1 }}
    >
      <Text>Create Story</Text>
    </TouchableOpacity>
  );
};
```

### Сохрани файл и перезагрузи приложение

В Metro bundler (терминал где запущено `npx expo start`):
- Нажми `r` - reload приложения

Или на iPad:
- Потряси → Reload

---

## Шаг 4: Проверь что выводится в консоль

### Откуда смотреть логи:

**Вариант A: Safari Console (если включен Debug)**
- Safari → Develop → [iPad] → JSContext
- Вкладка Console

**Вариант B: Xcode Console**
- `Cmd + Shift + Y` в Xcode
- Все `console.log()` будут здесь

**Вариант C: Metro Bundler**
- Терминал где запущено `npx expo start`
- Логи тоже дублируются сюда

---

## Что искать в логах

### Сценарий 1: `🔵 Button pressed!` НЕ появляется

**Значит:** `onPress` не вызывается

**Возможные причины:**

1. **Кнопка disabled:**
   ```typescript
   // Проверь в коде
   <Button disabled={true}>  // или disabled={someCondition}
   ```
   
2. **Другой элемент перекрывает кнопку:**
   ```typescript
   // Попробуй добавить
   <View style={{ zIndex: 999 }}>
     <Button onPress={handlePress}>Click me</Button>
   </View>
   ```

3. **TouchableOpacity не реагирует (iOS bug):**
   ```typescript
   // Замени на Button из react-native
   import { Button } from 'react-native';
   
   <Button title="Click me" onPress={handlePress} />
   ```

4. **Компонент вообще не рендерится:**
   ```typescript
   // Добавь в начале компонента
   console.log('🟢 Component rendered');
   // Если это не печатается - компонент не показывается
   ```

---

### Сценарий 2: `🔵 Button pressed!` появляется, но дальше ничего

**Значит:** Обработчик вызывается, но останавливается внутри

**Проверь:**

1. **Есть ли early return:**
   ```typescript
   const handlePress = () => {
     console.log('🔵 Button pressed!');
     
     if (!isValid) {
       console.log('⚠️ Form not valid, returning early');
       return;  // ← Вот здесь останавливается!
     }
     
     console.log('✅ Continuing...');
     // ...
   };
   ```

2. **Есть ли try-catch без логов:**
   ```typescript
   try {
     await doSomething();
   } catch (error) {
     // Молча проглатывается! ← Проблема
   }
   
   // Исправь:
   try {
     await doSomething();
   } catch (error) {
     console.error('❌ Error:', error);
   }
   ```

3. **Проверь условия:**
   ```typescript
   const handlePress = () => {
     console.log('🔵 Button pressed!');
     console.log('📊 Conditions:', {
       isPending,
       isValid,
       hasData: !!data
     });
     
     // Какое условие false?
   };
   ```

---

### Сценарий 3: Всё логируется, но запрос не идёт

**Проверь React Query mutation:**

```typescript
const { mutate, isPending, error } = useCreateStory();

console.log('📊 Mutation state:', { isPending, error });

const handlePress = () => {
  console.log('🔵 Calling mutate...');
  
  mutate(data, {
    onSuccess: (response) => {
      console.log('✅ Success:', response);
    },
    onError: (error) => {
      console.error('❌ Error:', error);
    }
  });
};
```

---

## Шаг 5: Используй React DevTools

### Установка:

```bash
# Установи Flipper (один раз)
brew install --cask flipper

# Запусти
open /Applications/Flipper.app
```

### Использование:

1. Запусти Flipper
2. В приложении включи Debug (потряси iPad)
3. Flipper автоматически подключится
4. Во вкладке **React DevTools** смотри:
   - Дерево компонентов
   - Props компонентов
   - State компонентов
   - Hooks

**Проверь:**
- Рендерится ли твой компонент?
- Какие у него props?
- Какой state?
- Есть ли `disabled={true}`?

---

## Шаг 6: Проверь конкретные проблемы

### Проблема A: Кнопка визуально disabled

Найди в коде:
```typescript
<Button 
  disabled={isPending || isSubmitting || !isValid}
  //       ↑ Какое из этих true?
/>
```

Добавь лог:
```typescript
console.log('🎯 Button state:', {
  isPending,
  isSubmitting,
  isValid,
  disabled: isPending || isSubmitting || !isValid
});
```

---

### Проблема B: Async функция без await

```typescript
// ❌ Плохо
const handlePress = async () => {
  createStory(data);  // Забыли await!
  console.log('Done');  // Выполнится сразу, не дожидаясь
};

// ✅ Хорошо
const handlePress = async () => {
  await createStory(data);
  console.log('Done');  // Выполнится после завершения
};
```

---

### Проблема C: Event propagation stopped

```typescript
// Если кнопка внутри другого TouchableOpacity
<TouchableOpacity onPress={handleOuter}>
  <View>
    <TouchableOpacity onPress={handleInner}>
      {/* Может не работать! */}
    </TouchableOpacity>
  </View>
</TouchableOpacity>

// Исправь:
<TouchableOpacity onPress={handleOuter}>
  <View pointerEvents="box-none">  {/* ← Добавь это */}
    <TouchableOpacity onPress={handleInner}>
      {/* Теперь работает */}
    </TouchableOpacity>
  </View>
</TouchableOpacity>
```

---

## Быстрый тест: Простейшая кнопка

Добавь в самый верх твоего экрана:

```typescript
const TestScreen = () => {
  return (
    <View style={{ flex: 1 }}>
      {/* Тестовая кнопка */}
      <Button 
        title="TEST BUTTON" 
        onPress={() => {
          console.log('🔵🔵🔵 TEST BUTTON PRESSED!');
          alert('Button works!');
        }} 
      />
      
      {/* Остальной код */}
      {/* ... */}
    </View>
  );
};
```

**Если тестовая кнопка работает** → проблема в коде твоей основной кнопки  
**Если тестовая кнопка не работает** → что-то глобально не так (возможно весь View disabled)

---

## Полный пример отладочного кода

```typescript
import { useState } from 'react';
import { View, Text, TouchableOpacity, Button, Alert } from 'react-native';

const MyScreen = () => {
  console.log('🟢 MyScreen rendered');
  
  const [isLoading, setIsLoading] = useState(false);
  
  console.log('📊 State:', { isLoading });
  
  const handlePress = async () => {
    console.log('🔵 ===== BUTTON PRESSED =====');
    console.log('📊 Current state:', { isLoading });
    
    if (isLoading) {
      console.log('⚠️ Already loading, skipping');
      return;
    }
    
    try {
      console.log('⏳ Setting loading to true');
      setIsLoading(true);
      
      console.log('📤 Making API call...');
      const response = await fetch('https://magic-sleep-time.duckdns.org/api/v1/test');
      
      console.log('📥 Response status:', response.status);
      const data = await response.json();
      
      console.log('✅ Success! Data:', data);
      Alert.alert('Success!', JSON.stringify(data));
      
    } catch (error) {
      console.error('❌ Error caught:', error);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error stack:', error.stack);
      Alert.alert('Error!', error.message);
      
    } finally {
      console.log('🔄 Setting loading to false');
      setIsLoading(false);
      console.log('🏁 handlePress finished');
    }
  };
  
  console.log('🎯 About to render button, isLoading:', isLoading);
  
  return (
    <View style={{ flex: 1, padding: 20 }}>
      {/* Тестовая кнопка */}
      <Button 
        title="SIMPLE TEST" 
        onPress={() => {
          console.log('🟢🟢🟢 SIMPLE TEST PRESSED');
          Alert.alert('Test', 'Simple button works!');
        }}
      />
      
      <View style={{ height: 20 }} />
      
      {/* Основная кнопка */}
      <TouchableOpacity 
        onPress={handlePress}
        disabled={isLoading}
        style={{
          backgroundColor: isLoading ? '#ccc' : '#007AFF',
          padding: 15,
          borderRadius: 8,
          alignItems: 'center'
        }}
      >
        <Text style={{ color: 'white', fontWeight: 'bold' }}>
          {isLoading ? 'Loading...' : 'Click Me'}
        </Text>
      </TouchableOpacity>
      
      <Text style={{ marginTop: 20 }}>
        isLoading: {isLoading ? 'true' : 'false'}
      </Text>
    </View>
  );
};

export default MyScreen;
```

Вставь этот код вместо твоего экрана и проверь - работает ли хоть что-то?

---

## Чеклист отладки

- [ ] Добавил `console.log('🔵 Button pressed')` в начале обработчика
- [ ] Включил React Native Debugger (потряс iPad → Debug)
- [ ] Открыл Safari DevTools (Develop → iPad → JSContext)
- [ ] Нажал кнопку в приложении
- [ ] Посмотрел консоль - появляется ли `🔵 Button pressed`?
- [ ] Если не появляется - проверил `disabled={...}`
- [ ] Если появляется - проверил что дальше в логах
- [ ] Добавил логи во все условия и try-catch
- [ ] Проверил что mutation/query не в pending состоянии
- [ ] Создал тестовую простую кнопку - она работает?

---

## Резюме

**Самый эффективный способ:**

1. Добавь `console.log()` в КАЖДУЮ строчку обработчика
2. Включи React Native Debugger
3. Открой Safari Console
4. Нажми кнопку
5. Читай логи построчно - где останавливается?

**99% проблем найдутся этим способом!**

Если нужна помощь - скинь:
1. Код компонента с кнопкой
2. Что выводится в консоли при нажатии
3. Скриншот Safari DevTools Console
