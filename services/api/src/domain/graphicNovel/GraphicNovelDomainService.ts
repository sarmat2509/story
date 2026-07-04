import type { EpisodeText, SceneValidationResult, StoryEnvironment, StoryOutfitRow, StorySpec } from '../../ai/types';
import type { ITextProvider } from '../../providers/base/ITextProvider';
import type { UsageMetadata } from '../../providers/base/UsageMetadata';
import type { CameraCharacterComposition } from '../../services/types';
import {
  buildValidationPrompt,
  buildGraphicNovelPrompt,
  buildGraphicNovelSafetyFallbackPrompt,
  GRAPHIC_NOVEL_SCRIPT_SCHEMA,
} from '../../prompts/text';
import type { ContinuationPromptContext } from '../../prompts/helpers';
import type {
  GraphicNovelBubbleTextSizing,
  GraphicNovelPageRole,
  GraphicNovelPanelVisual,
  GraphicNovelPanelScript,
  GraphicNovelScript,
} from './types';
import { planGraphicNovelLayouts } from './layoutPlanner';
import { logger } from '../../utils/logger';
import config from '../../config';
import { VALIDATION_SCHEMA } from '../story/schemas';

const GRAPHIC_NOVEL_MAX_OUTPUT_TOKENS = 48000;
const FALLBACK_ENVIRONMENT_ID = 'env_main';
type OutfitKind = 'natural' | 'everyday' | 'swimwear';

function isProviderContentBlockedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /PROHIBITED_CONTENT|Content blocked|content filter|blocked by/i.test(message);
}

class GraphicNovelScriptTextValidationError extends Error {
  constructor(
    public readonly failures: Array<{
      pageNumber: number;
      violations: SceneValidationResult['violations'];
    }>
  ) {
    super(
      `Graphic novel script text validation failed: ${failures
        .flatMap((failure) =>
          failure.violations.map(
            (violation) => `page ${failure.pageNumber}: ${violation.category}: ${violation.message}`
          )
        )
        .join('; ')}`
    );
    this.name = 'GraphicNovelScriptTextValidationError';
  }
}

function isGraphicNovelScriptRetryableError(error: unknown): boolean {
  return error instanceof GraphicNovelScriptTextValidationError;
}

function roleForPage(pageNumber: number, pageCount: number): GraphicNovelPageRole {
  if (pageNumber === 1) return 'opening';
  if (pageNumber === 2) return 'setup';
  if (pageNumber === pageCount) return 'resolution';
  const roles: GraphicNovelPageRole[] = ['conversation', 'action', 'reveal', 'reflection'];
  return roles[(pageNumber - 3) % roles.length];
}

function fallbackEnvironment(spec: StorySpec): StoryEnvironment {
  return {
    id: FALLBACK_ENVIRONMENT_ID,
    name: spec.scenarioCard?.name || spec.goalName || 'Main Story Place',
    description:
      'A clear child-friendly story location with simple fixed objects, readable open space for characters, warm colors, and uncluttered background areas.',
  };
}

function normalizeEnvironments(script: GraphicNovelScript, spec: StorySpec): StoryEnvironment[] {
  const seen = new Set<string>();
  const environments = (Array.isArray(script.environments) ? script.environments : [])
    .filter((environment) => environment?.id && environment?.description)
    .map((environment) => ({
      id: environment.id,
      name: environment.name || environment.id,
      description: environment.description,
      characterOutfits: environment.characterOutfits,
    }))
    .filter((environment) => {
      if (seen.has(environment.id)) return false;
      seen.add(environment.id);
      return true;
    });

  return environments.length > 0 ? environments : [fallbackEnvironment(spec)];
}

function normalizeOutfits(script: GraphicNovelScript): Map<string, StoryOutfitRow> {
  const outfits = new Map<string, StoryOutfitRow>();
  for (const outfit of Array.isArray(script.outfits) ? script.outfits : []) {
    const id = String(outfit?.id || '').trim();
    const characterName = String(outfit?.characterName || '').trim();
    const description = String(outfit?.description || '').trim();
    if (!id || !characterName || !description || outfits.has(id)) continue;
    outfits.set(id, { id, characterName, description });
  }
  return outfits;
}

function outfitKeyForCharacter(characterName: string, kind: OutfitKind): string {
  const hex = Buffer.from(characterName.trim() || 'character', 'utf8')
    .toString('hex')
    .slice(0, 10);
  return `o_${hex}_${kind}`;
}

function isHumanStoryCharacter(spec: StorySpec, characterName: string): boolean {
  const lower = characterName.trim().toLowerCase();
  const match = (spec.characters || []).find(
    (character) =>
      String(character.name || '')
        .trim()
        .toLowerCase() === lower
  );
  const type = String(match?.type || '').toLowerCase();
  return ['child', 'person', 'human', 'adult', 'parent'].includes(type);
}

function isSwimmingPanel(panel: GraphicNovelPanelScript): boolean {
  const text = [
    panel.visual?.primaryRead,
    panel.visual?.sceneVisual?.setting,
    typeof panel.visual?.sceneVisual?.cameraComposition === 'object'
      ? panel.visual.sceneVisual.cameraComposition.shot
      : panel.visual?.sceneVisual?.cameraComposition,
    ...(panel.dialogue || []).map((line) => line.text),
    ...(panel.thoughts || []).map((line) => line.text),
    panel.caption,
    panel.visualAction,
    panel.setting,
    panel.artPrompt,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /(swim|swimming|swimsuit|bathing|pool|water play|плав|купа|пірна|басейн|озер|вод[аиіою])/iu.test(
    text
  );
}

function isSwimwearDescription(description: string): boolean {
  return /(swimwear|swimsuit|swimming trunks|bathing suit|rash guard|wetsuit|купальн|плавки|купальник)/iu.test(
    description
  );
}

function ensureOutfit(
  outfits: Map<string, StoryOutfitRow>,
  params: {
    characterName: string;
  }
): string {
  const id = outfitKeyForCharacter(params.characterName, 'natural');
  if (!outfits.has(id)) {
    outfits.set(id, {
      id,
      characterName: params.characterName,
      description: 'natural appearance',
    });
  }
  return id;
}

function panelSpeakers(panel: GraphicNovelPanelScript): string[] {
  const names = new Set<string>();
  for (const line of [...(panel.dialogue || []), ...(panel.thoughts || [])]) {
    const speaker = String(line?.speaker || '').trim();
    if (speaker) names.add(speaker);
  }
  return [...names];
}

function withRequiredPanelCharacters(
  panel: GraphicNovelPanelScript,
  characters: CameraCharacterComposition[]
): CameraCharacterComposition[] {
  const byName = new Map<string, CameraCharacterComposition>();
  for (const character of characters) {
    const name = String(character.name || '').trim();
    if (!name || byName.has(name)) continue;
    byName.set(name, character);
  }

  for (const speaker of panelSpeakers(panel)) {
    if (byName.has(speaker)) continue;
    const index = byName.size;
    byName.set(speaker, {
      name: speaker,
      position: index % 2 === 0 ? 'left_foreground' : 'right_foreground',
      description:
        index % 2 === 0
          ? 'visible in the panel, readable expression, looking toward the other speaker or panel action'
          : 'visible in the panel, responding to the other speaker, readable expression and clear gaze',
    });
  }

  return [...byName.values()];
}

function withOutfitIds(
  panel: GraphicNovelPanelScript,
  spec: StorySpec,
  outfits: Map<string, StoryOutfitRow>,
  characters: CameraCharacterComposition[]
): CameraCharacterComposition[] {
  void panel;
  void spec;
  return characters.map((character) => {
    const existing = character.outfitId?.trim();
    const existingOutfit = existing ? outfits.get(existing) : undefined;
    if (existingOutfit) {
      return character;
    }
    return {
      ...character,
      outfitId: ensureOutfit(outfits, { characterName: character.name }),
    };
  });
}

function legacyPrimaryRead(panel: GraphicNovelPanelScript, panelIndex: number): string {
  return (
    panel.visual?.primaryRead ||
    panel.visualAction ||
    panel.artPrompt ||
    (panel.caption?.trim() ? panel.caption.trim() : null) ||
    (panel.dialogue?.[0]?.text ? `${panel.dialogue[0].speaker} speaks` : null) ||
    `Panel ${panelIndex} story beat`
  );
}

function legacyCharacters(panel: GraphicNovelPanelScript): CameraCharacterComposition[] {
  const sceneCharacters = panel.visual?.sceneVisual?.cameraComposition;
  if (
    sceneCharacters &&
    typeof sceneCharacters !== 'string' &&
    Array.isArray(sceneCharacters.characters)
  ) {
    return sceneCharacters.characters.map((character) => ({
      name: character.name,
      description:
        character.description || 'visible in the panel with readable expression and pose',
      position: character.position,
      outfitId: character.outfitId,
    }));
  }

  const oldPanelVisual = panel.panelVisual as any;
  const oldCharacters = oldPanelVisual?.cameraComposition?.characters;
  if (Array.isArray(oldCharacters)) {
    return oldCharacters.map((character: any) => ({
      name: character.name || 'Character',
      description:
        [
          character.placement,
          character.pose,
          character.facialExpression ? `expression: ${character.facialExpression}` : null,
          character.gaze ? `gaze: ${character.gaze}` : null,
          character.gesture ? `gesture: ${character.gesture}` : null,
          character.interaction ? `interaction: ${character.interaction}` : null,
        ]
          .filter(Boolean)
          .join('; ') || 'visible in the panel with readable expression and pose',
    }));
  }

  return (Array.isArray(panel.charactersPresent) ? panel.charactersPresent : []).map(
    (name, index) => ({
      name,
      description:
        index === 0
          ? 'foreground left, readable expression, looking toward the panel action'
          : 'foreground right, readable expression, responding to the other character',
    })
  );
}

function normalizePanelVisual(
  panel: GraphicNovelPanelScript,
  panelIndex: number,
  environments: StoryEnvironment[],
  spec: StorySpec,
  outfits: Map<string, StoryOutfitRow>
): GraphicNovelPanelVisual {
  const environmentIds = new Set(environments.map((environment) => environment.id));
  const fallbackEnvId = environments[0]?.id || FALLBACK_ENVIRONMENT_ID;
  const oldPanelVisual = panel.panelVisual as any;
  const source = panel.visual;
  const environmentId =
    source?.environmentId && environmentIds.has(source.environmentId)
      ? source.environmentId
      : fallbackEnvId;
  const cameraComposition = source?.sceneVisual?.cameraComposition;
  const oldComposition = oldPanelVisual?.cameraComposition;

  const characters = withOutfitIds(
    panel,
    spec,
    outfits,
    withRequiredPanelCharacters(panel, legacyCharacters(panel))
  );

  return {
    environmentId,
    primaryRead: source?.primaryRead || legacyPrimaryRead(panel, panelIndex),
    sceneVisual: {
      setting:
        source?.sceneVisual?.setting ||
        oldPanelVisual?.setting ||
        panel.setting ||
        'Scene-specific visual change in the reusable environment.',
      lighting:
        source?.sceneVisual?.lighting ||
        oldPanelVisual?.lighting ||
        'clear warm child-friendly lighting',
      cameraComposition: {
        shot:
          (typeof cameraComposition === 'object' ? cameraComposition?.shot : undefined) ||
          oldComposition?.shot ||
          'medium shot, eye level',
        characters,
      },
    },
  };
}

function fallbackPanel(pageNumber: number, panelIndex: number): GraphicNovelPanelScript {
  const visualAction =
    panelIndex === 1
      ? 'The characters notice something new with clear curious expressions.'
      : 'The characters respond warmly and take the next small step.';
  const setting = 'A child-friendly story setting matching the selected theme.';

  return {
    panelId: `p${pageNumber}-${panelIndex}`,
    beatType: panelIndex === 1 ? 'setup' : 'response',
    dialogue:
      panelIndex === 1
        ? [{ speaker: 'Hero', text: 'Look!' }]
        : [{ speaker: 'Hero', text: 'I can try.' }],
    thoughts: [],
    visual: {
      environmentId: FALLBACK_ENVIRONMENT_ID,
      primaryRead: visualAction,
      sceneVisual: {
        setting,
        lighting: 'soft clear child-friendly lighting',
        cameraComposition: {
          shot: 'medium shot, eye level',
          characters: [],
        },
      },
    },
  };
}

function normalizeScript(
  script: GraphicNovelScript,
  spec: StorySpec,
  pageCount: number
): GraphicNovelScript {
  const environments = normalizeEnvironments(script, spec);
  const outfits = normalizeOutfits(script);
  const sourcePages = Array.isArray(script.pages) ? script.pages : [];
  const pages = Array.from({ length: pageCount }, (_, index) => {
    const pageNumber = index + 1;
    const source = sourcePages.find((page) => page.pageNumber === pageNumber) ?? sourcePages[index];
    const panels = source?.panels?.length
      ? source.panels
      : [fallbackPanel(pageNumber, 1), fallbackPanel(pageNumber, 2)];
    const normalizedPanels =
      panels.length >= 2
        ? panels
        : [panels[0] ?? fallbackPanel(pageNumber, 1), fallbackPanel(pageNumber, 2)];

    return {
      pageNumber,
      pageRole: source?.pageRole ?? roleForPage(pageNumber, pageCount),
      panels: normalizedPanels.map((panel, panelIndex) => {
        const normalizedPanel = {
          panelId: panel.panelId || `p${pageNumber}-${panelIndex + 1}`,
          dialogue: Array.isArray(panel.dialogue) ? panel.dialogue : [],
          thoughts: Array.isArray(panel.thoughts) ? panel.thoughts : [],
          caption: panel.caption,
          visual: normalizePanelVisual(panel, panelIndex + 1, environments, spec, outfits),
          beatType: panel.beatType,
          visualAction: panel.visualAction,
          setting: panel.setting,
          charactersPresent: Array.isArray(panel.charactersPresent)
            ? panel.charactersPresent
            : undefined,
          emotion: panel.emotion,
          artPrompt: panel.artPrompt,
        };
        return normalizedPanel;
      }),
    };
  });

  return {
    title: script.title || 'Graphic Novel',
    description: script.description || 'A short child-friendly graphic novel.',
    language: script.language || spec.language,
    environments,
    outfits: [...outfits.values()],
    pages,
  };
}

function graphicNovelPageToValidationScene(
  script: GraphicNovelScript,
  page: GraphicNovelScript['pages'][number],
  fallbackSceneId: number
): EpisodeText['scenes'][number] {
  const sceneId = Number.isFinite(page.pageNumber) ? page.pageNumber : fallbackSceneId;
  const panels = (Array.isArray(page.panels) ? page.panels : []).map((panel, index) => {
    const cameraComposition = panel.visual?.sceneVisual?.cameraComposition;
    return {
      panelId: panel.panelId || `p${sceneId}-${index + 1}`,
      caption: panel.caption ?? null,
      dialogue: (panel.dialogue || []).map((line) => ({
        speaker: line.speaker,
        text: line.text,
      })),
      thoughts: (panel.thoughts || []).map((line) => ({
        speaker: line.speaker,
        text: line.text,
      })),
      visual: {
        primaryRead: panel.visual?.primaryRead ?? null,
        environmentId: panel.visual?.environmentId ?? null,
        setting: panel.visual?.sceneVisual?.setting ?? null,
        lighting: panel.visual?.sceneVisual?.lighting ?? null,
        camera:
          cameraComposition && typeof cameraComposition !== 'string'
            ? cameraComposition
            : cameraComposition || null,
      },
    };
  });

  return {
    sceneId,
    text: `GRAPHIC_NOVEL_PAGE_SCRIPT_JSON:\n${JSON.stringify(
      {
        storyTitle: script.title,
        storyDescription: script.description,
        pageNumber: sceneId,
        pageRole: page.pageRole,
        panels,
      },
      null,
      2
    )}`,
    primaryRead: panels.map((panel) => panel.visual.primaryRead).filter(Boolean).join(' | '),
    sceneVisual: {
      setting: panels.map((panel) => panel.visual.setting).filter(Boolean).join(' | '),
      lighting: panels.map((panel) => panel.visual.lighting).filter(Boolean).join(' | '),
      cameraComposition: {
        shot: `graphic novel page ${sceneId}`,
        characters: panels.flatMap((panel) => {
          const camera = panel.visual.camera;
          if (!camera || typeof camera === 'string' || !Array.isArray(camera.characters)) {
            return [];
          }
          return camera.characters;
        }),
      },
    },
  };
}

export class GraphicNovelDomainService {
  constructor(
    private textProvider: ITextProvider,
    private validationTextProvider: ITextProvider = textProvider
  ) {}

  private async validateScriptText(params: {
    script: GraphicNovelScript;
    spec: StorySpec;
    onUsage?: (usage: UsageMetadata) => void;
  }): Promise<void> {
    const pages = Array.isArray(params.script.pages) ? params.script.pages : [];
    const failures: GraphicNovelScriptTextValidationError['failures'] = [];

    for (const [index, page] of pages.entries()) {
      const sceneText = graphicNovelPageToValidationScene(params.script, page, index + 1);
      const prompt = buildValidationPrompt({
        sceneText,
        policy: params.spec.policyProfile,
        isLastScene: index === pages.length - 1,
        scenarioCardId: params.spec.scenarioCard?.id,
        reservedCharacters: params.spec.characters,
      });

      logger.debug(
        {
          pageNumber: sceneText.sceneId,
          promptLength: prompt.length,
          promptPreview: prompt.slice(0, 500),
        },
        'Graphic novel page text validation prompt'
      );

      const validation = await this.validationTextProvider.generateStructured<SceneValidationResult>({
        prompt,
        schema: VALIDATION_SCHEMA,
        temperature: 0.1,
        model: config.ai.validationModel,
        onUsage: params.onUsage,
        operation: 'validateScene',
      });

      const violations = Array.isArray(validation.violations) ? validation.violations : [];
      logger.info(
        {
          pageNumber: sceneText.sceneId,
          isValid: validation.isValid,
          violationCount: violations.length,
          violations: violations.slice(0, 5).map((violation) => ({
            category: violation.category,
            severity: violation.severity,
            message: violation.message,
          })),
        },
        'Graphic novel page text validation complete'
      );

      if (!validation.isValid || violations.length > 0) {
        failures.push({
          pageNumber: sceneText.sceneId,
          violations,
        });
      }
    }

    if (failures.length > 0) {
      throw new GraphicNovelScriptTextValidationError(failures);
    }
  }

  async generateScript(params: {
    spec: StorySpec;
    pageCount: number;
    isContinuation?: boolean;
    continuationContext?: ContinuationPromptContext;
    onUsage?: (usage: UsageMetadata) => void;
  }): Promise<GraphicNovelScript> {
    const attempts = [
      {
        label: 'primary',
        prompt: buildGraphicNovelPrompt(params),
        temperature: 0.85,
        model: undefined,
        operation: 'graphic_novel_script',
      },
      {
        label: 'safety_fallback',
        prompt: buildGraphicNovelSafetyFallbackPrompt(params),
        temperature: 0.65,
        model: config.ai.textVendor === 'gemini' ? config.ai.ttsProsodyTagsModel : undefined,
        operation: 'graphic_novel_script_safety_fallback',
      },
    ];

    let raw: GraphicNovelScript | null = null;
    let usedAttempt = attempts[0].label;

    for (const [index, attempt] of attempts.entries()) {
      try {
        raw = await this.textProvider.generateStructured<GraphicNovelScript>({
          prompt: attempt.prompt,
          schema: GRAPHIC_NOVEL_SCRIPT_SCHEMA,
          maxTokens: GRAPHIC_NOVEL_MAX_OUTPUT_TOKENS,
          temperature: attempt.temperature,
          model: attempt.model,
          onUsage: params.onUsage,
          operation: attempt.operation,
        });
        await this.validateScriptText({
          script: raw,
          spec: params.spec,
          onUsage: params.onUsage,
        });
        usedAttempt = attempt.label;
        break;
      } catch (error) {
        if (index === 0 && isProviderContentBlockedError(error)) {
          logger.warn(
            {
              err: error,
              pageCount: params.pageCount,
              ageGroup: params.spec.ageGroup,
              fallbackModel: attempts[1].model ?? null,
            },
            'Graphic novel script generation was blocked; retrying with safety fallback prompt'
          );
          continue;
        }
        if (index === 0 && isGraphicNovelScriptRetryableError(error)) {
          logger.warn(
            {
              err: error,
              pageCount: params.pageCount,
              ageGroup: params.spec.ageGroup,
              fallbackModel: attempts[1].model ?? null,
            },
            'Graphic novel script failed text validation; retrying with safety fallback prompt'
          );
          continue;
        }
        throw error;
      }
    }

    if (!raw) {
      throw new Error('Graphic novel script generation failed: empty provider response');
    }

    const normalized = normalizeScript(raw, params.spec, params.pageCount);
    logger.info(
      {
        title: normalized.title,
        pageCount: normalized.pages.length,
        panelCounts: normalized.pages.map((page) => page.panels.length),
        promptAttempt: usedAttempt,
      },
      'Graphic novel script generated'
    );
    return normalized;
  }

  planLayouts(params: {
    spec: StorySpec;
    script: GraphicNovelScript;
    bubbleTextSizing?: GraphicNovelBubbleTextSizing;
  }) {
    return planGraphicNovelLayouts({
      ageGroup: params.spec.ageGroup,
      pages: params.script.pages,
      outfits: params.script.outfits,
      bubbleTextSizing: params.bubbleTextSizing,
    });
  }
}
