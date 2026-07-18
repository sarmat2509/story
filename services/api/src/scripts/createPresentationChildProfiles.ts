/**
 * Idempotently create the seven canonical presentation child profiles.
 *
 * Dry run:
 *   pnpm create:presentation-children -- --user-id=<uuid>
 *
 * Execute:
 *   pnpm create:presentation-children -- --user-id=<uuid> --execute
 */

import './loadEnvForScripts';

import { CreateChildProfileSchema } from '@wondertales/shared';
import { eq } from 'drizzle-orm';
import { closeDatabaseConnection, db } from '../db';
import { users } from '../db/schema';
import * as childProfileService from '../services/childProfileService';
import { ensureChildDataConsent } from '../services/consentService';
import * as planService from '../services/planService';
import { generateTurnaroundSheetFromDescription } from '../services/turnaroundSheetService';

const EXECUTE = process.argv.includes('--execute');
const userId =
  process.argv.find((arg) => arg.startsWith('--user-id='))?.slice('--user-id='.length).trim() ||
  process.env.PRESENTATION_USER_ID?.trim();

const profiles = [
  {
    name: 'Ноа',
    birthDate: '2025-05-10',
    languages: ['uk'],
    storyCreationMode: 'artisan',
    storyTextSizeMultiplier: 1,
    descriptionLanguage: 'en',
    appearanceTraits: {
      hairColor: 'red',
      hairLength: 'short',
      hairStyle: 'curly',
      eyeColor: 'grey',
      skinTone: 'very_light',
      distinctiveFeatures: ['curly_hair', 'round_face', 'rosy_cheeks'],
    },
    personality: {
      traits: ['calm', 'careful', 'curious'],
      favoriteActivities: ['animals', 'nature'],
    },
    interests: ['animals', 'family', 'fairy_tales'],
    sensitivities: {
      fearLevel: 'low',
      commonFears: ['separation_from_parents'],
      avoidTopics: ['loud_situations'],
    },
    familyCast: { mother: 'Мара' },
    aiGeneratedDescription:
      'Boy named Noa, approximately 78 cm tall, with a large round head, short neck, chubby arms and legs, small belly, and a wide slightly unsteady stance. Very light neutral peach-pink skin, round face, high forehead, full cheeks, large cool gray-blue eyes, very light thin eyebrows, tiny short rounded nose, small lips. Short soft copper-red baby curls with one clearly recognizable curl centered on the forehead. Mustard-yellow long-sleeve romper, cream Peter Pan collar and cream cuffs, one tiny embroidered crescent on the chest, pale teal socks, no shoes. Calm cautious expression. Preserve curl placement, colors, body shape, and outfit in every view.',
    authorPseudonym: null,
    authorAboutMe: null,
  },
  {
    name: 'Лина',
    birthDate: '2023-04-18',
    languages: ['en', 'de', 'pl'],
    storyCreationMode: 'artisan',
    storyTextSizeMultiplier: 1,
    descriptionLanguage: 'en',
    appearanceTraits: {
      hairColor: 'blonde',
      hairLength: 'short',
      hairStyle: 'straight',
      eyeColor: 'blue',
      skinTone: 'light',
      distinctiveFeatures: ['glasses', 'straight_hair', 'round_face'],
    },
    personality: {
      traits: ['sociable', 'curious', 'careful'],
      favoriteActivities: ['puzzles', 'drawing', 'reading'],
    },
    interests: ['animals', 'friends', 'family'],
    sensitivities: {
      fearLevel: 'low',
      commonFears: ['loud_noises'],
      avoidTopics: ['loud_situations'],
    },
    aiGeneratedDescription:
      'Girl named Lina, approximately 98 cm tall, with a relatively large head, compact torso, short limbs, and softly rounded knees. Light neutral-warm skin, oval-round face, soft cheeks, wide clear blue eyes, small slightly upturned nose, pink lips. Straight light-blonde chin-length bob with a subtle golden tone, blunt short bangs sitting 1 to 1.5 cm above the eyebrows, ends gently curving inward. Matte round red eyeglass frames, identical size and shape in every view. Mint A-line knee-length dress with exactly two large dark-red round pockets, navy leggings, cream socks, red hook-and-loop shoes. No hair clips or jewelry. Curious friendly expression. Preserve the glasses, bob silhouette, pockets, body shape, and outfit exactly.',
    authorPseudonym: null,
    authorAboutMe: null,
  },
  {
    name: 'Майя',
    birthDate: '2021-03-10',
    languages: ['es', 'fr', 'pl'],
    storyCreationMode: 'artisan',
    storyTextSizeMultiplier: 1,
    descriptionLanguage: 'en',
    appearanceTraits: {
      hairColor: 'dark_brown',
      hairLength: 'long',
      hairStyle: 'wavy',
      eyeColor: 'brown',
      skinTone: 'medium',
      distinctiveFeatures: ['freckles', 'bright_eyes', 'oval_face'],
    },
    personality: {
      traits: ['creative', 'sociable', 'curious'],
      favoriteActivities: ['drawing', 'painting', 'music'],
    },
    interests: ['forest', 'nature', 'adventure', 'family'],
    sensitivities: { fearLevel: 'none' },
    aiGeneratedDescription:
      'Girl named Maya, approximately 112 cm tall, with a moderately large head and slightly lengthened but still soft child limbs. Medium warm golden beige-brown skin, oval face with full cheeks, almond-shaped dark-brown eyes, thick eyebrows, and a stable scatter of small golden-brown freckles across the nose and upper cheeks. Thick dark-brown type 2C wavy hair falling slightly below the shoulders, left side part, one front lock on her right held by a single teal hair clip. Coral T-shirt, plain cream denim vest, teal trousers, yellow sneakers with white soles, simple teal bracelet on the left wrist. Bright observant expression. Preserve freckles, part direction, clip position, hair length, body shape, and outfit exactly.',
    authorPseudonym: null,
    authorAboutMe: null,
  },
  {
    name: 'Сами',
    birthDate: '2019-02-14',
    languages: ['ru', 'es', 'fr'],
    storyCreationMode: 'artisan',
    storyTextSizeMultiplier: 1,
    descriptionLanguage: 'en',
    appearanceTraits: {
      hairColor: 'black',
      hairLength: 'short',
      hairStyle: 'curly',
      eyeColor: 'brown',
      skinTone: 'tan',
      distinctiveFeatures: ['glasses', 'dimples', 'curly_hair'],
    },
    personality: {
      traits: ['brave', 'adventurous', 'careful', 'curious'],
      favoriteActivities: ['sports', 'swimming', 'building'],
    },
    interests: ['dragons', 'ocean', 'adventure', 'magic'],
    sensitivities: { fearLevel: 'low' },
    aiGeneratedDescription:
      'Boy named Sami, approximately 126 cm tall, lean and active. Warm golden-bronze tan skin, softly rectangular face, dark-brown eyes, thick eyebrows, broad short nose, and one visible smile dimple on the right cheek. Short dense black type 3C curls forming a neat rounded silhouette, no shaved lines. Violet softly rectangular eyeglass frames. Plain green bomber jacket, mustard T-shirt, navy joggers, gray-and-white sneakers with green laces, exactly one small orange carabiner attached to the right trouser belt loop. Brave inquisitive expression. Preserve glasses, curl silhouette, right-cheek dimple, body shape, and carabiner location exactly.',
    authorPseudonym: null,
    authorAboutMe: null,
  },
  {
    name: 'Амара',
    birthDate: '2018-04-01',
    languages: ['uk', 'en', 'de'],
    storyCreationMode: 'artisan',
    storyTextSizeMultiplier: 1,
    descriptionLanguage: 'en',
    appearanceTraits: {
      hairColor: 'black',
      hairLength: 'long',
      hairStyle: 'braided',
      eyeColor: 'dark_brown',
      skinTone: 'brown',
      distinctiveFeatures: ['braids', 'bright_eyes', 'oval_face'],
    },
    personality: {
      traits: ['confident', 'empathetic', 'brave', 'patient'],
      favoriteActivities: ['sports', 'dancing', 'music'],
    },
    interests: ['superheroes', 'sports', 'friends'],
    sensitivities: { fearLevel: 'none' },
    familyCast: { father: 'Тео' },
    aiGeneratedDescription:
      'Girl named Amara, approximately 132 cm tall, athletic with straight shoulders and strong legs, without adult musculature. Rich warm brown chestnut skin, oval face, large dark-brown eyes, thick gently arched eyebrows, broad nose, full lips. Very dark type 4A hair with a precise center part, styled into exactly six long braids, three on each side. Exactly two yellow beads at the end of every braid, twelve beads total. Blue full-length denim overalls, cream T-shirt with broad terracotta stripes, pale-blue socks, yellow high-top sneakers, dark-violet sport wristband on the right wrist. Confident kind expression. Preserve exact braid and bead counts, skin tone, body shape, and outfit.',
    authorPseudonym: null,
    authorAboutMe: null,
  },
  {
    name: 'Рави',
    birthDate: '2016-02-16',
    languages: ['de', 'en', 'pl'],
    storyCreationMode: 'artisan',
    storyTextSizeMultiplier: 1,
    descriptionLanguage: 'en',
    appearanceTraits: {
      hairColor: 'black',
      hairLength: 'short',
      hairStyle: 'side_part',
      eyeColor: 'dark_brown',
      skinTone: 'dark_brown',
      distinctiveFeatures: ['birthmark', 'straight_hair', 'oval_face'],
    },
    personality: {
      traits: ['analytical', 'thoughtful', 'curious', 'patient'],
      favoriteActivities: ['computers', 'building', 'puzzles', 'reading'],
    },
    interests: ['robots', 'science', 'space', 'adventure'],
    sensitivities: { fearLevel: 'low' },
    aiGeneratedDescription:
      'Boy named Ravi, approximately 143 cm tall, slender with longer limbs, narrow shoulders, and a soft child facial structure. Deep dark-brown skin with a warm mahogany undertone, elongated oval face, dark-brown eyes, thick straight eyebrows, medium straight nose. One small round mole on the left cheek slightly below the outer corner of the eye. Straight black type 1C medium-short hair, deep side part on his right, most hair neatly combed toward his left. Plain orange hoodie with a narrow navy T-shirt edge visible at the neckline, charcoal cargo trousers, navy sneakers with orange details, blue digital watch on the right wrist with a blank screen. Thoughtful analytical expression. Preserve mole location, part direction, body shape, and outfit.',
    authorPseudonym: null,
    authorAboutMe: null,
  },
  {
    name: 'Зури',
    birthDate: '2014-03-08',
    languages: ['ru', 'es', 'fr'],
    storyCreationMode: 'artisan',
    storyTextSizeMultiplier: 1,
    descriptionLanguage: 'en',
    appearanceTraits: {
      hairColor: 'black',
      hairLength: 'medium',
      hairStyle: 'bun',
      eyeColor: 'dark_brown',
      skinTone: 'very_dark',
      distinctiveFeatures: ['glasses', 'bright_eyes', 'oval_face'],
    },
    personality: {
      traits: ['independent', 'analytical', 'thoughtful', 'confident'],
      favoriteActivities: ['reading', 'puzzles', 'computers', 'drawing'],
    },
    interests: ['space', 'magic', 'science', 'adventure'],
    sensitivities: { fearLevel: 'none' },
    aiGeneratedDescription:
      'Girl named Zuri, approximately 156 cm tall, tall and slender with narrow shoulders, neutral posture, and no makeup. Very deep dark skin with a neutral-cool undertone, oval-heart-shaped face, almost-black almond eyes, thick straight eyebrows, broad refined nose, full lips. Type 4B hair with a center part and exactly two equal high round voluminous buns, with short natural baby curls along the hairline. Translucent saturated-teal soft-hexagonal glasses. Exactly one small silver crescent hair clip above the left temple. Violet cropped jacket, plain pale-teal T-shirt, loose black cargo trousers, white sneakers with violet details. Calm observant expression. Preserve glasses, two-bun silhouette, clip position, skin tone, body shape, and outfit.',
    authorPseudonym: null,
    authorAboutMe: null,
  },
] as const;

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  if (!userId) {
    throw new Error('Pass --user-id=<uuid> or set PRESENTATION_USER_ID');
  }

  const parsedProfiles = profiles.map((profile) => {
    const parsed = CreateChildProfileSchema.parse(profile);
    return {
      ...parsed,
      birthDate: isoDate(parsed.birthDate),
    };
  });

  const [targetUser] = await db
    .select({ id: users.id, displayName: users.displayName, role: users.role, status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!targetUser || targetUser.status !== 'active') {
    throw new Error('Target user does not exist or is not active');
  }

  const existing = await childProfileService.getChildProfiles(userId);
  const existingByName = new Map(existing.map((profile) => [profile.name, profile]));
  const limit = await planService.getFeatureLimit(userId, 'child_profiles_limit');
  const missingCount = parsedProfiles.filter((profile) => !existingByName.has(profile.name)).length;

  if (limit !== null && existing.length + missingCount > limit) {
    throw new Error(
      `Child profile quota is insufficient: existing=${existing.length}, missing=${missingCount}, limit=${limit}`
    );
  }

  console.log(
    JSON.stringify({
      mode: EXECUTE ? 'execute' : 'dry-run',
      target: { id: targetUser.id, displayName: targetUser.displayName, role: targetUser.role },
      quota: { limit, existing: existing.length, missing: missingCount },
      profiles: parsedProfiles.map((profile) => ({
        name: profile.name,
        birthDate: profile.birthDate,
        languages: profile.languages,
        action: existingByName.has(profile.name) ? 'verify-or-resume' : 'create',
      })),
    })
  );

  if (!EXECUTE) return;

  await ensureChildDataConsent(userId, true, {
    context: { source: 'production_presentation_child_seed' },
  });

  for (const profileData of parsedProfiles) {
    let profile = existingByName.get(profileData.name);
    let createdNow = false;

    if (profile && String(profile.birthDate) !== profileData.birthDate) {
      throw new Error(
        `Existing profile ${profile.name} has birthDate ${profile.birthDate}, expected ${profileData.birthDate}`
      );
    }

    if (!profile) {
      profile = await childProfileService.createChildProfile(userId, profileData);
      createdNow = true;
    }

    const hasTurnaround = Boolean(
      profile.turnaroundSheet &&
        typeof profile.turnaroundSheet === 'object' &&
        'url' in profile.turnaroundSheet &&
        profile.turnaroundSheet.url
    );

    if (!hasTurnaround) {
      try {
        const currentAgeMonths = childProfileService.getAgeData(
          new Date(profile.birthDate)
        ).ageMonths;
        await generateTurnaroundSheetFromDescription({
          targetType: 'child',
          targetId: profile.id,
          characterName: profile.name,
          characterDescription: profileData.aiGeneratedDescription || '',
          currentAgeMonths,
          userId,
        });
      } catch (error) {
        if (createdNow) {
          await childProfileService.deleteChildProfile(profile.id, userId);
        }
        throw error;
      }
    }

    const updated = await childProfileService.getChildProfileById(profile.id, userId);
    const currentAgeMonths = childProfileService.getAgeData(new Date(profile.birthDate)).ageMonths;
    console.log(
      JSON.stringify({
        name: profile.name,
        id: profile.id,
        status: createdNow ? 'created' : hasTurnaround ? 'already-complete' : 'turnaround-resumed',
        currentAgeMonths,
        turnaroundReady: Boolean(updated?.turnaroundSheet),
      })
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection();
  });
