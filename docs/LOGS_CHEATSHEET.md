# 📋 Шпаргалка: Логи API на дроплете

## 🚀 Самые нужные команды

### Последние 50 строк логов
```bash
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --tail 50"
```

### Следить в реальном времени (для отладки)
```bash
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api -f --tail 50"
```
Нажмите `Ctrl+C` для выхода

### Найти ошибки
```bash
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --tail 500" | grep -i error
```

### Логи за последний час
```bash
ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --since 1h"
```

---

## 🔧 На самом дроплете

Если вы уже подключились: `ssh root@167.172.102.75`

```bash
cd /var/www/kazka

# Последние логи
docker compose -f docker-compose.prod.yml logs api --tail 50

# Follow
docker compose -f docker-compose.prod.yml logs api -f

# Проверить статус
docker compose -f docker-compose.prod.yml ps

# Перезапустить API
docker compose -f docker-compose.prod.yml restart api
```

---

## ⚡ Алиасы (добавить в ~/.zshrc)

```bash
alias klogs='ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api --tail 100"'
alias klogsf='ssh root@167.172.102.75 "cd /var/www/kazka && docker compose -f docker-compose.prod.yml logs api -f --tail 50"'
alias kssh='ssh root@167.172.102.75'
```

После добавления: `source ~/.zshrc`

Использование:
- `klogs` - последние 100 строк
- `klogsf` - follow режим
- `kssh` - подключиться к дроплету

---

## 📖 Полная документация

См. [DROPLET_LOGS_GUIDE.md](./DROPLET_LOGS_GUIDE.md) для всех команд и сценариев.

---

**Дроплет:** 167.172.102.75  
**Путь:** /var/www/kazka  
**Контейнер:** kazka-api-prod
