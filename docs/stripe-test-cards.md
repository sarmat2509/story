# Тестовые карты Stripe

> Источник: [Stripe Testing Documentation](https://stripe.com/docs/testing)  
> Используйте **test API keys** (`sk_test_...`, `pk_test_...`) — реальные средства не списываются.

## Общие правила

- **CVC:** любые 3 цифры (4 для American Express)
- **Дата:** любая будущая дата (например, 12/34)
- **Не используйте реальные карты** в live mode — это запрещено Stripe Services Agreement

---

## Успешные платежи по бренду

| Бренд | Номер карты | CVC | Дата |
|-------|-------------|-----|------|
| Visa | 4242 4242 4242 4242 | Any 3 digits | Any future date |
| Visa (debit) | 4000 0566 5566 5556 | Any 3 digits | Any future date |
| Mastercard | 5555 5555 5555 4444 | Any 3 digits | Any future date |
| Mastercard (2-series) | 2223 0031 2200 3222 | Any 3 digits | Any future date |
| Mastercard (debit) | 5200 8282 8282 8210 | Any 3 digits | Any future date |
| Mastercard (prepaid) | 5105 1051 0510 5100 | Any 3 digits | Any future date |
| American Express | 3782 822463 10005 | Any 4 digits | Any future date |
| American Express | 3714 496353 98431 | Any 4 digits | Any future date |
| Discover | 6011 1111 1111 1117 | Any 3 digits | Any future date |
| Discover | 6011 0009 9013 9424 | Any 3 digits | Any future date |
| JCB | 3566 0020 2036 0505 | Any 3 digits | Any future date |
| UnionPay | 6200 0000 0000 0005 | Any 3 digits | Any future date |
| Diners Club | 3056 9300 0902 0004 | Any 3 digits | Any future date |

### PaymentMethods (для API)

| Бренд | PaymentMethod |
|-------|---------------|
| Visa | `pm_card_visa` |
| Visa (debit) | `pm_card_visa_debit` |
| Mastercard | `pm_card_mastercard` |
| American Express | `pm_card_amex` |
| Discover | `pm_card_discover` |
| JCB | `pm_card_jcb` |
| UnionPay | `pm_card_unionpay` |

---

## Отклонённые платежи (declines)

| Описание | Номер карты | Error code |
|----------|-------------|------------|
| Generic decline | 4000 0000 0000 0002 | `card_declined` |
| Insufficient funds | 4000 0000 0000 9995 | `card_declined` |
| Lost card | 4000 0000 0000 9987 | `card_declined` |
| Stolen card | 4000 0000 0000 9979 | `card_declined` |
| Expired card | 4000 0000 0000 0069 | `expired_card` |
| Incorrect CVC | 4000 0000 0000 0127 | `incorrect_cvc` |
| Processing error | 4000 0000 0000 0119 | `processing_error` |
| Incorrect number | 4242 4242 4242 4241 | `incorrect_number` |
| Velocity limit exceeded | 4000 0000 0000 6975 | `card_declined` |
| Decline after attaching | 4000 0000 0000 0341 | Attach succeeds, charge fails |

### PaymentMethods (declines)

| Описание | PaymentMethod |
|----------|---------------|
| Generic decline | `pm_card_visa_chargeDeclined` |
| Insufficient funds | `pm_card_visa_chargeDeclinedInsufficientFunds` |
| Expired card | `pm_card_chargeDeclinedExpiredCard` |
| Incorrect CVC | `pm_card_chargeDeclinedIncorrectCvc` |
| Processing error | `pm_card_chargeDeclinedProcessingError` |

---

## Fraud prevention (Radar)

| Описание | Номер карты |
|----------|-------------|
| Always blocked | 4100 0000 0000 0019 |
| Highest risk | 4000 0000 0000 4954 |
| Elevated risk | 4000 0000 0000 9235 |
| CVC check fails | 4000 0000 0000 0101 |
| Postal code check fails | 4000 0000 0000 0036 |
| Adaptive 3DS | 4000 0084 0560 0003 |

---

## Карты по странам (успешные)

| Страна | Номер | Бренд |
|--------|-------|-------|
| United States (US) | 4242 4242 4242 4242 | Visa |
| Germany (DE) | 4000 0027 6000 0016 | Visa |
| France (FR) | 4000 0025 0000 0003 | Visa |
| United Kingdom (GB) | 4000 0082 6000 0000 | Visa |
| Poland (PL) | 4000 0616 0000 0005 | Visa |
| Canada (CA) | 4000 0124 0000 0000 | Visa |
| Brazil (BR) | 4000 0076 0000 0002 | Visa |
| India (IN) | 4000 0356 0000 0008 | Visa |
| Japan (JP) | 4000 0392 0000 0003 | Visa |
| Australia (AU) | 4000 0036 0000 0006 | Visa |

---

## 3D Secure (SCA)

| Описание | Номер карты |
|----------|-------------|
| Always requires authentication | 4000 0027 6000 0016 |
| Requires authentication, succeeds | 4000 0025 0000 0003 |
| Authentication fails | 4000 0000 0000 3220 |

---

## Disputes (тест споров)

| Описание | Номер карты |
|----------|-------------|
| Fraudulent | 4000 0000 0000 0259 |
| Product not received | 4000 0000 0000 2685 |
| Inquiry | 4000 0000 0000 1976 |

---

## Невалидные данные (без спец. карты)

- **incorrect_number:** `4242 4242 4242 4241` (не проходит Luhn check)
- **invalid_cvc:** 2 цифры (например, 99)
- **invalid_expiry_year:** год 50+ лет назад (например, 95)
- **invalid_expiry_month:** месяц 13

---

## Тест локации (Checkout)

Для теста валюты/локали в Checkout используйте email с суффиксом:

```
test+location_UA@example.com   → Украина (UAH)
test+location_FR@example.com   → Франция (EUR)
test+location_GB@example.com   → UK (GBP)
```

`XX` — двухбуквенный ISO код страны.
