/**
 * Re-plan only the visuals of an existing graphic-novel storyboard.
 *
 * The saved pages, dialogue, thoughts, captions, panel order, and character roster are read
 * from graphic_novel_projects.script_json and are never written back. The Director receives one
 * immutable narrative block per stored panel and returns only environments/outfits/panel visuals.
 *
 * Usage:
 *   node dist/scripts/rerunGraphicNovelVisualPlanForStory.js <storyId> --json /tmp/visual-plan.json
 */

import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { graphicNovelProjects, stories, storyRequests } from '../db/schema';
import { getCharacterRepository, getChildProfileRepository } from '../repositories';
import { buildPolicyProfile } from '../services/policyService';
import { getStoryDomainService } from '../services/aiService';
import type { StorySpec } from '../ai/types';
import { buildDirectorPrompt } from '../prompts/text/DirectorPrompt';

type GraphicPanel = {
  panelId?: string;
  dialogue?: Array<{ speaker?: string; text?: string }>;
  thoughts?: Array<{ speaker?: string; text?: string }>;
  caption?: string;
  visual?: { primaryRead?: string };
};

type GraphicPage = { pageNumber?: number; panels?: GraphicPanel[] };

function parseArgs(argv: string[]): { storyId: string; jsonOut?: string; promptOnly: boolean } {
  const positional: string[] = [];
  let jsonOut: string | undefined;
  let promptOnly = false;
  for (let index = 2; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--json' && argv[index + 1]) jsonOut = argv[++index];
    else if (argument === '--prompt-only') promptOnly = true;
    else if (!argument.startsWith('-')) positional.push(argument);
  }
  if (!positional[0]) {
    throw new Error(
      'Usage: node dist/scripts/rerunGraphicNovelVisualPlanForStory.js <storyId> [--json out.json] [--prompt-only]'
    );
  }
  return { storyId: positional[0], jsonOut, promptOnly };
}

function panelNarrative(panel: GraphicPanel, panelNumber: number): string {
  const lines = [`Comic panel ${panelNumber}.`];
  if (panel.caption?.trim()) lines.push(`Caption: ${panel.caption.trim()}`);
  for (const line of panel.dialogue ?? []) {
    if (line.text?.trim()) lines.push(`${line.speaker || 'Character'}: ${line.text.trim()}`);
  }
  for (const line of panel.thoughts ?? []) {
    if (line.text?.trim()) lines.push(`${line.speaker || 'Character'} thinks: ${line.text.trim()}`);
  }
  // This is narrative intent, not a prior camera/environment instruction. It preserves the
  // storyboard beat while allowing the Director to correct the physical viewpoint.
  if (panel.visual?.primaryRead?.trim()) lines.push(`Required story beat: ${panel.visual.primaryRead.trim()}`);
  return lines.join('\n');
}

function writeJson(outPath: string | undefined, value: unknown): void {
  if (!outPath) return;
  const resolved = path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath);
  fs.writeFileSync(resolved, JSON.stringify(value, null, 2), 'utf-8');
  console.error(`[rerunGraphicNovelVisualPlanForStory] wrote ${resolved}`);
}

async function run(): Promise<void> {
  const { storyId, jsonOut, promptOnly } = parseArgs(process.argv);
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId));
  if (!story) throw new Error(`Story not found: ${storyId}`);

  const [project] = await db
    .select()
    .from(graphicNovelProjects)
    .where(eq(graphicNovelProjects.storyId, storyId));
  if (!project) throw new Error(`Graphic novel project not found for story: ${storyId}`);

  const script = project.scriptJson as { pages?: GraphicPage[]; characters?: unknown[] };
  const pages = Array.isArray(script.pages) ? script.pages : [];
  const panelEntries = pages.flatMap((page, pageIndex) =>
    (page.panels ?? []).map((panel, panelIndex) => ({
      pageNumber: page.pageNumber ?? pageIndex + 1,
      panelIndex,
      panel,
    }))
  );
  if (panelEntries.length === 0) throw new Error(`Graphic novel project ${project.id} has no panels`);

  const [request] = story.storyRequestId
    ? await db.select().from(storyRequests).where(eq(storyRequests.id, story.storyRequestId))
    : [undefined];
  const characterIds = (request?.selectedCharacters as string[] | null)?.filter(Boolean) ?? [];
  const childIds = (request?.selectedChildren as string[] | null)?.filter(Boolean) ?? [];
  const userCharacters: Array<{ id: string; name: string }> = [];
  if (characterIds.length > 0) {
    const characters = await getCharacterRepository().findByIds(story.userId, characterIds);
    userCharacters.push(...characters.filter((character) => character.name).map((character) => ({ id: character.id, name: character.name })));
  }
  if (childIds.length > 0) {
    const children = await getChildProfileRepository().findByIds(story.userId, childIds);
    userCharacters.push(...children.filter((child) => child.name).map((child) => ({ id: child.id, name: child.name })));
  }

  const policyProfile = await buildPolicyProfile(story.ageGroup, story.language);
  const metadata = (story.metadata as Record<string, unknown>) || {};
  const spec: StorySpec = {
    language: story.language,
    ageGroup: story.ageGroup,
    characters: [],
    policyProfile,
    imageStyle: (metadata.imageStyle as string | undefined) || request?.imageStyle || 'soft_watercolor',
    ...(request?.scenarioCardId ? { scenarioCard: { id: request.scenarioCardId, name: '', description: '' } } : {}),
  };
  const blocks = panelEntries.map((entry, index) => ({
    blockIndex: index,
    sceneStart: index + 1,
    sceneEnd: index + 1,
    blockText: panelNarrative(entry.panel, index + 1),
  }));
  const params = { blocks, imagesPerStory: panelEntries.length, spec, userCharacters };

  if (promptOnly) {
    console.log(buildDirectorPrompt(params));
    return;
  }

  const result = await getStoryDomainService().callDirector(params);
  if (result.illustrations?.length !== panelEntries.length) {
    throw new Error(
      `Director returned ${result.illustrations?.length ?? 0} visuals for ${panelEntries.length} stored panels`
    );
  }

  const replan = {
    sourceStoryId: storyId,
    sourceProjectId: project.id,
    mode: 'visual_only_comic_replan',
    characters: script.characters ?? [],
    outfits: result.outfits ?? [],
    environments: result.environments ?? [],
    pages: pages.map((page) => ({ ...page, panels: [...(page.panels ?? [])] })),
  } as { pages: GraphicPage[]; [key: string]: unknown };
  for (const [index, entry] of panelEntries.entries()) {
    const page = replan.pages.find((candidate) => candidate.pageNumber === entry.pageNumber);
    if (!page?.panels?.[entry.panelIndex]) throw new Error(`Could not map visual plan back to panel ${index + 1}`);
    page.panels[entry.panelIndex] = {
      ...page.panels[entry.panelIndex],
      visual: result.illustrations[index],
    };
  }

  writeJson(jsonOut, replan);
  console.log(
    JSON.stringify(
      {
        sourceStoryId: storyId,
        sourceProjectId: project.id,
        panelCount: panelEntries.length,
        environmentCount: result.environments?.length ?? 0,
        outfitCount: result.outfits?.length ?? 0,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
