import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const switcherSource = readFileSync(
  resolve(process.cwd(), 'src/navigation/ChildProfileSwitcher.tsx'),
  'utf8'
);
const drawerSource = readFileSync(
  resolve(process.cwd(), 'src/navigation/CollapsibleDrawerContent.tsx'),
  'utf8'
);

assert.match(
  switcherSource,
  /useChildren\(!isChildSession && shouldLoadSwitcherChildren\)/,
  'parent navigation must load all children, including profiles without Child Mode enabled'
);
assert.match(
  switcherSource,
  /const displayedChild = freshActiveChild \?\? allChildrenData\?\.children\[0\] \?\? children\[0\] \?\? null/,
  'the active child must win, with the first child as the parent-session fallback'
);
assert.match(
  switcherSource,
  /const fallbackInitial = displayedChild\?\.name\.trim\(\)[\s\S]*toLocaleUpperCase\(\)/,
  'the avatar fallback must come from the child name'
);
assert.match(
  switcherSource,
  /const triggerAvatarUrl = avatarUrl \?\? \(displayedChild \? null : fallbackAvatarUrl\)/,
  'the parent avatar must not replace a missing child avatar'
);
assert.match(
  switcherSource,
  /<Text style=\{styles\.avatarInitial\}>\{fallbackInitial\}<\/Text>/,
  'the mobile header must render the child initial'
);
assert.match(
  drawerSource,
  /<Text style=\{styles\.childAvatarInitial\}>\{fallbackInitial\}<\/Text>/,
  'the desktop drawer must render the child initial'
);
assert.ok(
  drawerSource.indexOf('fallbackInitial ?') < drawerSource.indexOf('parentAvatarUrl ?'),
  'the drawer must prefer the child initial over the parent avatar'
);

console.log('child navigation avatar tests passed');
