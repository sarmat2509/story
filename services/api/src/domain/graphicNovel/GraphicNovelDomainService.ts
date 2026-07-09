import type { EpisodeText, SceneValidationResult, StoryEnvironment, StoryOutfitRow, StorySpec } from '../../ai/types';
import type { ITextProvider } from '../../providers/base/ITextProvider';
import type { UsageMetadata } from '../../providers/base/UsageMetadata';
import type { CameraCharacterComposition } from '../../services/types';
import {
  buildValidationPrompt,
  buildGraphicNovelPrompt,
  buildGraphicNovelPageRepairPrompt,
  buildGraphicNovelSafetyFallbackPrompt,
  GRAPHIC_NOVEL_MAX_PANEL_CHARACTERS,
  GRAPHIC_NOVEL_PAGE_REPAIR_SCHEMA,
  GRAPHIC_NOVEL_SCRIPT_SCHEMA,
  type VisualCharacterReferenceLabel,
} from '../../prompts/text';
import type { ContinuationPromptContext } from '../../prompts/helpers';
import { stripCharacterIdFromName } from '@wondertales/shared';
import type {
  GraphicNovelBubbleTextSizing,
  GraphicNovelPageScript,
  GraphicNovelPageRole,
  GraphicNovelPanelVisual,
  GraphicNovelPanelScript,
  GraphicNovelScript,
} from './types';
import { planGraphicNovelLayouts } from './layoutPlanner';
import { logger } from '../../utils/logger';
import config, { getValidationTextModelOverride } from '../../config';
import { VALIDATION_SCHEMA } from '../story/schemas';

const GRAPHIC_NOVEL_MAX_OUTPUT_TOKENS = 48000;
const GRAPHIC_NOVEL_PAGE_REPAIR_MAX_ATTEMPTS = 2;
const FALLBACK_ENVIRONMENT_ID = 'env_main';
type OutfitKind = 'natural' | 'everyday' | 'swimwear';

function isProviderContentBlockedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /PROHIBITED_CONTENT|Content blocked|content filter|blocked by/i.test(message);
}

class GraphicNovelScriptTextValidationError extends Error {
  constructor(
    public readonly failures: GraphicNovelScriptTextValidationFailure[]
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

type GraphicNovelScriptTextValidationFailure = {
  pageNumber: number;
  violations: SceneValidationResult['violations'];
};

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

function normalizeCastName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return stripCharacterIdFromName(value).trim().normalize('NFC').toLocaleLowerCase();
}

function displayCastName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return stripCharacterIdFromName(value).trim();
}

function addCastName(names: Map<string, string>, value: unknown): void {
  const key = normalizeCastName(value);
  const display = displayCastName(value);
  if (!key || !display || names.has(key)) return;
  names.set(key, display);
}

function pageCastForValidation(page: GraphicNovelScript['pages'][number]): {
  all: Map<string, string>;
  visual: Map<string, string>;
} {
  const all = new Map<string, string>();
  const visual = new Map<string, string>();

  for (const panel of Array.isArray(page.panels) ? page.panels : []) {
    const cast = panelCastForValidation(panel);
    for (const [key, name] of cast.all.entries()) all.set(key, name);
    for (const [key, name] of cast.visual.entries()) visual.set(key, name);
  }

  return { all, visual };
}

function panelCastForValidation(panel: GraphicNovelPanelScript): {
  all: Map<string, string>;
  visual: Map<string, string>;
} {
  const all = new Map<string, string>();
  const visual = new Map<string, string>();

  for (const line of [...(panel.dialogue || []), ...(panel.thoughts || [])]) {
    addCastName(all, line?.speaker);
  }

  const composition = panel.visual?.sceneVisual?.cameraComposition;
  if (!composition || typeof composition === 'string' || !Array.isArray(composition.characters)) {
    return { all, visual };
  }

  for (const character of composition.characters) {
    addCastName(all, character?.name);
    addCastName(visual, character?.name);
  }

  return { all, visual };
}

function selectedCharacterNamesForValidation(spec: StorySpec): Map<string, string> {
  const selected = new Map<string, string>();
  for (const character of spec.characters || []) {
    addCastName(selected, character.name);
  }
  return selected;
}

function childAnchorNamesForValidation(spec: StorySpec): Map<string, string> {
  const anchors = new Map<string, string>();
  for (const character of spec.characters || []) {
    if (String(character.type || '').toLowerCase() === 'child') {
      addCastName(anchors, character.name);
    }
  }
  return anchors;
}

function validateGraphicNovelPageCast(script: GraphicNovelScript, spec: StorySpec): void {
  const pages = Array.isArray(script.pages) ? script.pages : [];
  const childAnchors = childAnchorNamesForValidation(spec);
  const selectedCharacters = selectedCharacterNamesForValidation(spec);
  const visibleSelectedCharacters = new Set<string>();
  const failures: GraphicNovelScriptTextValidationError['failures'] = [];

  for (const [index, page] of pages.entries()) {
    const pageNumber = Number.isFinite(page.pageNumber) ? page.pageNumber : index + 1;
    const cast = pageCastForValidation(page);
    const violations: SceneValidationResult['violations'] = [];

    for (const [panelIndex, panel] of (Array.isArray(page.panels) ? page.panels : []).entries()) {
      const panelCast = panelCastForValidation(panel);
      if (panelCast.all.size > GRAPHIC_NOVEL_MAX_PANEL_CHARACTERS) {
        violations.push({
          category: 'graphic_novel_panel_cast_limit',
          severity: 'high',
          message: `Page ${pageNumber}, panel ${panelIndex + 1} uses ${panelCast.all.size} unique named characters; the maximum per panel is ${GRAPHIC_NOVEL_MAX_PANEL_CHARACTERS}.`,
          suggestion:
            'Keep at most three visible/speaking characters in a panel and rotate additional heroes into other panels on the same page.',
        });
      }
    }

    for (const [key, name] of childAnchors.entries()) {
      if (!cast.visual.has(key)) {
        violations.push({
          category: 'graphic_novel_child_anchor_missing',
          severity: 'high',
          message: `Child character "${name}" must be visibly present on every graphic novel page.`,
          suggestion:
            'Add the child character to at least one panel cameraComposition.characters row on this page.',
        });
      }
    }

    for (const key of cast.visual.keys()) {
      if (selectedCharacters.has(key)) {
        visibleSelectedCharacters.add(key);
      }
    }

    if (violations.length > 0) {
      failures.push({ pageNumber, violations });
    }
  }

  const missingSelected = [...selectedCharacters.entries()].filter(
    ([key]) => !visibleSelectedCharacters.has(key)
  );
  if (missingSelected.length > 0) {
    failures.push({
      pageNumber: pages.length || 1,
      violations: missingSelected.map(([, name]) => ({
        category: 'graphic_novel_cast_coverage_missing',
        severity: 'high',
        message: `Selected character "${name}" never appears visibly in the comic script.`,
        suggestion:
          'Use cast coverage and page focus rotation so every selected hero appears in at least one panel cameraComposition.characters row.',
      })),
    });
  }

  if (failures.length > 0) {
    throw new GraphicNovelScriptTextValidationError(failures);
  }
}

function withRequiredPanelCharacters(
  panel: GraphicNovelPanelScript,
  characters: CameraCharacterComposition[]
): CameraCharacterComposition[] {
  const byName = new Map<string, { character: CameraCharacterComposition; order: number }>();
  const speakers = panelSpeakers(panel);
  const speakerKeys = new Set(speakers.map(normalizeCastName).filter(Boolean));

  for (const [order, character] of characters.entries()) {
    const name = String(character.name || '').trim();
    const key = normalizeCastName(name);
    if (!name || !key || byName.has(key)) continue;
    byName.set(key, { character, order });
  }

  for (const [speakerIndex, speaker] of speakers.entries()) {
    const key = normalizeCastName(speaker);
    if (!key || byName.has(key)) continue;
    const index = byName.size;
    byName.set(key, {
      order: characters.length + speakerIndex,
      character: {
        name: speaker,
        position: index % 2 === 0 ? 'left_foreground' : 'right_foreground',
        description:
          index % 2 === 0
            ? 'visible in the panel, readable expression, looking toward the other speaker or panel action'
            : 'visible in the panel, responding to the other speaker, readable expression and clear gaze',
      },
    });
  }

  return [...byName.values()]
    .sort((a, b) => {
      const aIsSpeaker = speakerKeys.has(normalizeCastName(a.character.name)) ? 0 : 1;
      const bIsSpeaker = speakerKeys.has(normalizeCastName(b.character.name)) ? 0 : 1;
      return aIsSpeaker - bIsSpeaker || a.order - b.order;
    })
    .slice(0, GRAPHIC_NOVEL_MAX_PANEL_CHARACTERS)
    .map((entry) => entry.character);
}

function withOutfitIds(
  outfits: Map<string, StoryOutfitRow>,
  characters: CameraCharacterComposition[]
): CameraCharacterComposition[] {
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

function fallbackPanel(pageNumber: number, panelIndex: number, spec: StorySpec): GraphicNovelPanelScript {
  const heroName =
    (spec.characters || []).find(
      (character) => String(character.type || '').toLowerCase() === 'child'
    )?.name ||
    spec.characters?.[0]?.name ||
    'Hero';
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
        ? [{ speaker: heroName, text: 'Look!' }]
        : [{ speaker: heroName, text: 'I can try.' }],
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
      : [fallbackPanel(pageNumber, 1, spec), fallbackPanel(pageNumber, 2, spec)];
    const normalizedPanels =
      panels.length >= 2
        ? panels
        : [panels[0] ?? fallbackPanel(pageNumber, 1, spec), fallbackPanel(pageNumber, 2, spec)];

    return {
      pageNumber,
      pageRole: source?.pageRole ?? roleForPage(pageNumber, pageCount),
      panels: normalizedPanels.map((panel, panelIndex) => {
        const normalizedPanel = {
          panelId: panel.panelId || `p${pageNumber}-${panelIndex + 1}`,
          dialogue: Array.isArray(panel.dialogue) ? panel.dialogue : [],
          thoughts: Array.isArray(panel.thoughts) ? panel.thoughts : [],
          caption: panel.caption,
          visual: normalizePanelVisual(panel, panelIndex + 1, environments, outfits),
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
    characters: Array.isArray(script.characters) ? script.characters : [],
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

  private getValidationModelOverride(): string | undefined {
    return getValidationTextModelOverride();
  }

  private async collectScriptTextValidationFailures(params: {
    script: GraphicNovelScript;
    spec: StorySpec;
    onUsage?: (usage: UsageMetadata) => void;
    pageNumbers?: number[];
  }): Promise<GraphicNovelScriptTextValidationFailure[]> {
    const pages = Array.isArray(params.script.pages) ? params.script.pages : [];
    const pageFilter = params.pageNumbers?.length ? new Set(params.pageNumbers) : null;
    const failures: GraphicNovelScriptTextValidationFailure[] = [];

    for (const [index, page] of pages.entries()) {
      const sceneText = graphicNovelPageToValidationScene(params.script, page, index + 1);
      if (pageFilter && !pageFilter.has(sceneText.sceneId)) {
        continue;
      }
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
        model: this.getValidationModelOverride(),
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

    return failures;
  }

  private async validateScriptText(params: {
    script: GraphicNovelScript;
    spec: StorySpec;
    onUsage?: (usage: UsageMetadata) => void;
  }): Promise<void> {
    const failures = await this.collectScriptTextValidationFailures(params);
    if (failures.length > 0) {
      throw new GraphicNovelScriptTextValidationError(failures);
    }
  }

  private async regeneratePageWithValidationFeedback(params: {
    script: GraphicNovelScript;
    page: GraphicNovelPageScript;
    failure: GraphicNovelScriptTextValidationFailure;
    spec: StorySpec;
    pageCount: number;
    visualReferenceLabels?: VisualCharacterReferenceLabel[];
    visualArtifactReferenceLabel?: string;
    onUsage?: (usage: UsageMetadata) => void;
  }): Promise<GraphicNovelPageScript> {
    const prompt = buildGraphicNovelPageRepairPrompt({
      spec: params.spec,
      script: params.script,
      page: params.page,
      pageCount: params.pageCount,
      visualReferenceLabels: params.visualReferenceLabels,
      visualArtifactReferenceLabel: params.visualArtifactReferenceLabel,
      feedback: params.failure.violations.map((violation) => ({
        category: violation.category,
        severity: violation.severity,
        message: violation.message,
        suggestion: violation.suggestion,
      })),
    });

    logger.info(
      {
        pageNumber: params.failure.pageNumber,
        violationCount: params.failure.violations.length,
        promptLength: prompt.length,
      },
      'Regenerating graphic novel page with validation feedback'
    );

    const result = await this.textProvider.generateStructured<{ page: GraphicNovelPageScript }>({
      prompt,
      schema: GRAPHIC_NOVEL_PAGE_REPAIR_SCHEMA,
      maxTokens: 14000,
      temperature: 0.65,
      onUsage: params.onUsage,
      operation: 'graphic_novel_page_repair',
    });

    if (!result?.page || !Array.isArray(result.page.panels) || result.page.panels.length === 0) {
      throw new Error(`Graphic novel page repair returned no usable page for page ${params.failure.pageNumber}`);
    }

    return {
      ...result.page,
      pageNumber: params.page.pageNumber,
      pageRole: params.page.pageRole,
    };
  }

  private async repairScriptPagesWithValidationFeedback(params: {
    script: GraphicNovelScript;
    spec: StorySpec;
    pageCount: number;
    visualReferenceLabels?: VisualCharacterReferenceLabel[];
    visualArtifactReferenceLabel?: string;
    onUsage?: (usage: UsageMetadata) => void;
  }): Promise<GraphicNovelScript> {
    let script = params.script;
    let failures = await this.collectScriptTextValidationFailures({
      script,
      spec: params.spec,
      onUsage: params.onUsage,
    });

    if (failures.length === 0) {
      return script;
    }

    for (
      let attempt = 1;
      attempt <= GRAPHIC_NOVEL_PAGE_REPAIR_MAX_ATTEMPTS && failures.length > 0;
      attempt += 1
    ) {
      logger.warn(
        {
          attempt,
          failedPageNumbers: failures.map((failure) => failure.pageNumber),
          failureSummaries: failures.map((failure) => ({
            pageNumber: failure.pageNumber,
            categories: failure.violations.map((violation) => violation.category),
            messages: failure.violations.map((violation) => violation.message).slice(0, 3),
          })),
        },
        'Graphic novel pages failed text validation; repairing failed pages only'
      );

      const repairedPageNumbers: number[] = [];
      let nextPages = [...(script.pages || [])];

      for (const failure of failures) {
        const pageIndex = nextPages.findIndex((page, index) => {
          const pageNumber = Number.isFinite(page.pageNumber) ? page.pageNumber : index + 1;
          return pageNumber === failure.pageNumber;
        });
        if (pageIndex < 0) {
          continue;
        }

        const repairedPage = await this.regeneratePageWithValidationFeedback({
          script,
          page: nextPages[pageIndex],
          failure,
          spec: params.spec,
          pageCount: params.pageCount,
          visualReferenceLabels: params.visualReferenceLabels,
          visualArtifactReferenceLabel: params.visualArtifactReferenceLabel,
          onUsage: params.onUsage,
        });

        nextPages = nextPages.map((page, index) => (index === pageIndex ? repairedPage : page));
        repairedPageNumbers.push(failure.pageNumber);
      }

      script = { ...script, pages: nextPages };
      validateGraphicNovelPageCast(script, params.spec);

      failures = repairedPageNumbers.length
        ? await this.collectScriptTextValidationFailures({
            script,
            spec: params.spec,
            pageNumbers: repairedPageNumbers,
            onUsage: params.onUsage,
          })
        : failures;
    }

    if (failures.length > 0) {
      throw new GraphicNovelScriptTextValidationError(failures);
    }

    logger.info('Graphic novel script text validation passed after page repair');
    return script;
  }

  async generateScript(params: {
    spec: StorySpec;
    pageCount: number;
    isContinuation?: boolean;
    continuationContext?: ContinuationPromptContext;
    visualReferenceLabels?: VisualCharacterReferenceLabel[];
    visualArtifactReferenceLabel?: string;
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
        validateGraphicNovelPageCast(raw, params.spec);
        raw = await this.repairScriptPagesWithValidationFeedback({
          script: raw,
          spec: params.spec,
          pageCount: params.pageCount,
          visualReferenceLabels: params.visualReferenceLabels,
          visualArtifactReferenceLabel: params.visualArtifactReferenceLabel,
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
