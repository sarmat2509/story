/**
 * Provision one-time production promo accounts from a local, Git-ignored JSON
 * manifest. Accounts begin their 14-day period only on their first successful
 * login; this script never sends email and never overwrites an existing promo
 * account or password.
 *
 * Usage:
 *   pnpm --dir services/api provision:promo-accounts -- --input=/secure/promo-accounts.json
 *   pnpm --dir services/api provision:promo-accounts -- --input=/secure/promo-accounts.json --dry-run
 */

import './loadEnvForScripts';

import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { closeDatabaseConnection, db } from '../db';
import { plans, userSubscriptions, users } from '../db/schema';

type PromoAccountInput = {
  email: string;
  password: string;
  displayName: string;
  locale: 'en' | 'ru' | 'es';
  handle?: string;
};

type PromoManifest = {
  accounts: PromoAccountInput[];
};

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const inputArg = args.find((arg) => arg.startsWith('--input='));

function readManifest(): PromoManifest {
  if (!inputArg) {
    throw new Error('Missing --input=/absolute/path/to/promo-accounts.json');
  }

  const inputPath = path.resolve(inputArg.slice('--input='.length));
  const parsed = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as PromoManifest;
  if (!Array.isArray(parsed.accounts) || parsed.accounts.length === 0) {
    throw new Error('Manifest must contain a non-empty accounts array');
  }
  return parsed;
}

function validateAccount(input: PromoAccountInput): PromoAccountInput {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@wondertales\.art$/i.test(email)) {
    throw new Error(`Promo login must use the wondertales.art domain: ${input.email}`);
  }
  if (input.password.length < 16) {
    throw new Error(`Password must be at least 16 characters for ${email}`);
  }
  if (!input.displayName.trim()) {
    throw new Error(`Display name is required for ${email}`);
  }
  if (!['en', 'ru', 'es'].includes(input.locale)) {
    throw new Error(`Unsupported locale for ${email}: ${input.locale}`);
  }
  return { ...input, email, displayName: input.displayName.trim() };
}

async function provisionAccount(input: PromoAccountInput, fairyworldPlanId: string) {
  const existing = await db.query.users.findFirst({
    where: (table, { eq: drizzleEq }) => drizzleEq(table.email, input.email),
  });

  if (existing) {
    if (existing.accountType !== 'promo') {
      throw new Error(`${input.email} already belongs to a non-promo account`);
    }
    if (existing.promoStartedAt) {
      return 'already_activated' as const;
    }
    return 'already_pending' as const;
  }

  if (dryRun) return 'would_create' as const;

  const now = new Date();
  const passwordHash = await bcrypt.hash(input.password, 12);
  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        preferredLocale: input.locale,
        mode: 'artisan',
        role: 'user',
        status: 'active',
        accountType: 'promo',
        promoStartedAt: null,
        promoExpiresAt: null,
        stripeCustomerId: null,
      })
      .returning({ id: users.id });
    if (!user) throw new Error(`Failed to create ${input.email}`);

    await tx.insert(userSubscriptions).values({
      userId: user.id,
      planId: fairyworldPlanId,
      status: 'active',
      storiesUsed: 0,
      audioMinutesUsed: 0,
      currentPeriodStart: now,
      currentPeriodEnd: now,
      resetAt: now,
      cancelAtPeriodEnd: true,
      stripeSubscriptionId: null,
      paymentProvider: null,
      metadata: {
        source: 'provisionPromoAccounts',
        handle: input.handle ?? null,
        accountType: 'promo',
      },
    });
  });

  return 'created' as const;
}

async function main(): Promise<void> {
  const manifest = readManifest();
  const accounts = manifest.accounts.map(validateAccount);
  const uniqueEmails = new Set(accounts.map((account) => account.email));
  if (uniqueEmails.size !== accounts.length) {
    throw new Error('Manifest contains duplicate email logins');
  }

  const [fairyworld] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.slug, 'fairyworld'))
    .limit(1);
  if (!fairyworld) throw new Error('Plan "fairyworld" was not found');

  const summary: Array<{ login: string; result: string }> = [];
  for (const account of accounts) {
    summary.push({
      login: account.email,
      result: await provisionAccount(account, fairyworld.id),
    });
  }

  console.table(summary);
  console.log(`Dry run: ${dryRun ? 'yes' : 'no'}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection().catch(() => undefined);
  });
