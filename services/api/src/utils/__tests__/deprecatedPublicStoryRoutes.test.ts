import assert from 'node:assert/strict';
import {
  LEGACY_PUBLIC_STORIES_SUCCESSOR,
  LEGACY_PUBLIC_STORIES_SUNSET,
  setLegacyPublicStoriesDeprecationHeaders,
} from '../deprecatedPublicStoryRoutes';

const headers = new Map<string, string>();
const fakeResponse = {
  setHeader(name: string, value: string) {
    headers.set(name, value);
  },
};

setLegacyPublicStoriesDeprecationHeaders(fakeResponse);
assert.equal(headers.get('Deprecation'), 'true');
assert.equal(headers.get('Sunset'), LEGACY_PUBLIC_STORIES_SUNSET);
assert.equal(headers.get('Link'), `<${LEGACY_PUBLIC_STORIES_SUCCESSOR}>; rel="successor-version"`);
assert.equal(headers.get('X-Deprecated-Endpoint'), `Use ${LEGACY_PUBLIC_STORIES_SUCCESSOR}`);

headers.clear();
setLegacyPublicStoriesDeprecationHeaders(fakeResponse, '/api/v1/public/stories/moonlit-garden');
assert.equal(headers.get('Link'), '</api/v1/public/stories/moonlit-garden>; rel="successor-version"');
assert.equal(headers.get('X-Deprecated-Endpoint'), 'Use /api/v1/public/stories/moonlit-garden');

console.log('deprecatedPublicStoryRoutes tests passed');
