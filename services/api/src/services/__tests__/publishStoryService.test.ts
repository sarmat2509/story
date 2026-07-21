import assert from 'node:assert/strict';
import { buildUnpublishStoryUpdate } from '../publishStoryService';

assert.deepStrictEqual(
  buildUnpublishStoryUpdate({ showOnHomePage: false }),
  {
    isPublished: false,
    publishedAt: null,
    publishedSlug: null,
    authorDisplayName: null,
    authorType: 'user',
    authorChildProfileId: null,
    visibility: null,
    shareToken: null,
    publishCharacters: false,
  },
  'unpublish should return the story to the private visibility state'
);

assert.deepStrictEqual(
  buildUnpublishStoryUpdate({ showOnHomePage: true }),
  {
    isPublished: false,
    publishedAt: null,
    publishedSlug: null,
    authorDisplayName: null,
    authorType: 'user',
    authorChildProfileId: null,
    visibility: null,
    shareToken: null,
    publishCharacters: false,
    showOnHomePage: false,
  },
  'unpublish should also remove home-page featuring'
);

console.log('publishStoryService tests passed');
