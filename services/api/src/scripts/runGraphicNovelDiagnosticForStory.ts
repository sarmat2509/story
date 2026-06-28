/**
 * Generate a graphic-novel diagnostic from an existing story's wizard request.
 *
 * Usage:
 *   NANO_BANANA_IMAGE_SIZE=2K pnpm --filter wondertales-api exec tsx \
 *     src/scripts/runGraphicNovelDiagnosticForStory.ts --story-id=<uuid> --stop-after-first-page
 *
 * Text/script only:
 *   pnpm --filter wondertales-api exec tsx \
 *     src/scripts/runGraphicNovelDiagnosticForStory.ts --story-id=<uuid> --text-only
 */

import './loadEnvForScripts';

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import type { CreateStoryRequestInput } from '@wondertales/shared';

process.env.NANO_BANANA_IMAGE_SIZE ||= '2K';

const DEFAULT_STORY_ID = '13606f1c-539d-4404-8ccf-8cbd125ec392';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : undefined;
}

function publicInputFromRequest(request: any): CreateStoryRequestInput {
  return {
    childProfileId: request.childProfileId ?? undefined,
    uiLocale: request.uiLocale,
    storyLanguage: request.storyLanguage,
    goal: request.goal ?? undefined,
    scenarioCardId: request.scenarioCardId ?? undefined,
    imageStyle: request.imageStyle ?? undefined,
    userNotes: request.userNotes ?? undefined,
    selectedCharacters: asStringArray(request.selectedCharacters),
    selectedChildren: asStringArray(request.selectedChildren),
  };
}

function compactPanelText(panel: any): string[] {
  return [
    ...(Array.isArray(panel.dialogue)
      ? panel.dialogue.map((line: any) => `${line.speaker}: ${line.text}`)
      : []),
    ...(Array.isArray(panel.thoughts)
      ? panel.thoughts.map((line: any) => `${line.speaker} thinks: ${line.text}`)
      : []),
    panel.caption ? `Caption: ${panel.caption}` : null,
  ].filter(Boolean);
}

function summarizeScript(script: any) {
  return {
    title: script.title,
    language: script.language,
    environmentCount: script.environments?.length ?? 0,
    environments: (script.environments || []).map((environment: any) => ({
      id: environment.id,
      name: environment.name,
      descriptionPreview: String(environment.description || '').slice(0, 220),
    })),
    pageCount: script.pages?.length ?? 0,
    panelCounts: (script.pages || []).map((page: any) => page.panels?.length ?? 0),
    firstPage: script.pages?.[0]
      ? {
          pageRole: script.pages[0].pageRole,
          panels: script.pages[0].panels.map((panel: any) => ({
            panelId: panel.panelId,
            text: compactPanelText(panel),
            visual: {
              environmentId: panel.visual?.environmentId,
              primaryRead: panel.visual?.primaryRead,
              setting: panel.visual?.sceneVisual?.setting,
              shot: panel.visual?.sceneVisual?.cameraComposition?.shot,
              characters: panel.visual?.sceneVisual?.cameraComposition?.characters,
              lighting: panel.visual?.sceneVisual?.lighting,
            },
          })),
        }
      : null,
  };
}

async function main(): Promise<void> {
  const storyId = argValue('story-id') || DEFAULT_STORY_ID;
  const stopAfterFirstPage = hasFlag('stop-after-first-page') || !hasFlag('all-pages');
  const textOnly = hasFlag('text-only');
  const outputRoot = path.resolve(process.cwd(), 'output', `graphic-novel-diagnostic-${storyId}-${Date.now()}`);
  await fs.mkdir(outputRoot, { recursive: true });
  process.env.GRAPHIC_NOVEL_DEBUG_OUTPUT_DIR = outputRoot;

  const [
    { db, closeDatabaseConnection },
    schema,
    repositories,
    graphicNovelService,
  ] = await Promise.all([
    import('../db'),
    import('../db/schema'),
    import('../repositories'),
    import('../services/graphicNovelOrchestrationService'),
  ]);

  const sourceStory = await repositories.getStoryRepository().findById(storyId);
  if (!sourceStory) {
    throw new Error(`Source story not found: ${storyId}`);
  }

  let sourceRequest = sourceStory.storyRequestId
    ? await repositories.getStoryRepository().findRequestById(sourceStory.storyRequestId)
    : null;
  if (!sourceRequest) {
    const [requestByStoryId] = await db
      .select()
      .from(schema.storyRequests)
      .where(eq(schema.storyRequests.storyId, storyId))
      .limit(1);
    sourceRequest = requestByStoryId ?? null;
  }
  if (!sourceRequest) {
    throw new Error(`Source story has no recoverable story request: ${storyId}`);
  }

  const input = publicInputFromRequest(sourceRequest);
  if (textOnly) {
    const [
      { buildStorySpec },
      { getGraphicNovelDomainService },
      { getPlanFeatures },
    ] = await Promise.all([
      import('../services/storyOrchestrationService'),
      import('../services/aiService'),
      import('../services/planService'),
    ]);

    const userPlan = await getPlanFeatures(sourceStory.userId);
    const pageCount = Math.max(1, Math.min(24, userPlan.graphicNovelPagesPerStory || 8));
    const { spec } = await buildStorySpec({
      ...sourceRequest,
      selectedCharacters: Array.isArray(sourceRequest.selectedCharacters) ? sourceRequest.selectedCharacters : [],
      selectedChildren: Array.isArray(sourceRequest.selectedChildren) ? sourceRequest.selectedChildren : [],
    } as any);
    const graphicNovelDomain = getGraphicNovelDomainService();
    const script = await graphicNovelDomain.generateScript({ spec, pageCount });
    const plannedPages = graphicNovelDomain.planLayouts({ spec, script });
    const layoutSummary = plannedPages.map((page: any) => ({
      pageNumber: page.pageNumber,
      pageRole: page.pageRole,
      templateId: page.template?.id ?? null,
      panelCount: page.panels?.length ?? 0,
      bubbleCount: (page.panels || []).reduce((sum: number, panel: any) => sum + (panel.bubbles?.length ?? 0), 0),
      overflowCount: (page.panels || []).reduce(
        (sum: number, panel: any) => sum + (panel.bubbles || []).filter((bubble: any) => bubble.overflow).length,
        0
      ),
    }));
    const report = {
      sourceStoryId: storyId,
      generatedStoryId: null,
      requestId: null,
      requestCreatedVia: 'textOnlyDirectGeneration',
      stopAfterFirstPage,
      textOnly,
      pageCount,
      input,
      firstPageTemplate: layoutSummary[0] ?? null,
      layoutSummary,
      scriptSummary: summarizeScript(script),
      imageReport: null,
    };

    await fs.writeFile(path.join(outputRoot, 'script.json'), JSON.stringify(script, null, 2));
    await fs.writeFile(path.join(outputRoot, 'layout-summary.json'), JSON.stringify(layoutSummary, null, 2));
    await fs.writeFile(path.join(outputRoot, 'text-layout-summary.json'), JSON.stringify(report, null, 2));
    await fs.writeFile(path.join(outputRoot, 'diagnostic-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      outputRoot,
      textOnly,
      pageCount,
      firstPageTemplate: report.firstPageTemplate,
      scriptSummary: report.scriptSummary,
    }, null, 2));
    await closeDatabaseConnection();
    return;
  }

  let requestId: string;
  let requestCreatedVia = 'createGraphicNovelRequest';
  try {
    requestId = await graphicNovelService.createGraphicNovelRequest(sourceStory.userId, input);
  } catch (error) {
    requestCreatedVia = 'directDiagnosticRequest';
    const request = await repositories.getStoryRepository().createRequest({
      userId: sourceStory.userId,
      childProfileId: input.childProfileId ?? null,
      uiLocale: input.uiLocale,
      storyLanguage: input.storyLanguage,
      goal: input.goal ?? null,
      scenarioCardId: input.scenarioCardId ?? null,
      imageStyle: input.imageStyle ?? null,
      userNotes: input.userNotes ?? null,
      selectedCharacters: input.selectedCharacters ?? null,
      selectedChildren: input.selectedChildren ?? null,
      status: 'pending',
      progress: 0,
      intermediateData: {
        generationKind: 'graphic_novel',
        diagnosticSourceStoryId: storyId,
        quotaBypassed: true,
        quotaBypassReason: error instanceof Error ? error.message : String(error),
      },
    } as any);
    requestId = request.id;
  }

  const { storyId: generatedStoryId } = await graphicNovelService.processGraphicNovelRequest(requestId);
  const projectAfterText = await repositories.getGraphicNovelRepository().findProjectByStoryId(generatedStoryId);
  if (!projectAfterText) throw new Error(`Graphic novel project not found after text generation: ${generatedStoryId}`);

  const script = projectAfterText.scriptJson as any;
  const pagesAfterText = await repositories.getGraphicNovelRepository().findPagesByProjectId(projectAfterText.id);
  const firstPageAfterText = pagesAfterText.find((page: any) => page.pageNumber === 1);
  await fs.writeFile(path.join(outputRoot, 'script.json'), JSON.stringify(script, null, 2));
  await fs.writeFile(
    path.join(outputRoot, 'text-layout-summary.json'),
    JSON.stringify({
      sourceStoryId: storyId,
      generatedStoryId,
      requestId,
      requestCreatedVia,
      stopAfterFirstPage,
      textOnly,
      input,
      script: summarizeScript(script),
      firstPageTemplate: firstPageAfterText
        ? {
            pageNumber: firstPageAfterText.pageNumber,
            pageRole: firstPageAfterText.pageRole,
            templateId: firstPageAfterText.templateId,
            panelCount: (firstPageAfterText.layoutJson as any)?.panels?.length ?? null,
          }
        : null,
    }, null, 2)
  );

  await graphicNovelService.processGraphicNovelPages(requestId, { stopAfterFirstPage });

  const project = await repositories.getGraphicNovelRepository().findProjectByStoryId(generatedStoryId);
  const pages = project ? await repositories.getGraphicNovelRepository().findPagesByProjectId(project.id) : [];
  const status = await graphicNovelService.getGraphicNovelGenerationStatus(generatedStoryId, sourceStory.userId);
  const page1 = pages.find((page: any) => page.pageNumber === 1);
  const asset = page1?.imageAssetId
    ? await repositories.getAssetRepository().findById(page1.imageAssetId)
    : null;

  let imageReport: Record<string, unknown> | null = null;
  if (asset) {
    const assetStorage = (await import('../services/assetStorageService')).getAssetStorageService();
    const imageBuffer = await assetStorage.getAssetByPath(asset.storagePath);
    const pageImagePath = path.join(outputRoot, 'page-1.png');
    const artOnlyImagePath = path.join(outputRoot, 'page-1-art-only.png');
    await fs.writeFile(pageImagePath, imageBuffer);
    const metadata = await sharp(imageBuffer).metadata();
    const hasArtOnlyImage = await fs.access(artOnlyImagePath).then(() => true).catch(() => false);
    imageReport = {
      pageImagePath,
      artOnlyImagePath: hasArtOnlyImage ? artOnlyImagePath : null,
      storagePath: asset.storagePath,
      mimeType: asset.mimeType,
      width: metadata.width,
      height: metadata.height,
      is2kPortraitPage: metadata.width === 1536 && metadata.height === 2048,
      assetGenerationParams: asset.generationParams,
      pageGenerationParams: page1?.generationParams,
    };
  }

  const report = {
    sourceStoryId: storyId,
    generatedStoryId,
    requestId,
    requestCreatedVia,
    stopAfterFirstPage,
    nanoBananaImageSize: process.env.NANO_BANANA_IMAGE_SIZE,
    status,
    firstPage: page1
      ? {
          status: page1.status,
          errorMessage: page1.errorMessage,
          templateId: page1.templateId,
          pageRole: page1.pageRole,
          panelCount: (page1.layoutJson as any)?.panels?.length ?? null,
          textOverlayItemCount: (page1.bubbleLayoutJson as any)?.textOverlay?.items?.length ?? null,
        }
      : null,
    scriptSummary: summarizeScript(script),
    imageReport,
  };

  await fs.writeFile(path.join(outputRoot, 'diagnostic-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    outputRoot,
    generatedStoryId,
    requestId,
    requestCreatedVia,
    status,
    firstPage: report.firstPage,
    imageReport,
  }, null, 2));

  await closeDatabaseConnection();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  try {
    const { closeDatabaseConnection } = await import('../db');
    await closeDatabaseConnection();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
