export type PasswordStrength = 'weak' | 'medium' | 'strong';

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password || password.length < 8) return 'weak';
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  if (score <= 2) return 'weak';
  if (score <= 4) return 'medium';
  return 'strong';
}

export function meetsMinRequirements(password: string): boolean {
  return password.length >= 8;
}
