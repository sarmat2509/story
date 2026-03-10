import { Resend } from 'resend';
import config from '../config';
import { logger } from '../utils/logger';

let resendClient: Resend | null = null;

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

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logger.warn({ to }, 'Skipping password reset email - Resend not configured');
    return;
  }

  const { error } = await resend.emails.send({
    from: config.email.fromEmail,
    to: [to],
    subject: 'WonderTales - Reset your password',
    html: `
      <p>You requested a password reset for your WonderTales account.</p>
      <p><a href="${resetLink}">Reset your password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
    `,
  });

  if (error) {
    logger.error({ err: error, to }, 'Failed to send password reset email');
    throw new Error('Failed to send password reset email');
  }

  logger.info({ to }, 'Password reset email sent');
}
