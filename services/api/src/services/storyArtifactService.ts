import type { StoryArtifact } from '../db/schema';
import { DEFAULT_LOCALE, isValidLocale, type Locale } from '@wondertales/shared';
import { getDictionaryRepository, getStoryArtifactRepository } from '../repositories';
import { generateEmbedding } from './embeddingService';
import { logger } from '../utils/logger';
import {
  STORY_ARTIFACT_TITLE_FIELD,
  STORY_ARTIFACT_TRANSLATION_ENTITY,
} from './translationService';

export const STORY_ARTIFACT_EMBEDDING_MODEL = 'gemini-embedding-001';

export interface StoryArtifactPromptRef {
  id: string;
  artifactCode: string;
  title: string;
  description: string;
  imagePath: string;
  selection?: {
    source: 'embedding' | 'scenario_random' | 'global_random';
    score: number | null;
    candidateCount: number;
    scenarioFiltered: boolean;
  };
}

interface StoryArtifactSelectionInput {
  locale?: Locale | string | null;
  scenarioCard?: {
    id: string;
    name: string;
    description: string;
    promptGuidance?: string;
  };
  scenarioGuidance?: string;
  goalName?: string;
  goalGuidance?: string;
  userNotes?: string;
  worldRule?: { name: string; description: string };
  childProfile?: {
    interests?: string[] | null;
  } | null;
}

export function normalizeStoryArtifactLocale(locale?: Locale | string | null): Locale {
  const normalized = locale?.slice(0, 2).toLowerCase();
  return normalized && isValidLocale(normalized) ? normalized : DEFAULT_LOCALE;
}

export async function resolveStoryArtifactTitle(
  artifact: Pick<StoryArtifact, 'artifactCode' | 'title'>,
  locale?: Locale | string | null,
): Promise<string> {
  const normalizedLocale = normalizeStoryArtifactLocale(locale);
  const translations = await getDictionaryRepository().findTranslations(
    STORY_ARTIFACT_TRANSLATION_ENTITY,
    [artifact.artifactCode],
    normalizedLocale,
  );
  const localizedTitle = translations.find(
    (translation) =>
      translation.fieldName === STORY_ARTIFACT_TITLE_FIELD && translation.value.trim().length > 0,
  );

  return localizedTitle?.value.trim() || artifact.title;
}

const SCENARIO_ARTIFACT_SEARCH_HINTS: Record<string, string> = {
  magic_wizards: 'магия руна амулет кристалл ключ жезл светящийся перо заклинание',
  fantasy_creatures: 'перо коготь чешуйка яйцо амулет светящийся след лесной зверь',
  mysteries_detectives: 'ключ лупа компас карта жетон пуговица след тайна улика',
  space_odyssey: 'звезда ракета марсианская капсула космос метеорит шайба линза',
  medieval_heroes: 'щит корона кольцо медальон ключ камень бронза золото герб',
  sea_treasures: 'ракушка жемчуг компас бутылка коралл камень карта морской стекло',
  super_powers: 'значок браслет искра капсула линза молния светящийся символ',
  enchanted_forest: 'лист семя желудь перо мох цветок папоротник лесной камень',
  inventors: 'шестеренка гайка болт линза пропеллер капсула медь сталь механизм',
  jungle_adventures: 'маска майя коготь перо камень амулет карта джунгли руины',
  scary_stories: 'череп паук скарабей коготь темный кольцо обсидиан призрачный',
  expeditions_world_travel: 'компас карабин карта камень жетон бинокль маршрут север',
  macro_scifi: 'робот линза капсула звездный магнитный турбина металл сигнал',
};

export function toStoryArtifactPromptRef(artifact: StoryArtifact): StoryArtifactPromptRef {
  return {
    id: artifact.id,
    artifactCode: artifact.artifactCode,
    title: artifact.title,
    description: artifact.description,
    imagePath: artifact.imagePath,
  };
}

export function toLocalizedStoryArtifactPromptRef(
  artifact: StoryArtifact,
  localizedTitle: string,
): StoryArtifactPromptRef {
  return {
    ...toStoryArtifactPromptRef(artifact),
    title: localizedTitle,
  };
}

export function buildStoryArtifactSearchText(input: StoryArtifactSelectionInput): string {
  const parts = [
    input.scenarioCard?.id ? SCENARIO_ARTIFACT_SEARCH_HINTS[input.scenarioCard.id] : undefined,
    input.scenarioCard?.name,
    input.scenarioCard?.description,
    input.scenarioCard?.promptGuidance,
    input.scenarioGuidance,
    input.goalName,
    input.goalGuidance,
    input.worldRule?.name,
    input.worldRule?.description,
    input.userNotes,
    ...(input.childProfile?.interests || []),
  ];

  return parts
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ');
}

export async function selectStoryArtifactForPrompt(
  input: StoryArtifactSelectionInput,
): Promise<StoryArtifactPromptRef | undefined> {
  const searchText = buildStoryArtifactSearchText(input);
  const repo = getStoryArtifactRepository();
  const queryEmbedding = searchText.trim()
    ? await generateEmbedding(searchText).catch((err) => {
        logger.warn(
          { err, scenarioCardId: input.scenarioCard?.id },
          'Story artifact query embedding failed; falling back to scenario-filtered random selection',
        );
        return undefined;
      })
    : undefined;
  const match = await repo.findBestForStoryContext({
    scenarioCardId: input.scenarioCard?.id,
    queryEmbedding,
    topK: 5,
  });

  if (!match) {
    logger.warn({ searchTextPreview: searchText.slice(0, 180) }, 'No active story artifact found');
    return undefined;
  }

  const { artifact } = match;
  const localizedTitle = await resolveStoryArtifactTitle(artifact, input.locale);
  logger.info(
    {
      artifactId: artifact.id,
      artifactCode: artifact.artifactCode,
      artifactTitle: localizedTitle,
      canonicalArtifactTitle: artifact.title,
      scenarioCardId: input.scenarioCard?.id,
      selectionSource: match.source,
      score: match.score,
      candidateCount: match.candidateCount,
      scenarioFiltered: match.scenarioFiltered,
      searchTextPreview: searchText.slice(0, 180),
    },
    'Selected story artifact for writer prompt',
  );

  return {
    ...toLocalizedStoryArtifactPromptRef(artifact, localizedTitle),
    selection: {
      source: match.source,
      score: match.score,
      candidateCount: match.candidateCount,
      scenarioFiltered: match.scenarioFiltered,
    },
  };
}
