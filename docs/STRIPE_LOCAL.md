# Stripe — локальная разработка

## 1. Установка Stripe CLI

```bash
brew install stripe/stripe-cli/stripe
```

## 2. Авторизация

```bash
stripe login
```

Откроется браузер — войдите в Stripe. CLI привяжется к вашему аккаунту.

## 3. Настройка .env.local

Используйте **Test mode** ключи из [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys):

```env
STRIPE_SECRET_KEY=sk_test_xxxxxxxx
STRIPE_PRICE_IDS=silver:price_xxx,golden:price_yyy,fairyworld:price_zzz
ENABLE_REAL_PAYMENTS=true
WEB_APP_URL=http://localhost:8081
```

**STRIPE_WEBHOOK_SECRET** — см. шаг 5 (берётся из вывода `stripe listen`).

## 4. Запуск

**Терминал 1 — API:**
```bash
pnpm docker:dev
# или: pnpm dev:api (если API без Docker)
```

**Терминал 2 — Stripe Listen:**
```bash
pnpm stripe:listen
```

## 5. Обновить STRIPE_WEBHOOK_SECRET

После запуска `pnpm stripe:listen` в консоли появится:

```
Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

Скопируйте этот `whsec_...` в `.env.local`:

```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

Перезапустите API, чтобы подхватить новый secret.

## 6. Тест оплаты

1. Откройте приложение (http://localhost:8081)
2. Войдите в аккаунт
3. Plans → выберите план → «Оплатить»
4. В Stripe Checkout используйте тестовую карту: **4242 4242 4242 4242**
5. Любая будущая дата, любой CVC (123)
6. После оплаты webhook придёт через CLI → подписка обновится в БД

## Важно

- `stripe listen` работает только с **Test mode**
- Каждый запуск `stripe listen` выдаёт один и тот же secret (пока не перелогинились)
- Если API в Docker — `localhost:3000` доступен с хоста (порт проброшен)
