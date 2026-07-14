import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const srcRoot = resolve(process.cwd(), 'src');
const appSource = readFileSync(resolve(srcRoot, 'App.tsx'), 'utf8');
const resetSource = readFileSync(resolve(srcRoot, 'utils/navigationScrollReset.ts'), 'utf8');

assert.match(
  appSource,
  /lastScrollResetRouteKeyRef\.current === routeKey/,
  'navigation should reset scrolling only when the active route changes'
);
assert.match(
  appSource,
  /onStateChange=\{\(state\) => \{[\s\S]*resetScrollOnRouteChange\(\);[\s\S]*trackNavigation\(\);/,
  'every completed navigation state change should reset the newly focused screen'
);
assert.match(
  resetSource,
  /window\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\)/,
  'document scrolling should jump to the top without animation'
);
assert.match(
  resetSource,
  /querySelectorAll<HTMLElement>\('div, main, section, article'\)[\s\S]*element\.scrollTop = 0/,
  'React Native Web ScrollView and FlatList containers should also reset'
);
assert.match(
  resetSource,
  /resetVisibleScrollContainers\(\);[\s\S]*requestAnimationFrame\(resetVisibleScrollContainers\)/,
  'scrolling should reset immediately and again after the new screen is painted'
);

console.log('navigation scroll-reset regression guards passed');
