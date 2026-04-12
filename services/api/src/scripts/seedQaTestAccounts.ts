/**
 * Seed QA manual test accounts for staging / manual QA flows.
 *
 * Creates or updates the accounts that can be prepared automatically at the
 * database level: users, OAuth identities, roles, plan subscriptions,
 * locale/mode/profile fields, billing-state flags, and the baseline content
 * fixtures required by disposable billing accounts.
 *
 * It intentionally does NOT create dependent content fixtures that rely on
 * generated or uploaded media, such as:
 * - stories / published stories
 * - uploaded avatars
 * - reference-photo assets for children or characters
 *
 * Usage:
 *   pnpm --dir services/api seed:test-accounts
 *   pnpm --dir services/api seed:test-accounts --dry-run
 *   pnpm --dir services/api seed:test-accounts --only=FREE_USER,ADMIN_USER
 *
 * Optional env:
 *   QA_TEST_EMAIL_DOMAIN=example.test
 *   QA_TEST_EMAIL_PREFIX=qa
 *   QA_TEST_DEFAULT_PASSWORD='ChangeMe123!'
 *   QA_TEST_PAID_PLAN_SLUG=silver
 *   QA_TEST_LOCALE=ru
 */

import './loadEnvForScripts';

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, closeDatabaseConnection } from '../db';
import { characters, childProfiles, oauthIdentities, plans, userSubscriptions, users } from '../db/schema';
import { encryptToken } from '../utils/encryption';

type AccountCode =
  | 'FREE_USER'
  | 'PAID_USER'
  | 'CANCELED_USER'
  | 'ADMIN_USER'
  | 'FREE_INSTANT_LIMIT_USER'
  | 'FREE_ARTISAN_LIMIT_USER'
  | 'PAID_AUDIO_USER'
  | 'PROFILE_EDIT_USER'
  | 'PUBLIC_AUTHOR_USER';

type AuthKind = 'password' | 'google' | 'apple';
type PlanKind = 'free' | 'paid';

interface AccountSpec {
  code: AccountCode;
  auth: AuthKind;
  planKind: PlanKind;
  role: 'user' | 'admin';
  mode: 'instant' | 'artisan';
  displayName: string;
  pseudonym?: string | null;
  aboutMe?: string | null;
  notes?: string[];
}

interface SummaryRow {
  code: AccountCode;
  email: string;
  auth: AuthKind;
  plan: string;
  result: 'created' | 'updated' | 'skipped';
  notes: string;
}

const DEFAULT_PASSWORD = process.env.QA_TEST_DEFAULT_PASSWORD || 'ChangeMe123!';
const EMAIL_DOMAIN = process.env.QA_TEST_EMAIL_DOMAIN || 'wondertales.test';
const EMAIL_PREFIX = process.env.QA_TEST_EMAIL_PREFIX || 'qa';
const DEFAULT_LOCALE = process.env.QA_TEST_LOCALE || 'ru';
const EXPLICIT_PAID_PLAN_SLUG = process.env.QA_TEST_PAID_PLAN_SLUG?.trim() || null;

const DRY_RUN = process.argv.includes('--dry-run');
const ONLY_CODES = (() => {
  const arg = process.argv.find((item) => item.startsWith('--only='));
  if (!arg) return null;
  return new Set(
    arg
      .slice('--only='.length)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
})();

const ACCOUNT_SPECS: AccountSpec[] = [
  {
    code: 'FREE_USER',
    auth: 'password',
    planKind: 'free',
    role: 'user',
    mode: 'instant',
    displayName: 'QA Free User',
  },
  {
    code: 'PAID_USER',
    auth: 'password',
    planKind: 'paid',
    role: 'user',
    mode: 'instant',
    displayName: 'QA Paid User',
  },
  {
    code: 'CANCELED_USER',
    auth: 'password',
    planKind: 'paid',
    role: 'user',
    mode: 'instant',
    displayName: 'QA Canceled User',
  },
  {
    code: 'ADMIN_USER',
    auth: 'password',
    planKind: 'free',
    role: 'admin',
    mode: 'artisan',
    displayName: 'QA Admin User',
  },
  {
    code: 'FREE_INSTANT_LIMIT_USER',
    auth: 'password',
    planKind: 'free',
    role: 'user',
    mode: 'instant',
    displayName: 'QA Free Instant Limit User',
    notes: ['Instant-mode baseline only: no child or character fixtures are seeded'],
  },
  {
    code: 'FREE_ARTISAN_LIMIT_USER',
    auth: 'password',
    planKind: 'free',
    role: 'user',
    mode: 'artisan',
    displayName: 'QA Free Artisan Limit User',
  },
  {
    code: 'PAID_AUDIO_USER',
    auth: 'password',
    planKind: 'paid',
    role: 'user',
    mode: 'artisan',
    displayName: 'QA Paid Audio User',
    notes: ['Manual follow-up: create DRAFT_STORY_NO_AUDIO from seeded CHILD_MINIMAL and CHARACTER_PERSON'],
  },
  {
    code: 'PROFILE_EDIT_USER',
    auth: 'password',
    planKind: 'free',
    role: 'user',
    mode: 'instant',
    displayName: 'QA Profile Edit User',
    pseudonym: 'Profile QA',
    aboutMe: 'Profile baseline bio',
  },
  {
    code: 'PUBLIC_AUTHOR_USER',
    auth: 'password',
    planKind: 'free',
    role: 'user',
    mode: 'artisan',
    displayName: 'QA Public Author User',
    pseudonym: 'Public Author QA',
    aboutMe: 'QA profile prepared for public author checks.',
    notes: ['Manual follow-up: upload avatar and publish several stories'],
  },
];

// Hardcoded QA baseline modeled after an existing real-world fixture, but stored
// locally in code so the seed stays deterministic and idempotent.
const SEEDED_CHILD_FIXTURE = {
  name: 'Емілія',
  birthDate: '2017-07-16',
  languages: ['uk'],
  referencePhotos: null,
  appearanceTraits: {
    eyeColor: 'dark_brown',
    skinTone: 'light',
    hairStyle: 'ponytail',
    hairLength: 'very_long',
    distinctiveFeatures: [
      'freckles',
      'kind_smile',
      'bright_eyes',
      'long_eyelashes',
      'braids',
    ],
  },
  personality: null,
  interests: null,
  sensitivities: null,
  familyCast: null,
  aiGeneratedDescription:
    'This young girl has a kind smile and bright eyes, with light skin and a scattering of freckles on her nose and cheeks. Her very long hair is a playful mix of light brown, pink, and blue, styled into braids at the front that lead into a high ponytail. She wears a dark floral bomber jacket over a black crop top, paired with black and white patterned pants and white sneakers.',
  descriptionEn: null,
  descriptionLanguage: null,
  clothing: {
    style: 'casual',
    colors: ['multicolor', 'black', 'white'],
    accessories: null,
    distinctiveItems: ['jacket', 't-shirt', 'pants', 'sneakers'],
  },
  distinctiveFeatures: ['freckles', 'kind_smile', 'bright_eyes', 'braids', 'ponytail'],
};

// Hardcoded QA baseline modeled after an existing real-world fixture, but stored
// locally in code so the seed stays deterministic and idempotent.
const SEEDED_CHARACTER_FIXTURE = {
  name: 'Тато',
  type: 'person' as const,
  subtype: 'best_friend',
  referencePhotos: null,
  appearanceTraits: null,
  personality: null,
  description:
    'Батько Емілії, дорослий чоловік з добрими зморшками навколо очей, що свідчать про часті посмішки. У нього коротке каштанове волосся та охайна борода. Він носить зручний комбінезон космічного фермера сірого кольору з нашивками на рукавах, що свідчать про його досвід у вирощуванні рослин на Місяці.',
  aiGeneratedDescription:
    'Батько Емілії, дорослий чоловік з добрими зморшками навколо очей, що свідчать про часті посмішки. У нього коротке каштанове волосся та охайна борода. Він носить зручний комбінезон космічного фермера сірого кольору з нашивками на рукавах, що свідчать про його досвід у вирощуванні рослин на Місяці.',
  clothing: null,
  distinctiveFeatures: null,
  descriptionEn: null,
  descriptionLanguage: null,
  isHidden: false,
};

const ACCOUNT_CODES_WITH_LIBRARY_FIXTURES = new Set<AccountCode>([
  'FREE_ARTISAN_LIMIT_USER',
  'PAID_AUDIO_USER',
]);

function buildEmail(code: AccountCode): string {
  return `${EMAIL_PREFIX}.${code.toLowerCase()}@${EMAIL_DOMAIN}`;
}

function buildSyntheticStripeCustomerId(code: AccountCode): string {
  return `qa_cus_${code.toLowerCase()}`;
}

function buildSyntheticStripeSubscriptionId(code: AccountCode): string {
  return `qa_sub_${code.toLowerCase()}`;
}

function buildProviderUserId(code: AccountCode, provider: 'google' | 'apple'): string {
  return `${EMAIL_PREFIX}-${provider}-${code.toLowerCase()}`;
}

function addOneMonth(date: Date): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1);
  return result;
}

async function resolvePlanIds() {
  const activePlans = await db.select().from(plans).where(eq(plans.isActive, true)).orderBy(plans.sortOrder);

  const freePlan = activePlans.find((plan) => plan.slug === 'free');
  if (!freePlan) {
    throw new Error('Active plan with slug "free" not found');
  }

  let paidPlan = null;
  if (EXPLICIT_PAID_PLAN_SLUG) {
    paidPlan = activePlans.find((plan) => plan.slug === EXPLICIT_PAID_PLAN_SLUG);
    if (!paidPlan) {
      const available = activePlans.map((plan) => plan.slug).join(', ');
      throw new Error(
        `QA_TEST_PAID_PLAN_SLUG="${EXPLICIT_PAID_PLAN_SLUG}" not found. Active plans: ${available}`
      );
    }
  } else {
    paidPlan = activePlans
      .filter((plan) => plan.slug !== 'free' && plan.priceMonthly > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder)[0] || null;
  }

  if (!paidPlan) {
    const available = activePlans.map((plan) => `${plan.slug}:${plan.priceMonthly}`).join(', ');
    throw new Error(`No paid active plan found. Active plans: ${available}`);
  }

  return {
    freePlan,
    paidPlan,
  };
}

async function upsertUser(spec: AccountSpec, passwordHash: string | null, email: string) {
  const existing = await db.query.users.findFirst({
    where: (table, { eq: drizzleEq }) => drizzleEq(table.email, email),
  });

  const stripeCustomerId = spec.planKind === 'paid'
    ? buildSyntheticStripeCustomerId(spec.code)
    : null;

  const payload = {
    email,
    passwordHash,
    displayName: spec.displayName,
    preferredLocale: DEFAULT_LOCALE,
    mode: spec.mode,
    role: spec.role,
    pseudonym: spec.pseudonym ?? null,
    aboutMe: spec.aboutMe ?? null,
    stripeCustomerId,
    updatedAt: new Date(),
  };

  if (DRY_RUN) {
    return {
      user: existing ?? {
        id: '(dry-run)',
        ...payload,
      },
      result: existing ? ('updated' as const) : ('created' as const),
    };
  }

  if (!existing) {
    const [created] = await db
      .insert(users)
      .values(payload)
      .returning();

    return { user: created, result: 'created' as const };
  }

  const [updated] = await db
    .update(users)
    .set(payload)
    .where(eq(users.id, existing.id))
    .returning();

  return { user: updated, result: 'updated' as const };
}

async function ensureOAuthIdentity(userId: string, spec: AccountSpec, email: string): Promise<string | null> {
  if (spec.auth !== 'google' && spec.auth !== 'apple') {
    return null;
  }

  if (DRY_RUN) {
    return null;
  }

  let encryptedToken: string;
  try {
    encryptedToken = encryptToken(`seed-token-${spec.code.toLowerCase()}`) || '';
  } catch (error) {
    return 'Skipped OAuth identity: ENCRYPTION_KEY is missing or invalid';
  }

  const provider = spec.auth;
  const providerUserId = buildProviderUserId(spec.code, provider);
  const rawUserInfo =
    provider === 'google'
      ? {
          id: providerUserId,
          email,
          name: spec.displayName,
          seededBy: 'seedQaTestAccounts',
        }
      : {
          sub: providerUserId,
          email,
          name: { firstName: 'QA', lastName: spec.code.replace(/_/g, ' ') },
          seededBy: 'seedQaTestAccounts',
        };

  const conflictingIdentity = await db.query.oauthIdentities.findFirst({
    where: (table, { and: drizzleAnd, eq: drizzleEq }) =>
      drizzleAnd(
        drizzleEq(table.provider, provider),
        drizzleEq(table.providerUserId, providerUserId)
      ),
  });

  if (conflictingIdentity && conflictingIdentity.userId !== userId) {
    throw new Error(
      `OAuth identity ${provider}:${providerUserId} already belongs to another user (${conflictingIdentity.userId})`
    );
  }

  const existingForUser = await db.query.oauthIdentities.findFirst({
    where: (table, { and: drizzleAnd, eq: drizzleEq }) =>
      drizzleAnd(
        drizzleEq(table.userId, userId),
        drizzleEq(table.provider, provider)
      ),
  });

  if (!existingForUser) {
    await db.insert(oauthIdentities).values({
      userId,
      provider,
      providerUserId,
      providerEmail: email,
      accessToken: encryptedToken,
      refreshToken: encryptedToken,
      tokenExpiresAt: provider === 'google' ? addOneMonth(new Date()) : null,
      rawUserInfo,
    });
    return null;
  }

  await db
    .update(oauthIdentities)
    .set({
      providerUserId,
      providerEmail: email,
      accessToken: encryptedToken,
      refreshToken: encryptedToken,
      tokenExpiresAt: provider === 'google' ? addOneMonth(new Date()) : null,
      rawUserInfo,
      updatedAt: new Date(),
    })
    .where(eq(oauthIdentities.id, existingForUser.id));

  return null;
}

async function upsertSubscription(
  userId: string,
  spec: AccountSpec,
  planId: string
) {
  if (DRY_RUN) {
    return;
  }

  const existing = await db.query.userSubscriptions.findFirst({
    where: (table, { eq: drizzleEq }) => drizzleEq(table.userId, userId),
  });

  const now = new Date();
  const currentPeriodEnd = addOneMonth(now);
  const isPaid = spec.planKind === 'paid';
  const isCanceled = spec.code === 'CANCELED_USER';

  const payload = {
    planId,
    status: 'active' as const,
    trialEndsAt: null,
    storiesUsed: 0,
    audioMinutesUsed: 0,
    resetAt: currentPeriodEnd,
    currentPeriodStart: now,
    currentPeriodEnd,
    cancelAtPeriodEnd: isCanceled,
    stripeSubscriptionId: isPaid ? buildSyntheticStripeSubscriptionId(spec.code) : null,
    paymentProvider: isPaid ? 'stripe' : null,
    metadata: {
      source: 'seedQaTestAccounts',
      code: spec.code,
    },
    updatedAt: now,
  };

  if (!existing) {
    await db.insert(userSubscriptions).values({
      userId,
      ...payload,
    });
    return;
  }

  await db
    .update(userSubscriptions)
    .set(payload)
    .where(eq(userSubscriptions.userId, userId));
}

async function ensureStripeCustomerId(userId: string, spec: AccountSpec) {
  if (DRY_RUN) {
    return;
  }

  await db
    .update(users)
    .set({
      stripeCustomerId: spec.planKind === 'paid'
        ? buildSyntheticStripeCustomerId(spec.code)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

async function ensureAccountFixtures(userId: string, spec: AccountSpec): Promise<string[]> {
  if (!ACCOUNT_CODES_WITH_LIBRARY_FIXTURES.has(spec.code)) {
    return [];
  }

  if (DRY_RUN) {
    return ['CHILD_MINIMAL would be created', 'CHARACTER_PERSON would be created'];
  }

  const notes: string[] = [];
  const now = new Date();

  const existingChild = await db.query.childProfiles.findFirst({
    where: (table, { and: drizzleAnd, eq: drizzleEq }) =>
      drizzleAnd(
        drizzleEq(table.userId, userId),
        drizzleEq(table.name, SEEDED_CHILD_FIXTURE.name),
        drizzleEq(table.isActive, true)
      ),
  });

  const childPayload = {
    userId,
    name: SEEDED_CHILD_FIXTURE.name,
    birthDate: SEEDED_CHILD_FIXTURE.birthDate,
    languages: SEEDED_CHILD_FIXTURE.languages,
    referencePhotos: SEEDED_CHILD_FIXTURE.referencePhotos,
    appearanceTraits: SEEDED_CHILD_FIXTURE.appearanceTraits,
    personality: SEEDED_CHILD_FIXTURE.personality,
    interests: SEEDED_CHILD_FIXTURE.interests,
    sensitivities: SEEDED_CHILD_FIXTURE.sensitivities,
    familyCast: SEEDED_CHILD_FIXTURE.familyCast,
    aiGeneratedDescription: SEEDED_CHILD_FIXTURE.aiGeneratedDescription,
    descriptionEn: SEEDED_CHILD_FIXTURE.descriptionEn,
    descriptionLanguage: SEEDED_CHILD_FIXTURE.descriptionLanguage,
    clothing: SEEDED_CHILD_FIXTURE.clothing,
    distinctiveFeatures: SEEDED_CHILD_FIXTURE.distinctiveFeatures,
    isActive: true,
    updatedAt: now,
  };

  if (!DRY_RUN) {
    if (!existingChild) {
      await db.insert(childProfiles).values(childPayload);
      notes.push('CHILD_MINIMAL created');
    } else {
      await db
        .update(childProfiles)
        .set(childPayload)
        .where(eq(childProfiles.id, existingChild.id));
      notes.push('CHILD_MINIMAL updated');
    }
  } else {
    notes.push(existingChild ? 'CHILD_MINIMAL would be updated' : 'CHILD_MINIMAL would be created');
  }

  const existingCharacter = await db.query.characters.findFirst({
    where: (table, { and: drizzleAnd, eq: drizzleEq }) =>
      drizzleAnd(
        drizzleEq(table.userId, userId),
        drizzleEq(table.name, SEEDED_CHARACTER_FIXTURE.name),
        drizzleEq(table.type, SEEDED_CHARACTER_FIXTURE.type),
        drizzleEq(table.isActive, true)
      ),
  });

  const characterPayload = {
    userId,
    name: SEEDED_CHARACTER_FIXTURE.name,
    type: SEEDED_CHARACTER_FIXTURE.type,
    subtype: SEEDED_CHARACTER_FIXTURE.subtype,
    referencePhotos: SEEDED_CHARACTER_FIXTURE.referencePhotos,
    appearanceTraits: SEEDED_CHARACTER_FIXTURE.appearanceTraits,
    personality: SEEDED_CHARACTER_FIXTURE.personality,
    description: SEEDED_CHARACTER_FIXTURE.description,
    aiGeneratedDescription: SEEDED_CHARACTER_FIXTURE.aiGeneratedDescription,
    clothing: SEEDED_CHARACTER_FIXTURE.clothing,
    distinctiveFeatures: SEEDED_CHARACTER_FIXTURE.distinctiveFeatures,
    descriptionEn: SEEDED_CHARACTER_FIXTURE.descriptionEn,
    descriptionLanguage: SEEDED_CHARACTER_FIXTURE.descriptionLanguage,
    isHidden: SEEDED_CHARACTER_FIXTURE.isHidden,
    isActive: true,
    updatedAt: now,
  };

  if (!DRY_RUN) {
    if (!existingCharacter) {
      await db.insert(characters).values(characterPayload);
      notes.push('CHARACTER_PERSON created');
    } else {
      await db
        .update(characters)
        .set(characterPayload)
        .where(eq(characters.id, existingCharacter.id));
      notes.push('CHARACTER_PERSON updated');
    }
  } else {
    notes.push(existingCharacter ? 'CHARACTER_PERSON would be updated' : 'CHARACTER_PERSON would be created');
  }

  return notes;
}

async function seedAccount(spec: AccountSpec, freePlanId: string, paidPlanId: string): Promise<SummaryRow> {
  const email = buildEmail(spec.code);
  const passwordHash = spec.auth === 'password' ? await bcrypt.hash(DEFAULT_PASSWORD, 12) : null;
  const planId = spec.planKind === 'paid' ? paidPlanId : freePlanId;

  const { user, result } = await upsertUser(spec, passwordHash, email);

  const notes: string[] = [...(spec.notes ?? [])];

  const oauthNote = await ensureOAuthIdentity(user.id, spec, email);
  if (oauthNote) {
    notes.push(oauthNote);
  }

  await upsertSubscription(user.id, spec, planId);
  await ensureStripeCustomerId(user.id, spec);
  notes.push(...await ensureAccountFixtures(user.id, spec));

  if (spec.auth === 'password') {
    notes.unshift(`Password: ${DEFAULT_PASSWORD}`);
  } else {
    notes.unshift('OAuth-only account');
  }

  return {
    code: spec.code,
    email,
    auth: spec.auth,
    plan: spec.planKind,
    result,
    notes: notes.join(' | '),
  };
}

async function main() {
  const selectedSpecs = ONLY_CODES
    ? ACCOUNT_SPECS.filter((spec) => ONLY_CODES.has(spec.code))
    : ACCOUNT_SPECS;

  if (selectedSpecs.length === 0) {
    throw new Error('No accounts selected. Check --only=CODE1,CODE2');
  }

  const { freePlan, paidPlan } = await resolvePlanIds();
  const summary: SummaryRow[] = [];

  for (const spec of selectedSpecs) {
    const row = await seedAccount(spec, freePlan.id, paidPlan.id);
    row.plan = spec.planKind === 'paid' ? paidPlan.slug : freePlan.slug;
    summary.push(row);
  }

  console.table(summary);
  console.log('');
  console.log(`Free plan slug: ${freePlan.slug}`);
  console.log(`Paid plan slug: ${paidPlan.slug}`);
  console.log(`Locale: ${DEFAULT_LOCALE}`);
  console.log(`Dry run: ${DRY_RUN ? 'yes' : 'no'}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection().catch(() => undefined);
  });
