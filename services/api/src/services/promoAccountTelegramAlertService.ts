import { logger } from '../utils/logger';

const TELEGRAM_TIMEOUT_MS = 10_000;

type PromoActivationAlert = {
  email: string;
  displayName: string | null;
  expiresAt: Date;
  reservedStories: number;
};

function telegramConfig() {
  return {
    token:
      process.env.PROMO_ALERT_TELEGRAM_BOT_TOKEN ||
      process.env.ADMIN_ALERT_TELEGRAM_BOT_TOKEN ||
      process.env.OPS_ALERT_TELEGRAM_BOT_TOKEN ||
      process.env.TELEGRAM_BOT_TOKEN ||
      '',
    chatId:
      process.env.PROMO_ALERT_TELEGRAM_CHAT_ID ||
      process.env.ADMIN_ALERT_TELEGRAM_CHAT_ID ||
      process.env.OPS_ALERT_TELEGRAM_CHAT_ID ||
      process.env.TELEGRAM_CHAT_ID ||
      '',
  };
}

export function buildPromoActivationTelegramMessage(alert: PromoActivationAlert): string {
  const name = alert.displayName?.trim() || alert.email;
  return [
    '🎟️ WonderTales · Promo activated',
    `Account: ${name}`,
    `Login: ${alert.email}`,
    `Stories available: ${alert.reservedStories}`,
    `Access ends: ${alert.expiresAt.toISOString()}`,
  ].join('\n');
}

/** Best-effort operational alert. A notification failure must not block login. */
export async function notifyPromoAccountActivated(alert: PromoActivationAlert): Promise<void> {
  const { token, chatId } = telegramConfig();
  if (!token || !chatId) {
    logger.warn({ email: alert.email }, 'Promo activation Telegram alert skipped: not configured');
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildPromoActivationTelegramMessage(alert),
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Telegram API returned HTTP ${response.status}`);
    }
  } catch (err) {
    logger.error({ err, email: alert.email }, 'Failed to send promo activation Telegram alert');
  } finally {
    clearTimeout(timeout);
  }
}
