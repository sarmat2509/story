/**
 * Idempotently create the 15 canonical presentation characters and their turnarounds.
 *
 * Dry run:
 *   pnpm create:presentation-characters -- --user-id=<uuid> --refresh-demo-period
 *
 * Execute:
 *   pnpm create:presentation-characters -- --user-id=<uuid> --refresh-demo-period --execute
 */

import './loadEnvForScripts';

import { CreateCharacterSchema } from '@wondertales/shared';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { closeDatabaseConnection, db } from '../db';
import {
  characters,
  childProfiles,
  features,
  plans,
  planFeatures,
  usageEvents,
  users,
  userSubscriptions,
} from '../db/schema';
import * as characterService from '../services/characterService';
import { recordUsage } from '../services/aiUsageService';
import {
  CHARACTER_QUOTA_FEATURE_SLUG,
  CHARACTER_USAGE_EVENT,
  releaseManualCharacterQuotaReservation,
  reserveManualCharacterQuota,
} from '../services/characterQuotaService';
import {
  createMonthlyPeriod,
  resolveActiveSubscriptionPeriod,
} from '../services/subscriptionPeriodService';
import { generateLlmCharacterTurnaround } from '../services/turnaroundSheetService';
import { localizeCharacterNames } from '../services/translationService';
import { getDictionaryRepository } from '../repositories';
import type { Character } from '../db/schema';

const EXECUTE = process.argv.includes('--execute');
const REFRESH_DEMO_PERIOD = process.argv.includes('--refresh-demo-period');
const userId =
  process.argv
    .find((arg) => arg.startsWith('--user-id='))
    ?.slice('--user-id='.length)
    .trim() || process.env.PRESENTATION_USER_ID?.trim();

const REQUIRED_NAME_LOCALES = 7;

async function getCharacterNameLocaleCounts(characterIds: string[]): Promise<Map<string, number>> {
  const rows = await getDictionaryRepository().findTranslationsForEntities(
    'character',
    characterIds,
    'name'
  );
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.entityId, (counts.get(row.entityId) ?? 0) + 1);
  }
  return counts;
}

async function waitForBackgroundNameLocalizations(
  characterIds: string[],
  timeoutMs = 60_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const counts = await getCharacterNameLocaleCounts(characterIds);
    if (characterIds.every((id) => (counts.get(id) ?? 0) >= REQUIRED_NAME_LOCALES)) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

async function ensureCharacterNameLocalizations(charactersToCheck: Character[]): Promise<void> {
  const counts = await getCharacterNameLocaleCounts(
    charactersToCheck.map((character) => character.id)
  );
  for (const character of charactersToCheck) {
    if ((counts.get(character.id) ?? 0) >= REQUIRED_NAME_LOCALES) continue;
    await localizeCharacterNames(character, {
      sourceLocale: character.descriptionLanguage,
      onUsage: (usage) =>
        recordUsage(usage, { userId: character.userId, characterId: character.id }),
    });
  }
}

const characterDefinitions = [
  {
    childName: 'Ноа',
    payload: {
      name: 'Мара',
      type: 'person',
      subtype: 'mother',
      descriptionLanguage: 'en',
      appearanceTraits: {
        ageRange: 'adult',
        hairColor: 'auburn',
        hairLength: 'medium',
        hairStyle: 'ponytail',
        eyeColor: 'green',
        skinTone: 'very_light',
        height: 'average',
        build: 'average',
        clothing: 'casual',
        distinctiveFeatures: ['kind_smile'],
      },
      personality: {
        traits: ['warm', 'attentive', 'patient'],
        favoriteActivities: ['family walks', 'reading'],
      },
      aiGeneratedDescription:
        "Adult woman named Mara, Noa's mother, approximately 32 years old and 168 cm tall, gentle relaxed posture. Very light neutral peach skin, oval face, soft cheekbones, gray-green eyes. Dark-auburn type 2B shoulder-length wavy hair gathered into a low loose ponytail, with exactly two soft face-framing strands. Forest-green knee-length coat, warm-red knitted scarf, cream sweater, straight navy trousers, brown ankle boots. Warm attentive expression. Preserve hair color, low ponytail, green coat, and red scarf in every view.",
    },
  },
  {
    childName: 'Ноа',
    payload: {
      name: 'Пип',
      type: 'animal',
      subtype: 'rabbit',
      descriptionLanguage: 'en',
      appearanceTraits: {
        breed: 'rabbit',
        furColor: 'brown_white',
        furPattern: 'patched',
        furLength: 'short',
        size: 'small',
        eyeColor: 'dark_brown',
        distinctiveFeatures: ['pink_nose', 'short_tail'],
      },
      personality: {
        traits: ['gentle', 'curious', 'calm'],
        favoriteActivities: ['hiding', 'jumping'],
      },
      aiGeneratedDescription:
        'Small female white rabbit named Pip with a soft rounded body. Her right ear is entirely warm brown and her left ear is entirely white; both ears stand upright and angle slightly outward. One brown patch on the right hind paw, all other paws white. Dark-brown eyes, small pink nose. A tiny green crossbody satchel runs from her left shoulder to her right side, with no visible contents. Preserve ear colors, right hind-paw patch, and satchel direction exactly.',
    },
  },
  {
    childName: 'Ноа',
    payload: {
      name: 'Тилли',
      type: 'imaginary',
      subtype: 'other_creature',
      descriptionLanguage: 'en',
      appearanceTraits: {
        species: 'moon moth',
        primaryColor: 'cream-white',
        secondaryColor: 'pale lavender and gold',
        size: 'approximately 28 cm tall',
        magicalFeatures: ['four wings', 'crescent antenna tips', 'subtle warm glow'],
        customDescription: 'A gentle fluffy moon moth with four wings and crescent motifs.',
      },
      personality: {
        traits: ['gentle', 'calm', 'helpful'],
        favoriteActivities: ['guiding dreams', 'flying quietly'],
      },
      aiGeneratedDescription:
        'Gentle fictional moon moth named Tilli, approximately 28 cm tall, gender-neutral. Fluffy cream-white body, round head with almost no neck, large charcoal-gray eyes, no visible nose, tiny curved mouth. Two fluffy antennae, each ending in one identical lavender crescent. Exactly four wings: two larger upper wings and two smaller lower wings, pale lavender with cream borders; exactly one small gold crescent on each upper wing. Short gray-lavender legs. Very subtle warm glow only. Preserve wing count, crescent placement, antenna tips, and color palette exactly.',
    },
  },
  {
    childName: 'Лина',
    payload: {
      name: 'Момо',
      type: 'animal',
      subtype: 'cat',
      descriptionLanguage: 'en',
      appearanceTraits: {
        breed: 'mixed',
        furColor: 'grey_white',
        furPattern: 'striped',
        furLength: 'short',
        size: 'small',
        eyeColor: 'amber',
        distinctiveFeatures: ['white_paws', 'white_chest', 'long_tail', 'bandana'],
      },
      personality: {
        traits: ['calm', 'independent', 'gentle'],
        favoriteActivities: ['sleeping', 'climbing'],
      },
      aiGeneratedDescription:
        'Small male gray short-haired tabby cat named Momo. Symmetrical dark-charcoal tabby stripes on the forehead and cheeks, large amber eyes, white chest, both front paws white up to the wrists, gray hind paws. Long striped tail with a dark tip. Red triangular neckerchief tied with the knot on his right side. Calm slightly dignified expression. Preserve stripe pattern, white paw boundaries, tail tip, and knot side exactly.',
    },
  },
  {
    childName: 'Лина',
    payload: {
      name: 'Кико',
      type: 'imaginary',
      subtype: 'other_creature',
      descriptionLanguage: 'en',
      appearanceTraits: {
        species: 'lantern snail',
        primaryColor: 'mint green',
        secondaryColor: 'coral and warm yellow',
        size: 'approximately 24 cm long',
        magicalFeatures: ['translucent shell', 'glowing spiral'],
        customDescription: 'A small magical snail whose coral shell glows like a lantern.',
      },
      personality: {
        traits: ['patient', 'friendly', 'curious'],
        favoriteActivities: ['lighting paths', 'slow exploring'],
      },
      aiGeneratedDescription:
        'Small fictional lantern snail named Kiko, approximately 24 cm long, male. Smooth mint-green body with a cream underside, two upper eye stalks ending in round dark-navy eyes, exactly two short lower feelers. Semi-transparent coral shell with a warm-yellow glowing spiral and exactly one small white point at the spiral center. Gentle stable glow, no beam. Preserve body colors, eye-stalk count, two lower feelers, and shell spiral exactly.',
    },
  },
  {
    childName: 'Майя',
    payload: {
      name: 'Пико',
      type: 'animal',
      subtype: 'dog',
      descriptionLanguage: 'en',
      appearanceTraits: {
        breed: 'corgi',
        furColor: 'brown_white',
        furPattern: 'bicolor',
        furLength: 'short',
        size: 'small',
        eyeColor: 'dark_brown',
        distinctiveFeatures: ['pointy_ears', 'white_chest', 'white_belly', 'collar', 'short_tail'],
      },
      personality: {
        traits: ['friendly', 'loyal', 'curious'],
        favoriteActivities: ['running', 'fetching'],
      },
      aiGeneratedDescription:
        'Small male red-and-white corgi named Pico with short legs and a compact body. White muzzle, one centered white blaze from nose to forehead, white chest and belly; warm red back, sides, and outer ears. Both ears upright, with one small V-shaped notch on the outer edge of the left ear. Dark-brown eyes. Royal-blue collar with one plain circular silver tag, no text. Short fluffy tail. Preserve blaze shape, left-ear notch, collar color, and tag shape exactly.',
    },
  },
  {
    childName: 'Майя',
    payload: {
      name: 'Орби',
      type: 'imaginary',
      subtype: 'other_creature',
      descriptionLanguage: 'en',
      appearanceTraits: {
        species: 'air-swimming manta',
        primaryColor: 'deep blue',
        secondaryColor: 'cream, teal, coral, and gold',
        size: 'approximately 75 cm wingspan',
        magicalFeatures: ['flies through air', 'seven gold dots', 'two ribbon tails'],
        customDescription: 'A friendly manta-shaped creature that swims through the air.',
      },
      personality: {
        traits: ['friendly', 'playful', 'observant'],
        favoriteActivities: ['air swimming', 'finding patterns'],
      },
      aiGeneratedDescription:
        'Friendly fictional air-swimming manta named Orbi, female, approximately 75 cm wingspan. Smooth deep-blue upper body and cream underside, exactly seven round gold dots arranged in one arc across the back. Dark-brown eyes on the upper front, tiny mouth on the underside. Exactly two soft ribbon-like tail streamers: teal on her left and coral on her right. No scales, machinery, legs, or extra fins. Preserve seven-dot arc, streamer count, left-right colors, and manta silhouette exactly.',
    },
  },
  {
    childName: 'Сами',
    payload: {
      name: 'Лума',
      type: 'imaginary',
      subtype: 'dragon',
      descriptionLanguage: 'en',
      appearanceTraits: {
        species: 'young wingless dragon',
        primaryColor: 'turquoise',
        secondaryColor: 'cream and gold',
        size: 'approximately 48 cm at the shoulder',
        magicalFeatures: ['gold fins', 'wingless', 'broad tail fin'],
        customDescription:
          'A friendly four-legged turquoise dragon with soft golden fins and no wings.',
      },
      personality: {
        traits: ['brave', 'friendly', 'curious'],
        favoriteActivities: ['exploring', 'swimming'],
      },
      aiGeneratedDescription:
        'Small young female dragon named Luma, approximately 48 cm at the shoulder, quadruped. Smooth turquoise body with very fine subtle scales, cream belly, dark-navy eyes, short friendly muzzle. A continuous row of soft gold fins runs from the top of the head along the spine to the tail; one small gold side fin on each side of the head. No wings. Broad gold fin at the tail tip. Exactly three rounded toes on each foot, no sharp claws. Preserve fin placement, wingless silhouette, colors, and toe count.',
    },
  },
  {
    childName: 'Сами',
    payload: {
      name: 'Руни',
      type: 'imaginary',
      subtype: 'ghost',
      descriptionLanguage: 'en',
      appearanceTraits: {
        species: 'floating compass spirit',
        primaryColor: 'cream',
        secondaryColor: 'navy, teal, brass, red, and blue',
        size: 'approximately 42 cm tall',
        magicalFeatures: ['floating body', 'chest compass', 'gold diamond'],
        customDescription:
          'A legless floating guide spirit with a brass compass embedded in the chest.',
      },
      personality: {
        traits: ['wise', 'careful', 'encouraging'],
        favoriteActivities: ['guiding explorers', 'solving routes'],
      },
      aiGeneratedDescription:
        'Small fictional floating compass spirit named Runi, gender-neutral, approximately 42 cm tall. Cream rounded head and body form one continuous shape, two short arms, no legs, lower body ending in one soft curl. Teal-green eyes, navy eyebrows, one navy fin-like ear on each side of the head. One round brass compass embedded in the chest with no letters or numbers; its needle has one blue end and one red end. Exactly one small gold diamond floating above the head. Preserve limbless lower silhouette, compass design, ear fins, and single diamond.',
    },
  },
  {
    childName: 'Амара',
    payload: {
      name: 'Тео',
      type: 'person',
      subtype: 'father',
      descriptionLanguage: 'en',
      appearanceTraits: {
        ageRange: 'adult',
        hairColor: 'black',
        hairLength: 'short',
        hairStyle: 'curly',
        eyeColor: 'dark_brown',
        skinTone: 'brown',
        height: 'tall',
        build: 'average',
        clothing: 'casual',
        distinctiveFeatures: ['glasses', 'beard', 'kind_smile'],
      },
      personality: {
        traits: ['patient', 'encouraging', 'calm'],
        favoriteActivities: ['family trips', 'reading'],
      },
      aiGeneratedDescription:
        "Adult man named Theo, Amara's father, approximately 39 years old and 184 cm tall. Warm brown chestnut skin, oval-rectangular face, dark-brown eyes, short dense black tight curls, neat short beard. Rectangular navy eyeglass frames. Blue knitted sweater over a light-gray shirt, dark-brown trousers, brown shoes. Brown crossbody bag strap runs from his right shoulder to his left side. Patient encouraging expression. Preserve glasses, hair, beard, blue sweater, and strap direction exactly.",
    },
  },
  {
    childName: 'Амара',
    payload: {
      name: 'Физз',
      type: 'imaginary',
      subtype: 'ghost',
      descriptionLanguage: 'en',
      appearanceTraits: {
        species: 'cloud spirit',
        primaryColor: 'white',
        secondaryColor: 'pale blue and rainbow bands',
        size: 'approximately 55 cm tall',
        magicalFeatures: ['cloud body', 'rainbow boots'],
        customDescription:
          'A small cloud spirit with a fixed five-lobed silhouette and rainbow boots.',
      },
      personality: {
        traits: ['empathetic', 'cheerful', 'gentle'],
        favoriteActivities: ['floating', 'listening'],
      },
      aiGeneratedDescription:
        'Small gender-neutral cloud spirit named Fizz, approximately 55 cm tall. Fixed fluffy silhouette with exactly three rounded cloud lobes on top and exactly two side lobes, white with pale-blue lower shading. Sky-blue eyes, tiny mouth, two short cloud arms, two thin pale-blue legs. Identical rainbow boots, each with exactly four horizontal color bands from top to bottom: red, yellow, green, blue. No other rainbows. Preserve lobe counts, limb design, boot shape, and band order exactly.',
    },
  },
  {
    childName: 'Амара',
    payload: {
      name: 'Эмбер',
      type: 'imaginary',
      subtype: 'other_creature',
      descriptionLanguage: 'en',
      appearanceTraits: {
        species: 'fire salamander',
        primaryColor: 'dark charcoal',
        secondaryColor: 'amber and glowing orange',
        size: 'approximately 65 cm long',
        magicalFeatures: ['eight glowing spots', 'three-part flame crest', 'glowing tail tip'],
        customDescription:
          'A friendly four-legged fire salamander with glowing markings but no open flames.',
      },
      personality: {
        traits: ['brave', 'energetic', 'loyal'],
        favoriteActivities: ['warming camps', 'racing'],
      },
      aiGeneratedDescription:
        'Small fictional female fire salamander named Ember, quadruped, approximately 65 cm long. Dark-charcoal upper body, warm amber belly, exactly eight glowing orange spots along the sides, four on each side. Gold eyes. Head crest made of exactly three soft flame-shaped forms. Orange glowing tail tip but no open fire around the body. Exactly four rounded toes on each foot, no claws. Preserve spot count, three-part crest, color boundaries, and glowing tail tip exactly.',
    },
  },
  {
    childName: 'Рави',
    payload: {
      name: 'Нова',
      type: 'imaginary',
      subtype: 'robot',
      descriptionLanguage: 'en',
      appearanceTraits: {
        species: 'friendly robot',
        primaryColor: 'deep blue',
        secondaryColor: 'brass and pale blue',
        size: 'approximately 85 cm tall',
        magicalFeatures: ['screen face', 'two antennae', 'chest star'],
        customDescription:
          'A small brass-and-blue robot with a circular screen face and stable broad feet.',
      },
      personality: {
        traits: ['analytical', 'friendly', 'helpful'],
        favoriteActivities: ['inventing', 'solving puzzles'],
      },
      aiGeneratedDescription:
        'Small friendly gender-neutral robot named Nova, approximately 85 cm tall. Rounded-rectangle torso with a brass frame and deep-blue panels. Round head with one dark circular face screen showing exactly two pale-blue oval eyes and one short mouth line, no text or numbers. Round brass joints, exactly four fingers on each hand, broad stable feet. Exactly one pale-blue five-point star centered on the chest. Exactly two short identical brass antennae at the back of the head. Preserve materials, panel layout, star, antenna count, and face design.',
    },
  },
  {
    childName: 'Рави',
    payload: {
      name: 'Квилл',
      type: 'imaginary',
      subtype: 'other_creature',
      descriptionLanguage: 'en',
      appearanceTraits: {
        species: 'paper owl',
        primaryColor: 'cream paper',
        secondaryColor: 'ink blue and brass',
        size: 'approximately 46 cm tall',
        magicalFeatures: ['layered paper feathers', 'three chest marks'],
        customDescription:
          'A small living owl constructed from layered cream paper with ink-blue edges.',
      },
      personality: {
        traits: ['thoughtful', 'observant', 'patient'],
        favoriteActivities: ['reading maps', 'organizing clues'],
      },
      aiGeneratedDescription:
        'Small fictional male paper owl named Quill, approximately 46 cm tall. Cream layered-paper feathers with thin ink-blue edges, amber eyes surrounded by two dark-blue circular eye rings, small brass beak. Wings formed from overlapping leaf-shaped paper layers. Exactly three dark-blue V-shaped marks arranged vertically on the chest. Brass talons. No glasses, books, writing quills, printed text, or loose pages. Preserve paper layering, eye rings, three chest marks, and brass details exactly.',
    },
  },
  {
    childName: 'Зури',
    payload: {
      name: 'Веспер',
      type: 'imaginary',
      subtype: 'other_creature',
      descriptionLanguage: 'en',
      appearanceTraits: {
        species: 'cosmic lynx',
        primaryColor: 'deep indigo',
        secondaryColor: 'violet blue, silver, and teal',
        size: 'approximately 62 cm at the shoulder',
        magicalFeatures: ['glowing eyes', 'seven-dot constellation', 'silver star speckles'],
        customDescription:
          'A young cosmic lynx with a seven-dot constellation and a silver crescent on the chest.',
      },
      personality: {
        traits: ['independent', 'observant', 'calm'],
        favoriteActivities: ['stargazing', 'solving mysteries'],
      },
      aiGeneratedDescription:
        'Young fictional female cosmic lynx named Vesper, approximately 62 cm at the shoulder. Deep-indigo fur, lighter violet-blue chest and lower muzzle, glowing teal eyes. Long silver ear tufts and one small V-shaped notch in the right ear. Fine subtle silver star speckles across the fur. Exactly seven brighter dots on the left side form a question-mark constellation. One silver crescent centered on the chest. Short lynx tail with a teal tip, large soft paws, no visible claws. Preserve right-ear notch, seven-dot constellation, chest crescent, and tail-tip color exactly.',
    },
  },
] as const;

function extractNumericLimit(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'limit' in value) {
    const limit = (value as { limit?: unknown }).limit;
    return typeof limit === 'number' && Number.isFinite(limit) ? limit : null;
  }
  return null;
}

function hasTurnaround(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && 'url' in value && value.url);
}

async function main(): Promise<void> {
  if (!userId) {
    throw new Error('Pass --user-id=<uuid> or set PRESENTATION_USER_ID');
  }

  const [target] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      status: users.status,
      subscriptionId: userSubscriptions.id,
      subscriptionStatus: userSubscriptions.status,
      paymentProvider: userSubscriptions.paymentProvider,
      currentPeriodStart: userSubscriptions.currentPeriodStart,
      currentPeriodEnd: userSubscriptions.currentPeriodEnd,
      resetAt: userSubscriptions.resetAt,
      subscriptionMetadata: userSubscriptions.metadata,
      planSlug: plans.slug,
      featureValue: planFeatures.value,
    })
    .from(users)
    .innerJoin(userSubscriptions, eq(userSubscriptions.userId, users.id))
    .innerJoin(plans, eq(plans.id, userSubscriptions.planId))
    .leftJoin(
      planFeatures,
      and(
        eq(planFeatures.planId, plans.id),
        eq(
          planFeatures.featureId,
          db
            .select({ id: features.id })
            .from(features)
            .where(eq(features.slug, CHARACTER_QUOTA_FEATURE_SLUG))
        )
      )
    )
    .where(eq(users.id, userId))
    .limit(1);

  if (!target || target.status !== 'active' || target.subscriptionStatus !== 'active') {
    throw new Error('Target user or subscription does not exist or is not active');
  }

  const childRows = await db
    .select({ id: childProfiles.id, name: childProfiles.name })
    .from(childProfiles)
    .where(and(eq(childProfiles.userId, userId), eq(childProfiles.isActive, true)));
  const childByName = new Map(childRows.map((child) => [child.name, child.id]));

  const expectedChildren = new Set(characterDefinitions.map((definition) => definition.childName));
  for (const childName of expectedChildren) {
    if (!childByName.has(childName)) {
      throw new Error(`Required child profile is missing: ${childName}`);
    }
  }

  const parsedDefinitions = characterDefinitions.map((definition) => ({
    childName: definition.childName,
    payload: CreateCharacterSchema.parse({
      ...definition.payload,
      childProfileId: childByName.get(definition.childName),
    }),
  }));

  const existingRows = await db
    .select()
    .from(characters)
    .where(
      and(
        eq(characters.userId, userId),
        eq(characters.isActive, true),
        eq(characters.isHidden, false)
      )
    );
  const expectedNames = new Set(parsedDefinitions.map((definition) => definition.payload.name));
  const existingByName = new Map(
    existingRows
      .filter((character) => expectedNames.has(character.name))
      .map((character) => [character.name, character])
  );
  const missingCount = parsedDefinitions.filter(
    (definition) => !existingByName.has(definition.payload.name)
  ).length;

  let activePeriod = resolveActiveSubscriptionPeriod({
    currentPeriodStart: target.currentPeriodStart,
    currentPeriodEnd: target.currentPeriodEnd,
    resetAt: target.resetAt,
    paymentProvider: target.paymentProvider,
  });

  const metadata = (target.subscriptionMetadata || {}) as Record<string, unknown>;
  const mayRefreshDemoPeriod =
    target.displayName === 'QA Free User' &&
    target.planSlug === 'golden' &&
    metadata.source === 'seedQaTestAccounts' &&
    metadata.code === 'FREE_USER';

  if (activePeriod.expiredStripePeriod) {
    if (!REFRESH_DEMO_PERIOD) {
      throw new Error('Demo subscription period is expired; pass --refresh-demo-period');
    }
    if (!mayRefreshDemoPeriod) {
      throw new Error(
        'Refusing to refresh period: target is not the guarded QA presentation account'
      );
    }

    const { periodStart, periodEnd } = createMonthlyPeriod();
    if (EXECUTE) {
      await db
        .update(userSubscriptions)
        .set({
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          resetAt: periodEnd,
          storiesUsed: 0,
          audioMinutesUsed: 0,
          metadata: {
            ...metadata,
            presentationDemoPeriodOverride: true,
            presentationDemoPeriodRefreshedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(userSubscriptions.id, target.subscriptionId));
    }
    activePeriod = {
      periodStart,
      periodEnd,
      shouldReset: false,
      expiredStripePeriod: false,
    };
  }

  const [usageRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${usageEvents.quantity}), 0)::integer` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        eq(usageEvents.eventType, CHARACTER_USAGE_EVENT),
        gte(usageEvents.createdAt, activePeriod.periodStart),
        lt(usageEvents.createdAt, activePeriod.periodEnd)
      )
    );
  const used = Number(usageRow?.total ?? 0);
  const limit = extractNumericLimit(target.featureValue) ?? 3;
  const remaining = Math.max(0, limit - used);

  if (missingCount > remaining) {
    throw new Error(
      `Character quota is insufficient: used=${used}, missing=${missingCount}, limit=${limit}`
    );
  }

  console.log(
    JSON.stringify({
      mode: EXECUTE ? 'execute' : 'dry-run',
      target: { id: target.id, displayName: target.displayName, plan: target.planSlug },
      demoPeriod: {
        refreshed: activePeriod.periodStart > target.currentPeriodStart,
        start: activePeriod.periodStart.toISOString(),
        end: activePeriod.periodEnd.toISOString(),
      },
      quota: { limit, used, remaining, missing: missingCount },
      characters: parsedDefinitions.map((definition) => ({
        name: definition.payload.name,
        type: definition.payload.type,
        subtype: definition.payload.subtype,
        childName: definition.childName,
        childProfileId: definition.payload.childProfileId,
        action: existingByName.has(definition.payload.name) ? 'verify-or-resume' : 'create',
      })),
    })
  );

  if (!EXECUTE) return;

  const processedCharacters: Character[] = [];
  let createdAny = false;

  for (const definition of parsedDefinitions) {
    const data = definition.payload;
    let character = existingByName.get(data.name);
    let createdNow = false;
    let reservationId: string | null = null;

    if (character) {
      if (
        character.type !== data.type ||
        character.subtype !== (data.subtype ?? null) ||
        character.childProfileId !== data.childProfileId
      ) {
        throw new Error(`Existing character conflicts with the plan: ${data.name}`);
      }
    } else {
      const reservation = await reserveManualCharacterQuota(userId, {
        childProfileId: data.childProfileId ?? null,
        source: 'parent',
        characterName: data.name,
        characterType: data.type,
      });
      reservationId = reservation.reservationId;

      try {
        character = await characterService.createCharacter(userId, {
          ...data,
          childProfileId: data.childProfileId ?? null,
          createdByMode: 'parent',
          createdByChildProfileId: null,
        });
        createdNow = true;
        createdAny = true;
      } catch (error) {
        await releaseManualCharacterQuotaReservation(userId, reservationId, {
          reason: 'generation_failed',
          childProfileId: data.childProfileId ?? null,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    const turnaroundReady = hasTurnaround(character.turnaroundSheet);
    if (!turnaroundReady) {
      try {
        await generateLlmCharacterTurnaround({
          characterId: character.id,
          userId,
          characterName: character.name,
          characterDescription: data.aiGeneratedDescription || data.description || '',
          useCache: false,
        });
      } catch (error) {
        if (reservationId) {
          await releaseManualCharacterQuotaReservation(userId, reservationId, {
            reason: 'generation_failed',
            childProfileId: data.childProfileId ?? null,
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
        if (createdNow) {
          await characterService.deleteCharacter(character.id, userId);
        }
        throw error;
      }
    }

    const updated = await characterService.getCharacterById(character.id, userId);
    processedCharacters.push(updated ?? character);
    console.log(
      JSON.stringify({
        name: character.name,
        id: character.id,
        childName: definition.childName,
        status: createdNow
          ? 'created'
          : turnaroundReady
            ? 'already-complete'
            : 'turnaround-resumed',
        turnaroundReady: hasTurnaround(updated?.turnaroundSheet),
      })
    );
  }

  // createCharacter localizes names in the background. Keep the database open until those
  // tasks finish, then repair any missing locale rows explicitly before the runner exits.
  if (createdAny) {
    await waitForBackgroundNameLocalizations(processedCharacters.map((character) => character.id));
  }
  await ensureCharacterNameLocalizations(processedCharacters);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection();
  });
