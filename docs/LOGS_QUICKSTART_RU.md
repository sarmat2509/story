# 🚀 Быстрый старт: Логи API на продакшене

## 📋 Самые нужные команды

### 1️⃣ Последние 50 строк логов

```bash
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --tail 50"
```

**Что это делает:** Показывает последние 50 строк логов API на продакшене

---

### 2️⃣ Следить за логами в реальном времени

```bash
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api -f --tail 50"
```

**Что это делает:** Показывает логи и продолжает обновлять их в реальном времени  
**Как остановить:** Нажми `Ctrl + C`

---

### 3️⃣ Найти ошибки

```bash
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --tail 500" | grep -i error
```

**Что это делает:** Ищет слово "error" в последних 500 строках логов

---

### 4️⃣ Логи за последний час

```bash
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --since 1h"
```

**Что это делает:** Показывает все логи за последний час

---

## 🛠️ Удобный скрипт (рекомендуется)

### Использование скрипта

```bash
# Просто посмотреть логи
./scripts/view-logs.sh

# Следить в реальном времени
./scripts/view-logs.sh -f

# Последние 200 строк
./scripts/view-logs.sh -n 200

# Только ошибки
./scripts/view-logs.sh -e

# Помощь
./scripts/view-logs.sh --help
```

---

## ⚡ Настрой алиасы (один раз)

### Добавь в ~/.zshrc

```bash
# Открой файл
nano ~/.zshrc

# Добавь эти строки в конец файла:
alias klogs='ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --tail 100"'
alias klogsf='ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api -f --tail 50"'
alias kssh='ssh root@167.172.102.75'

# Сохрани (Ctrl+O, Enter, Ctrl+X)

# Перезагрузи конфиг
source ~/.zshrc
```

### Теперь используй короткие команды

```bash
klogs      # Последние 100 строк
klogsf     # Follow (следить в реальном времени)
kssh       # Подключиться к дроплету
```

---

## 🔍 Сценарии использования

### Проверить, работает ли API после деплоя

```bash
# Сделай деплой
./scripts/deploy-api.sh

# Сразу посмотри логи (они показываются автоматически)
```

### Отследить генерацию истории

```bash
# Запусти в терминале
./scripts/view-logs.sh -f

# Теперь создай историю в приложении
# Логи будут показываться в реальном времени
```

### Найти последние ошибки

```bash
./scripts/view-logs.sh -e
```

### Сохранить логи в файл

```bash
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --tail 1000" > api_logs_$(date +%Y%m%d_%H%M%S).txt
```

---

## 🆘 Что делать если...

### Не работает SSH

```bash
# Проверь подключение
ping 167.172.102.75

# Проверь SSH
ssh -v root@167.172.102.75
```

### API не отвечает

```bash
# Проверь статус контейнера
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml ps"

# Посмотри логи
./scripts/view-logs.sh -n 100

# Перезапусти API
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml restart api"
```

### Слишком много логов

```bash
# Ограничь количество строк
./scripts/view-logs.sh -n 50

# Смотри только последний час
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --since 1h"
```

---

## 📖 Полная документация

- **[DROPLET_LOGS_GUIDE.md](./DROPLET_LOGS_GUIDE.md)** - Полное руководство (на английском)
- **[LOGS_CHEATSHEET.md](./LOGS_CHEATSHEET.md)** - Шпаргалка по командам

---

## 📍 Информация о сервере

- **IP:** 167.172.102.75
- **Путь:** /var/www/kazka
- **Контейнер:** kazka-api-prod
- **URL:** https://magic-sleep-time.duckdns.org
- **Health check:** https://magic-sleep-time.duckdns.org/health/health

---

## 💡 Совет

**Добавь в закладки эту страницу** - в ней есть все самые нужные команды для работы с логами!

Самая полезная команда для старта:

```bash
./scripts/view-logs.sh -f
```

Запусти её в терминале и оставь работать - будешь видеть все запросы и ошибки в реальном времени! 🎉
