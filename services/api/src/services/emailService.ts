import { Resend } from 'resend';
import ukTranslations from '@wondertales/shared/i18n/uk.json';
import ruTranslations from '@wondertales/shared/i18n/ru.json';
import enTranslations from '@wondertales/shared/i18n/en.json';
import esTranslations from '@wondertales/shared/i18n/es.json';
import frTranslations from '@wondertales/shared/i18n/fr.json';
import deTranslations from '@wondertales/shared/i18n/de.json';
import config from '../config';
import { logger } from '../utils/logger';

let resendClient: Resend | null = null;
const SUPPORTED_EMAIL_LOCALES = ['uk', 'en', 'ru', 'de', 'es', 'fr'] as const;

type SupportedEmailLocale = (typeof SUPPORTED_EMAIL_LOCALES)[number];
type SignupMethod = 'password' | 'google' | 'apple';

interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

interface TransactionalEmailOptions extends EmailContent {
  to: string;
  logContext: Record<string, unknown>;
  successMessage: string;
  failureMessage: string;
}

interface WelcomeEmailRecipient {
  email: string;
  displayName?: string | null;
  preferredLocale?: string | null;
}

interface WelcomeEmailOptions {
  signupMethod: SignupMethod;
}

interface WelcomeEmailCopy {
  subject: string;
  preview: string;
  greeting: string;
  intro: Record<SignupMethod, string>;
  cta: string;
  tips_title: string;
  tips: string[];
  security_title: string;
  security_body: Record<SignupMethod, string>;
  footer: string;
}

interface PasswordResetEmailCopy {
  subject: string;
  preview: string;
  intro: string;
  cta: string;
  expires_notice: string;
  ignore_notice: string;
  footer: string;
}

interface TranslationShape {
  transactional_emails?: {
    welcome?: WelcomeEmailCopy;
    password_reset?: PasswordResetEmailCopy;
  };
}

const TRANSLATIONS: Record<SupportedEmailLocale, TranslationShape> = {
  uk: ukTranslations as TranslationShape,
  en: enTranslations as TranslationShape,
  ru: ruTranslations as TranslationShape,
  de: deTranslations as TranslationShape,
  es: esTranslations as TranslationShape,
  fr: frTranslations as TranslationShape,
};

function getResend(): Resend | null {
  if (!config.email.resendApiKey) {
    logger.warn('RESEND_API_KEY not set - email sending disabled');
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(config.email.resendApiKey);
  }
  return resendClient;
}

function normalizeLocale(locale?: string | null): SupportedEmailLocale {
  const normalized = locale?.slice(0, 2).toLowerCase();
  return (
    SUPPORTED_EMAIL_LOCALES.find((supportedLocale) => supportedLocale === normalized) ??
    'en'
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getRecipientName(displayName?: string | null): string {
  const trimmed = displayName?.trim();
  return trimmed ? escapeHtml(trimmed) : 'there';
}

function getWelcomeEmailCopy(locale: SupportedEmailLocale): WelcomeEmailCopy {
  const copy = TRANSLATIONS[locale]?.transactional_emails?.welcome;
  const fallbackCopy = TRANSLATIONS.en?.transactional_emails?.welcome;

  if (copy) {
    return copy;
  }

  if (fallbackCopy) {
    logger.warn({ locale }, 'Welcome email translations missing, falling back to English');
    return fallbackCopy;
  }

  throw new Error('Welcome email translations missing');
}

function getPasswordResetEmailCopy(locale: SupportedEmailLocale): PasswordResetEmailCopy {
  const copy = TRANSLATIONS[locale]?.transactional_emails?.password_reset;
  const fallbackCopy = TRANSLATIONS.en?.transactional_emails?.password_reset;

  if (copy) {
    return copy;
  }

  if (fallbackCopy) {
    logger.warn({ locale }, 'Password reset email translations missing, falling back to English');
    return fallbackCopy;
  }

  throw new Error('Password reset email translations missing');
}

async function sendTransactionalEmail(options: TransactionalEmailOptions): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logger.warn(options.logContext, `Skipping email - Resend not configured`);
    return;
  }

  const { error } = await resend.emails.send({
    from: config.email.fromEmail,
    to: [options.to],
    subject: options.subject,
    html: options.html,
    text: options.text,
  });

  if (error) {
    logger.error({ err: error, ...options.logContext }, options.failureMessage);
    throw new Error(options.failureMessage);
  }

  logger.info(options.logContext, options.successMessage);
}

function buildWelcomeEmail(
  recipient: WelcomeEmailRecipient,
  options: WelcomeEmailOptions
): EmailContent {
  const locale = normalizeLocale(recipient.preferredLocale);
  const copy = getWelcomeEmailCopy(locale);
  const appUrl = config.web.webAppUrl;
  const safeName = getRecipientName(recipient.displayName);
  const tipsHtml = copy.tips
    .map((tip) => `<li style="margin: 0 0 10px;">${escapeHtml(tip)}</li>`)
    .join('');
  const tipsText = copy.tips.map((tip) => `- ${tip}`).join('\n');
  const previewText = escapeHtml(copy.preview);
  const securityBody = copy.security_body[options.signupMethod];
  const intro = copy.intro[options.signupMethod];

  return {
    subject: copy.subject,
    text: [
      copy.greeting,
      '',
      intro,
      '',
      copy.tips_title,
      tipsText,
      '',
      `${copy.cta}: ${appUrl}`,
      '',
      `${copy.security_title}: ${securityBody}`,
      '',
      copy.footer,
    ].join('\n'),
    html: `
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
        ${previewText}
      </div>
      <div style="margin:0;padding:24px 12px;background:#f4efe6;font-family:Arial,sans-serif;color:#1f2937;">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #eadfcd;">
          <div style="padding:32px;background:linear-gradient(135deg,#f6d8a8 0%,#f4efe6 100%);">
            <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#7c5a2d;margin-bottom:12px;">
              WonderTales
            </div>
            <h1 style="margin:0;font-size:28px;line-height:1.2;color:#1f2937;">
              ${escapeHtml(copy.greeting)}
            </h1>
            <p style="margin:16px 0 0;font-size:16px;line-height:1.6;color:#374151;">
              ${escapeHtml(intro)}
            </p>
          </div>

          <div style="padding:32px;">
            <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#374151;">
              ${safeName !== 'there' ? `${safeName}, ` : ''}${previewText}
            </p>

            <div style="margin:24px 0;">
              <a
                href="${escapeHtml(appUrl)}"
                style="display:inline-block;background:#1f2937;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:600;"
              >
                ${escapeHtml(copy.cta)}
              </a>
            </div>

            <h2 style="margin:0 0 12px;font-size:18px;color:#1f2937;">
              ${escapeHtml(copy.tips_title)}
            </h2>
            <ul style="padding-left:20px;margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
              ${tipsHtml}
            </ul>

            <div style="padding:16px 18px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;">
              <strong style="display:block;margin-bottom:8px;color:#111827;">
                ${escapeHtml(copy.security_title)}
              </strong>
              <span style="font-size:14px;line-height:1.6;color:#4b5563;">
                ${escapeHtml(securityBody)}
              </span>
            </div>
          </div>

          <div style="padding:20px 32px;border-top:1px solid #f3f4f6;font-size:12px;line-height:1.6;color:#6b7280;">
            ${escapeHtml(copy.footer)}
          </div>
        </div>
      </div>
    `,
  };
}

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
  preferredLocale?: string | null
): Promise<void> {
  const locale = normalizeLocale(preferredLocale);
  const copy = getPasswordResetEmailCopy(locale);
  const previewText = escapeHtml(copy.preview);

  await sendTransactionalEmail({
    to,
    logContext: { to, type: 'password-reset', locale },
    successMessage: 'Password reset email sent',
    failureMessage: 'Failed to send password reset email',
    subject: copy.subject,
    text: [
      copy.intro,
      '',
      `${copy.cta}: ${resetLink}`,
      '',
      copy.expires_notice,
      '',
      copy.ignore_notice,
      '',
      copy.footer,
    ].join('\n'),
    html: `
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
        ${previewText}
      </div>
      <div style="margin:0;padding:24px 12px;background:#f4efe6;font-family:Arial,sans-serif;color:#1f2937;">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #eadfcd;">
          <div style="padding:32px;background:linear-gradient(135deg,#dbeafe 0%,#f8fafc 100%);">
            <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#1d4ed8;margin-bottom:12px;">
              WonderTales
            </div>
            <h1 style="margin:0;font-size:28px;line-height:1.2;color:#1f2937;">
              ${escapeHtml(copy.subject)}
            </h1>
            <p style="margin:16px 0 0;font-size:16px;line-height:1.6;color:#374151;">
              ${escapeHtml(copy.intro)}
            </p>
          </div>

          <div style="padding:32px;">
            <div style="margin:0 0 24px;">
              <a
                href="${escapeHtml(resetLink)}"
                style="display:inline-block;background:#1f2937;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:600;"
              >
                ${escapeHtml(copy.cta)}
              </a>
            </div>

            <div style="padding:16px 18px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;margin-bottom:16px;">
              <span style="font-size:14px;line-height:1.6;color:#4b5563;">
                ${escapeHtml(copy.expires_notice)}
              </span>
            </div>

            <div style="padding:16px 18px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;">
              <span style="font-size:14px;line-height:1.6;color:#4b5563;">
                ${escapeHtml(copy.ignore_notice)}
              </span>
            </div>
          </div>

          <div style="padding:20px 32px;border-top:1px solid #f3f4f6;font-size:12px;line-height:1.6;color:#6b7280;">
            ${escapeHtml(copy.footer)}
          </div>
        </div>
      </div>
    `,
  });
}

export async function sendWelcomeEmail(
  recipient: WelcomeEmailRecipient,
  options: WelcomeEmailOptions
): Promise<void> {
  const content = buildWelcomeEmail(recipient, options);

  await sendTransactionalEmail({
    to: recipient.email,
    logContext: {
      to: recipient.email,
      type: 'welcome',
      locale: normalizeLocale(recipient.preferredLocale),
      signupMethod: options.signupMethod,
    },
    successMessage: 'Welcome email sent',
    failureMessage: 'Failed to send welcome email',
    ...content,
  });
}

export function enqueueWelcomeEmail(
  recipient: WelcomeEmailRecipient,
  options: WelcomeEmailOptions
): void {
  void sendWelcomeEmail(recipient, options).catch((error) => {
    logger.error(
      {
        err: error,
        to: recipient.email,
        type: 'welcome',
        signupMethod: options.signupMethod,
      },
      'Welcome email delivery failed'
    );
  });
}
