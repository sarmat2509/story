import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const viewerSource = readFileSync(
  resolve(process.cwd(), 'src/screens/story/StoryViewerScreen.tsx'),
  'utf8'
);
const bottomSheetSource = readFileSync(
  resolve(process.cwd(), 'src/components/StoryBottomSheet.tsx'),
  'utf8'
);
const storiesSource = readFileSync(
  resolve(process.cwd(), 'src/components/StoryBottomSheet.stories.tsx'),
  'utf8'
);

assert.match(
  viewerSource,
  /function sceneHasArtifactMarker[\s\S]*textSegments[\s\S]*type === 'artifact'/,
  'artifact availability must be derived from markers in the story text'
);
assert.match(
  viewerSource,
  /\{charactersSection\}[\s\S]*hasArtifactInStoryText[\s\S]*testID="story-artifact-claim"/,
  'the artifact CTA must appear immediately after the characters section in the desktop sidebar'
);
assert.match(
  viewerSource,
  /isArtifactAlreadyCollected[\s\S]*artifact_show[\s\S]*handleOpenArtifactsChest/,
  'a collected artifact must use the show action instead of collecting it again'
);
assert.match(
  viewerSource,
  /!story\?\.isPublished \? \([\s\S]*testID="story-publish-action"[\s\S]*style=\{styles\.unpublishedPublicationAction\}[\s\S]*\) : \([\s\S]*<View style=\{styles\.publicationSection\}>/,
  'unpublished desktop stories must render Publish outside the publication wrapper'
);
assert.match(
  bottomSheetSource,
  /!story\?\.isPublished \? \([\s\S]*testID="story-publish-action"[\s\S]*\) : \(onPublish \|\| onShare\) \? \([\s\S]*<View style=\{styles\.publicationSection\}>/,
  'unpublished stories in the bottom sheet must render Publish outside the publication wrapper'
);
assert.match(storiesSource, /export const Unpublished/, 'Storybook must cover unpublished stories');
assert.match(storiesSource, /export const Published/, 'Storybook must cover catalog publication');
assert.match(
  storiesSource,
  /export const PublishedUnlisted[\s\S]*visibility: 'unlisted'/,
  'Storybook must cover link-only publication'
);

console.log('story artifact and publication layout contract passed');
