# Fix Progress Display - Summary

## Проблемы

1. ❌ **Попап показывал "Обробляємо запит..." вместо конкретных этапов**
   - Фронтенд не использовал `progressData.activeTasks` для определения текущего шага
   
2. ❌ **overallProgress = 0 в progressData**
   - Бэкенд вычислял `overallProgress`, но не сохранял его в объект `progressData`
   - В API возвращалось: `progress: 86` (правильно), но `progressData.overallProgress: 0` (неправильно)

## Решение

### Backend (`services/api/src/services/storyProgress.ts`)

Добавлена строка для сохранения `overallProgress` в объект `progressData`:

```typescript
// Calculate overall progress
const overallProgress = calculateOverallProgress(
  currentProgress.completedTasks,
  currentProgress.activeTasks
);

// ✅ ДОБАВЛЕНО: Update overall progress in the object
currentProgress.overallProgress = overallProgress;

// Save with atomic update
await tx.update(storyRequests).set({
  progressData: currentProgress,  // Теперь содержит правильный overallProgress
  progress: overallProgress,
  updatedAt: new Date(),
})
```

### Frontend

#### 1. Обновлен интерфейс модала (`GenerationProgressModal.tsx`)

**До:**
```typescript
interface Props {
  status: 'pending' | 'generating_outline' | 'generating_text' | 'policy_check' | 'completed' | 'failed';
  progress: number;
}
```

**После:**
```typescript
interface Props {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  progressData?: {
    activeTasks: Array<{ task: string; progress: number }>;
    completedTasks: string[];
    overallProgress: number;
  };
}
```

#### 2. Добавлена функция маппинга тасков на украинские надписи

```typescript
const getTaskLabel = (task: string) => {
  const labels: Record<string, string> = {
    'generating_outline': 'Створюємо сюжет...',
    'generating_text': 'Пишемо текст...',
    'validating': 'Перевіряємо безпечність контенту...',
    'generating_portraits': 'Малюємо персонажів...',
    'generating_images': 'Створюємо ілюстрації...',
    'generating_audio': 'Озвучуємо історію...',
  };
  return labels[task] || 'Обробляємо запит...';
};
```

#### 3. Обновлена логика отображения статуса

```typescript
const getStatusText = () => {
  if (status === 'pending') {
    return 'Додаємо історію до черги...';
  }
  if (status === 'processing' && progressData?.activeTasks?.[0]) {
    return getTaskLabel(progressData.activeTasks[0].task);  // ✅ Динамический текст!
  }
  if (status === 'completed') {
    return 'Готово! 🎉';
  }
  if (status === 'failed') {
    return errorMessage || 'Виникла помилка';
  }
  return 'Обробляємо запит...';
};
```

#### 4. Обновлено отображение прогресса

```typescript
const getProgressPercentage = () => {
  if (status === 'completed') return 100;
  if (status === 'failed') return 0;
  // ✅ Используем progressData.overallProgress если доступен
  return progressData?.overallProgress ?? progress;
};
```

#### 5. Обновлен тип StoryStatus (`api/stories.ts`)

```typescript
interface StoryStatus {
  status: string;
  progress: number;
  progressData?: {
    activeTasks: Array<{ task: string; progress: number; details?: any }>;
    completedTasks: string[];
    overallProgress: number;
  };
  storyId?: string | null;
  errorMessage?: string | null;
  createdAt?: string;
}
```

#### 6. Передан progressData в модал (`WizardScreen.tsx`)

```typescript
<GenerationProgressModal
  visible={isGenerating}
  status={storyStatus?.status || 'pending'}
  progress={storyStatus?.progress || 0}
  progressData={storyStatus?.progressData}  // ✅ Добавлено!
  errorMessage={storyStatus?.errorMessage}
  onClose={...}
  onRetry={...}
/>
```

## Результат

### До

```
Попап: "Обробляємо запит..."
Прогресс: 86%
API Response: {
  progress: 86,
  progressData: {
    activeTasks: [{ task: "validating", progress: 0 }],
    overallProgress: 0  ❌ Неправильно!
  }
}
```

### После

```
Попап: "Перевіряємо безпечність контенту..."  ✅ Динамически меняется!
Прогресс: 86%
API Response: {
  progress: 86,
  progressData: {
    activeTasks: [{ task: "validating", progress: 0 }],
    overallProgress: 86  ✅ Правильно!
  }
}
```

## Пример динамических надписей

| Task | Украинская надпись |
|------|-------------------|
| `generating_outline` | Створюємо сюжет... |
| `generating_text` | Пишемо текст... |
| `validating` | Перевіряємо безпечність контенту... |
| `generating_portraits` | Малюємо персонажів... |
| `generating_images` | Створюємо ілюстрації... |
| `generating_audio` | Озвучуємо історію... |

## Измененные файлы

1. ✅ `services/api/src/services/storyProgress.ts` - Fix overallProgress in progressData
2. ✅ `apps/universal-app/src/components/GenerationProgressModal.tsx` - Dynamic task labels
3. ✅ `apps/universal-app/src/screens/wizard/WizardScreen.tsx` - Pass progressData to modal
4. ✅ `apps/universal-app/src/api/stories.ts` - Update StoryStatus interface

## Тестирование

Создайте новую историю и проверьте, что:
- ✅ Попап показывает правильные надписи для каждого шага
- ✅ Прогресс увеличивается плавно от 0% до 100%
- ✅ `progressData.overallProgress` совпадает с `progress`
