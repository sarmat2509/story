import crypto from 'crypto';
import { Resend } from 'resend';
import { LOCALE_IDS, Locale } from '@wondertales/shared';
import ukTranslations from '@wondertales/shared/i18n/uk.json';
import ruTranslations from '@wondertales/shared/i18n/ru.json';
import enTranslations from '@wondertales/shared/i18n/en.json';
import esTranslations from '@wondertales/shared/i18n/es.json';
import frTranslations from '@wondertales/shared/i18n/fr.json';
import deTranslations from '@wondertales/shared/i18n/de.json';
import plTranslations from '@wondertales/shared/i18n/pl.json';
import config from '../config';
import { logger } from '../utils/logger';
import {
  renderTransactionalEmail,
  type TransactionalEmailContent,
} from './transactionalEmailRenderer';

let resendClient: Resend | null = null;
const SUPPORTED_EMAIL_LOCALES = LOCALE_IDS;

type SupportedEmailLocale = Locale;
type SignupMethod = 'password' | 'google' | 'apple';

type EmailContent = TransactionalEmailContent;

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

export interface SafeEmailLogContext {
  recipientDomain: string;
  recipientHash: string;
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
  pl: plTranslations as TranslationShape,
};

export function buildSafeEmailLogContext(email: string): SafeEmailLogContext {
  const normalizedEmail = email.trim().toLowerCase();
  const atIndex = normalizedEmail.lastIndexOf('@');
  const recipientDomain =
    atIndex >= 0 && normalizedEmail.slice(atIndex + 1).length > 0
      ? normalizedEmail.slice(atIndex + 1)
      : 'invalid';

  return {
    recipientDomain,
    recipientHash: crypto
      .createHash('sha256')
      .update(normalizedEmail)
      .digest('hex')
      .slice(0, 16),
  };
}

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
    replyTo: config.web.supportEmail,
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
  const securityBody = copy.security_body[options.signupMethod];
  const intro = copy.intro[options.signupMethod];
  const displayName = recipient.displayName?.trim();

  return renderTransactionalEmail({
    subject: copy.subject,
    preview: copy.preview,
    title: copy.greeting,
    intro: displayName ? `${displayName}, ${intro}` : intro,
    action: {
      label: copy.cta,
      url: appUrl,
    },
    sections: [
      {
        title: copy.tips_title,
        items: copy.tips,
        tone: 'warm',
      },
      {
        title: copy.security_title,
        body: securityBody,
        tone: 'security',
      },
    ],
    footer: copy.footer,
    supportEmail: config.web.supportEmail,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
  preferredLocale?: string | null
): Promise<void> {
  const locale = normalizeLocale(preferredLocale);
  const copy = getPasswordResetEmailCopy(locale);

  const content = renderTransactionalEmail({
    subject: copy.subject,
    preview: copy.preview,
    title: copy.subject,
    intro: copy.intro,
    action: {
      label: copy.cta,
      url: resetLink,
    },
    notices: [
      {
        text: copy.expires_notice,
        tone: 'warning',
      },
      {
        text: copy.ignore_notice,
        tone: 'quiet',
      },
    ],
    footer: copy.footer,
    supportEmail: config.web.supportEmail,
  });

  await sendTransactionalEmail({
    to,
    logContext: { ...buildSafeEmailLogContext(to), type: 'password-reset', locale },
    successMessage: 'Password reset email sent',
    failureMessage: 'Failed to send password reset email',
    ...content,
  });
}

export async function sendWelcomeEmail(
  recipient: WelcomeEmailRecipient,
  options: WelcomeEmailOptions
): Promise<void> {
  const content = buildWelcomeEmail(recipient, options);
  const emailLogContext = buildSafeEmailLogContext(recipient.email);

  await sendTransactionalEmail({
    to: recipient.email,
    logContext: {
      ...emailLogContext,
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
        ...buildSafeEmailLogContext(recipient.email),
        type: 'welcome',
        signupMethod: options.signupMethod,
      },
      'Welcome email delivery failed'
    );
  });
}
