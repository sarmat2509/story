import assert from 'node:assert/strict';
import {
  evaluateSceneImageGenerationAccess,
  getAllowedIllustrationSceneIds,
} from '../imageStoryLimitService';

assert.deepStrictEqual(
  getAllowedIllustrationSceneIds({
    totalScenes: 6,
    imagesPerStory: 3,
    useDirectorFlow: false,
  }),
  [1, 3, 5],
  'standard image selection is capped by images_per_story'
);

assert.deepStrictEqual(
  getAllowedIllustrationSceneIds({
    totalScenes: 6,
    imagesPerStory: 3,
    useDirectorFlow: true,
  }),
  [1, 3, 5],
  'director image selection is capped by images_per_story'
);

assert.deepStrictEqual(
  getAllowedIllustrationSceneIds({
    totalScenes: 2,
    imagesPerStory: 5,
    useDirectorFlow: false,
  }),
  [1, 2],
  'allowed scene IDs are unique when a plan limit is larger than the scene count'
);

assert.deepStrictEqual(
  evaluateSceneImageGenerationAccess({
    sceneId: 2,
    totalScenes: 6,
    imagesPerStory: 3,
    existingImageSceneIds: [1, 3, 5],
    useDirectorFlow: false,
  }),
  {
    allowed: false,
    statusCode: 429,
    code: 'IMAGES_PER_STORY_LIMIT_EXCEEDED',
    message: 'This scene is outside your plan image allowance for this story',
    featureSlug: 'images_per_story',
    limit: 3,
    used: 3,
    allowedSceneIds: [1, 3, 5],
  },
  'direct scene regeneration cannot add images outside the plan-selected scene IDs'
);

assert.deepStrictEqual(
  evaluateSceneImageGenerationAccess({
    sceneId: 3,
    totalScenes: 6,
    imagesPerStory: 3,
    existingImageSceneIds: [1, 3, 5],
    useDirectorFlow: false,
  }),
  {
    allowed: true,
    allowedSceneIds: [1, 3, 5],
  },
  'regenerating an existing in-plan image is allowed'
);

assert.deepStrictEqual(
  evaluateSceneImageGenerationAccess({
    sceneId: 5,
    totalScenes: 6,
    imagesPerStory: 3,
    existingImageSceneIds: [1, 3],
    useDirectorFlow: false,
  }),
  {
    allowed: true,
    allowedSceneIds: [1, 3, 5],
  },
  'retrying a failed in-plan scene is allowed when the story is still below the image cap'
);

assert.deepStrictEqual(
  evaluateSceneImageGenerationAccess({
    sceneId: 1,
    totalScenes: 6,
    imagesPerStory: 0,
    existingImageSceneIds: [],
    useDirectorFlow: false,
  }),
  {
    allowed: false,
    statusCode: 403,
    code: 'IMAGE_GENERATION_NOT_AVAILABLE',
    message: 'Image generation is not available in your plan',
    featureSlug: 'images_per_story',
    limit: 0,
    used: 0,
    allowedSceneIds: [],
  },
  'zero-image plans cannot queue direct image regeneration'
);

console.log('imageStoryLimitService tests passed');
