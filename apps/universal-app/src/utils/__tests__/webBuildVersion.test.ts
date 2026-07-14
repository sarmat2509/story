import assert from 'node:assert/strict';
import {
  WEB_BUILD_CHECK_INTERVAL_MS,
  shouldReloadForWebBuild,
} from '../webBuildVersion';

assert.equal(WEB_BUILD_CHECK_INTERVAL_MS, 5 * 60 * 1000);
assert.equal(shouldReloadForWebBuild('build-a', 'build-b'), true);
assert.equal(shouldReloadForWebBuild('build-a', 'build-a'), false);
assert.equal(shouldReloadForWebBuild(null, 'build-b'), false);
assert.equal(shouldReloadForWebBuild('__WT_WEB_BUILD_ID__', 'build-b'), false);

console.log('web build version tests passed');
