# 🔍 Как посмотреть логи API на дроплете

## Быстрая команда (через SSH)

### Вариант 1: С локальной машины (рекомендуется)

```bash
# Последние 50 строк логов
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --tail 50"

# Последние 100 строк
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --tail 100"

# Последние 200 строк
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --tail 200"

# Follow (следить в реальном времени) - Ctrl+C для выхода
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api -f"

# Follow + последние 50 строк
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api -f --tail 50"
```

### Вариант 2: На дроплете (если уже подключены по SSH)

```bash
# Подключиться к дроплету
ssh root@167.172.102.75

# Перейти в директорию проекта
cd /var/www/kazka

# Посмотреть логи
docker compose -f docker-compose.prod.yml logs api --tail 50

# Follow (следить в реальном времени)
docker compose -f docker-compose.prod.yml logs api -f

# Follow с последними строками
docker compose -f docker-compose.prod.yml logs api -f --tail 100
```

---

## 📊 Все полезные команды для логов

### Просмотр логов

```bash
# Последние N строк
docker compose -f docker-compose.prod.yml logs api --tail 50

# Все логи (может быть очень много!)
docker compose -f docker-compose.prod.yml logs api

# Follow - следить в реальном времени (Ctrl+C для выхода)
docker compose -f docker-compose.prod.yml logs api -f

# Follow + последние 100 строк
docker compose -f docker-compose.prod.yml logs api -f --tail 100

# Логи за последний час
docker compose -f docker-compose.prod.yml logs api --since 1h

# Логи за последние 30 минут
docker compose -f docker-compose.prod.yml logs api --since 30m

# Логи с определенного времени
docker compose -f docker-compose.prod.yml logs api --since 2024-02-25T10:00:00
```

### Поиск в логах

```bash
# Найти ошибки
docker compose -f docker-compose.prod.yml logs api | grep -i error

# Найти определенный текст
docker compose -f docker-compose.prod.yml logs api | grep "story generation"

# Найти и вывести 5 строк до и после
docker compose -f docker-compose.prod.yml logs api | grep -C 5 "error"

# Найти с учетом регистра
docker compose -f docker-compose.prod.yml logs api | grep "ERROR"
```

### Сохранить логи в файл

```bash
# Сохранить все логи
docker compose -f docker-compose.prod.yml logs api > api_logs_$(date +%Y%m%d_%H%M%S).txt

# Сохранить последние 1000 строк
docker compose -f docker-compose.prod.yml logs api --tail 1000 > api_logs_last_1000.txt

# Сохранить с фильтром ошибок
docker compose -f docker-compose.prod.yml logs api | grep -i error > api_errors.txt
```

### Скачать логи на локальную машину

```bash
# С дроплета на локальную машину
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --tail 1000" > local_api_logs.txt

# Или через scp (если логи сохранены в файл на дроплете)
scp root@167.172.102.75:/var/www/kazka/api_logs.txt ./
```

---

## 🐳 Логи Docker контейнера напрямую

```bash
# Найти ID контейнера API
docker ps | grep kazka-api

# Посмотреть логи по ID контейнера
docker logs kazka-api-prod --tail 100

# Follow
docker logs kazka-api-prod -f

# С временным диапазоном
docker logs kazka-api-prod --since 1h --tail 200
```

---

## 📁 Логи в файлах (Volume)

API также записывает логи в volume `api_logs`, который смонтирован в `/app/services/api/logs`.

```bash
# Проверить, какие файлы логов существуют
docker exec kazka-api-prod ls -lh /app/services/api/logs

# Посмотреть лог-файл (если он существует)
docker exec kazka-api-prod cat /app/services/api/logs/app.log

# Tail лог-файла
docker exec kazka-api-prod tail -f /app/services/api/logs/app.log

# Скопировать лог-файл с дроплета
docker cp kazka-api-prod:/app/services/api/logs/app.log ./api_app.log
```

---

## 🔥 Логи в реальном времени (для отладки)

### Следить за логами во время деплоя

```bash
# В одном терминале запустить follow логов
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api -f"

# В другом терминале сделать деплой
./scripts/deploy-api.sh
```

### Следить за логами при генерации истории

```bash
# Запустить follow логов
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api -f --tail 10"

# В браузере создать историю
# Логи будут отображаться в реальном времени
```

---

## 📋 Логи всех сервисов

```bash
# Все контейнеры
docker compose -f docker-compose.prod.yml logs

# API + Postgres
docker compose -f docker-compose.prod.yml logs api postgres

# API + Nginx
docker compose -f docker-compose.prod.yml logs api nginx

# Follow для всех
docker compose -f docker-compose.prod.yml logs -f
```

---

## 🛠️ Полезные алиасы (добавить в ~/.bashrc или ~/.zshrc)

```bash
# Добавить в ваш .bashrc/.zshrc
alias klogs='ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --tail 100"'
alias klogsf='ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api -f --tail 50"'
alias kerrors='ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api" | grep -i error'
alias kssh='ssh root@167.172.102.75'

# После добавления:
source ~/.bashrc  # или source ~/.zshrc

# Теперь можно использовать:
klogs      # Последние 100 строк
klogsf     # Follow
kerrors    # Только ошибки
kssh       # SSH на дроплет
```

---

## 🔍 Частые сценарии

### Проверить, запустился ли API после деплоя

```bash
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --tail 30 | grep 'Server running'"
```

### Найти последние ошибки

```bash
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --tail 500" | grep -i error | tail -20
```

### Проверить health check

```bash
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api" | grep health
```

### Посмотреть API запросы (Morgan логи)

```bash
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api -f" | grep "GET\|POST\|PUT\|DELETE"
```

### Отладка генерации историй

```bash
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api -f" | grep "story\|generation"
```

---

## 🚨 Проблемы и решения

### Логи не показываются

```bash
# Проверить, работает ли контейнер
ssh root@167.172.102.75 "docker ps | grep kazka-api"

# Если не работает, посмотреть почему
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml ps"

# Проверить статус
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --tail 100"
```

### Слишком много логов

```bash
# Ограничить количество строк
docker compose -f docker-compose.prod.yml logs api --tail 50

# Фильтровать только важное
docker compose -f docker-compose.prod.yml logs api | grep -i "error\|warn"

# Искать по временному диапазону
docker compose -f docker-compose.prod.yml logs api --since 10m
```

### Очистить старые логи (если Docker использует много места)

```bash
# НЕ РЕКОМЕНДУЕТСЯ часто делать!
# Это удалит все логи всех контейнеров

# Проверить размер логов
docker ps -q | xargs docker inspect --format='{{.Name}} {{.LogPath}}' | xargs ls -lh

# Очистить (ОСТОРОЖНО!)
# truncate -s 0 $(docker inspect --format='{{.LogPath}}' kazka-api-prod)
```

---

## 📊 Информация о конфигурации

**Дроплет:**
- IP: `167.172.102.75`
- User: `root`
- Path: `/var/www/kazka`

**Docker:**
- Container: `kazka-api-prod`
- Compose file: `docker-compose.prod.yml`
- Logs volume: `api_logs` → `/app/services/api/logs`

**API:**
- Port: `3000`
- Health: `https://magic-sleep-time.duckdns.org/health`
- Environment: `production`

---

## 📚 Дополнительные ресурсы

- [Docker Compose Logs Documentation](https://docs.docker.com/compose/reference/logs/)
- [Docker Logs Command](https://docs.docker.com/engine/reference/commandline/logs/)

---

**Самая полезная команда для начала:**

```bash
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api -f --tail 100"
```

Это подключится к дроплету и покажет последние 100 строк логов API с автоматическим обновлением в реальном времени. Нажмите `Ctrl+C` для выхода.
