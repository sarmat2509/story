import { stripForAudio } from '../utils/audioTags';

export interface StoryAudioScene {
  sceneId: number;
  text: string;
}

type SceneLike = {
  sceneId?: unknown;
  text?: unknown;
};

function normalizeScene(scene: SceneLike, index: number): StoryAudioScene | null {
  if (typeof scene.text !== 'string') return null;
  const text = stripForAudio(scene.text).trim();
  if (!text) return null;
  const parsedSceneId = Number(scene.sceneId);
  return {
    sceneId: Number.isFinite(parsedSceneId) ? parsedSceneId : index + 1,
    text,
  };
}

/**
 * Resolve the narration blocks used by the normal audio worker.
 *
 * Regular and mixed stories persist normalized `scenes` rows. Graphic novels
 * intentionally persist page-ordered narration in the legacy `stories.scenes`
 * JSON text manifest, because their visual rows live in graphic-novel tables.
 */
export function resolveStoryAudioScenes(input: {
  normalizedScenes: readonly SceneLike[];
  embeddedScenes: unknown;
  fullText: string | null | undefined;
}): StoryAudioScene[] {
  const normalized = input.normalizedScenes
    .map(normalizeScene)
    .filter((scene): scene is StoryAudioScene => scene !== null);
  if (normalized.length > 0) return normalized;

  const embedded = Array.isArray(input.embeddedScenes)
    ? input.embeddedScenes
        .map((scene, index) => normalizeScene((scene ?? {}) as SceneLike, index))
        .filter((scene): scene is StoryAudioScene => scene !== null)
    : [];
  if (embedded.length > 0) return embedded;

  const fullText = typeof input.fullText === 'string' ? stripForAudio(input.fullText).trim() : '';
  return fullText ? [{ sceneId: 1, text: fullText }] : [];
}
